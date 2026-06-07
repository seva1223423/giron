/**
 * Health / Smartwatch integration routes — round 240 (Phase A).
 *
 * 5 endpoints for the new "Profile → Здоровье и часы" screen. The client
 * adapter layer (HealthKit on iOS, Health Connect on Android, direct BLE
 * for niche vendors) normalizes data into a unified payload shape and
 * POSTs it to `/user/health/sync` in batches. The endpoints below own:
 *
 *   POST   /user/health/sync       — bulk ingest cardio + sleep + samples
 *   GET    /user/health/summary    — daily/weekly aggregates for the UI
 *   GET    /user/devices           — list paired devices
 *   POST   /user/devices           — pair (idempotent on kind+externalId)
 *   DELETE /user/devices/:id       — unpair
 *
 * Idempotency: CardioSession + SleepEntry have a unique `(userId,
 * externalId)` constraint so the watch can re-sync the same workout
 * arbitrarily many times — second-and-later writes hit `skipDuplicates`.
 * HealthSample dedupes on `(userId, kind, startAt, externalId)`.
 *
 * Auth: `authenticate` middleware on every route. The client never sends
 * `userId` in the body — it's pulled from the JWT (HIGH-1 from the
 * security baseline).
 *
 * Rate limits: applied at the `/user` mount in `index.ts` via
 * `userRateLimiter`. The sync endpoint additionally caps payload size
 * (2000 items per array) inside the Zod schema below — real watches
 * push much smaller batches, anything bigger is either abuse or a bug.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

// ─── Common validators ───────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const DEVICE_SOURCES = ['MANUAL', 'HEALTHKIT', 'HEALTH_CONNECT', 'BLE_DIRECT'] as const;

const dateStr = z.string().regex(DATE_RE, 'Дата YYYY-MM-DD');
const timeStr = z.string().regex(TIME_RE, 'Время HH:MM');
const deviceSource = z.enum(DEVICE_SOURCES);
const externalId = z.string().min(1).max(200);

// GPS track: per-point shape. Cap at 5000 server-side.
const gpsPoint = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  t: z.number().int().finite().min(0), // unix-ms or offset-ms from start
  ele: z.number().finite().min(-500).max(9000).optional(), // elevation (m)
});
const gpsTrack = z.array(gpsPoint).max(5000, 'GPS трек не более 5000 точек');

// Time-in-zone in minutes per HR zone.
const hrZones = z.object({
  z1: z.number().finite().min(0).max(1440).optional(),
  z2: z.number().finite().min(0).max(1440).optional(),
  z3: z.number().finite().min(0).max(1440).optional(),
  z4: z.number().finite().min(0).max(1440).optional(),
  z5: z.number().finite().min(0).max(1440).optional(),
}).strict();

// Sleep stages in minutes.
const sleepStages = z.object({
  rem: z.number().finite().min(0).max(1440).optional(),
  deep: z.number().finite().min(0).max(1440).optional(),
  light: z.number().finite().min(0).max(1440).optional(),
  awake: z.number().finite().min(0).max(1440).optional(),
}).strict();

// ─── Per-record schemas ──────────────────────────────────────────────────────

const cardioRecord = z.object({
  type: z.enum(['running', 'cycling', 'swimming', 'walking', 'hiit', 'elliptical', 'rowing', 'other']),
  date: dateStr,
  durationMinutes: z.number().int().finite().min(1).max(1440),
  distanceKm: z.number().finite().min(0).max(500).optional().nullable(),
  caloriesBurned: z.number().int().finite().min(0).max(50000).optional().nullable(),
  avgHeartRate: z.number().int().finite().min(30).max(250).optional().nullable(),
  maxHeartRate: z.number().int().finite().min(30).max(250).optional().nullable(),
  minHeartRate: z.number().int().finite().min(20).max(200).optional().nullable(),
  hrZones: hrZones.optional().nullable(),
  gpsTrack: gpsTrack.optional().nullable(),
  vo2Max: z.number().finite().min(10).max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  deviceSource: deviceSource.optional().default('MANUAL'),
  externalId: externalId.optional().nullable(),
});

const sleepRecord = z.object({
  date: dateStr,
  bedtime: timeStr,
  wakeTime: timeStr,
  durationHours: z.number().finite().min(0).max(24),
  quality: z.number().int().finite().min(1).max(5).optional().nullable(),
  stages: sleepStages.optional().nullable(),
  spo2Avg: z.number().finite().min(50).max(100).optional().nullable(),
  spo2Min: z.number().finite().min(50).max(100).optional().nullable(),
  awakenings: z.number().int().finite().min(0).max(100).optional().nullable(),
  hrvAvg: z.number().finite().min(1).max(200).optional().nullable(),
  deviceSource: deviceSource.optional().default('MANUAL'),
  externalId: externalId.optional().nullable(),
});

const sampleRecord = z.object({
  kind: z.enum(['hr', 'spo2', 'hrv', 'stress', 'bodyTemp', 'cycleEvent', 'vo2max', 'restingHr', 'steps']),
  value: z.number().finite(),
  unit: z.string().min(1).max(20),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional().nullable(),
  source: deviceSource,
  externalId: externalId.optional().nullable(),
});

// ─── POST /user/health/sync — bulk ingest from a watch sync ──────────────────

const syncSchema = z.object({
  cardio: z.array(cardioRecord).max(2000).optional().default([]),
  sleep: z.array(sleepRecord).max(2000).optional().default([]),
  samples: z.array(sampleRecord).max(2000).optional().default([]),
});

// Audit 2026-05-29 (H6): rows synced without a device externalId previously
// stored externalId=null. Postgres treats NULL as distinct under a UNIQUE
// constraint, so the (userId, externalId) / (userId, kind, startAt, externalId)
// dedupe never fired for them — a retried sync (offline replay, double-tap)
// silently inserted duplicate cardio sessions and samples. Derive a
// deterministic 'local:'-namespaced key from the row's identifying content so
// skipDuplicates dedupes re-submissions of the same entry. (Sleep is already
// covered by its separate @@unique(userId, date), so it keeps null.)
const localKey = (parts: Array<string | number | null | undefined>): string =>
  'local:' + parts.map((p) => (p ?? '')).join('|');

router.post('/health/sync', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
    }
    const { cardio, sleep, samples } = parsed.data;

    // Cardio: createMany skipDuplicates relies on the @@unique(userId,
    // externalId) constraint. Rows without externalId still write — only
    // explicit duplicates are skipped.
    let cardioCreated = 0;
    if (cardio.length > 0) {
      const result = await prisma.cardioSession.createMany({
        data: cardio.map((c) => ({
          userId,
          type: c.type,
          date: c.date,
          durationMinutes: c.durationMinutes,
          distanceKm: c.distanceKm ?? null,
          caloriesBurned: c.caloriesBurned ?? null,
          avgHeartRate: c.avgHeartRate ?? null,
          maxHeartRate: c.maxHeartRate ?? null,
          minHeartRate: c.minHeartRate ?? null,
          hrZones: c.hrZones ?? Prisma.JsonNull,
          gpsTrack: c.gpsTrack ?? Prisma.JsonNull,
          vo2Max: c.vo2Max ?? null,
          notes: c.notes ?? null,
          deviceSource: c.deviceSource,
          externalId: c.externalId ?? localKey([c.date, c.type, c.durationMinutes, c.distanceKm, c.caloriesBurned]),
        })),
        skipDuplicates: true,
      });
      cardioCreated = result.count;
    }

    // Sleep: same dedupe via @@unique(userId, externalId). The OTHER
    // @@unique(userId, date) means re-syncing today's sleep with a NEW
    // externalId would still fail. Acceptable — sleep is one entry per
    // user per day by design, externalId is just for HK/HC dedupe within
    // a single calendar date.
    let sleepCreated = 0;
    if (sleep.length > 0) {
      const result = await prisma.sleepEntry.createMany({
        data: sleep.map((s) => ({
          userId,
          date: s.date,
          bedtime: s.bedtime,
          wakeTime: s.wakeTime,
          durationHours: s.durationHours,
          quality: s.quality ?? null,
          stages: s.stages ?? Prisma.JsonNull,
          spo2Avg: s.spo2Avg ?? null,
          spo2Min: s.spo2Min ?? null,
          awakenings: s.awakenings ?? null,
          hrvAvg: s.hrvAvg ?? null,
          deviceSource: s.deviceSource,
          externalId: s.externalId ?? null,
        })),
        skipDuplicates: true,
      });
      sleepCreated = result.count;
    }

    let samplesCreated = 0;
    if (samples.length > 0) {
      const result = await prisma.healthSample.createMany({
        data: samples.map((sample) => ({
          userId,
          kind: sample.kind,
          value: sample.value,
          unit: sample.unit,
          startAt: new Date(sample.startAt),
          endAt: sample.endAt ? new Date(sample.endAt) : null,
          source: sample.source,
          externalId: sample.externalId ?? localKey([sample.kind, sample.startAt, sample.value]),
        })),
        skipDuplicates: true,
      });
      samplesCreated = result.count;
    }

    res.json({
      ok: true,
      ingested: {
        cardio: cardioCreated,
        sleep: sleepCreated,
        samples: samplesCreated,
      },
    });
  } catch (e) {
    logger.error('POST /user/health/sync:', e);
    res.status(500).json({ error: 'Ошибка синхронизации с часами' });
  }
});

// ─── GET /user/health/summary — daily/weekly aggregates ──────────────────────

router.get('/health/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const days = Math.min(30, Math.max(1, parseInt(String(req.query.days ?? '1'), 10) || 1));
    const since = new Date(Date.now() - days * 86400_000);
    const todayDate = new Date().toISOString().slice(0, 10);

    // Run independent lookups in parallel — server-side aggregation, single
    // round-trip per Neon. The shape mirrors what HealthScreen + the AI
    // `get_health_summary` tool both consume.
    const [cardioRows, sleepRows, sampleRows] = await Promise.all([
      prisma.cardioSession.findMany({
        where: { userId, createdAt: { gte: since } },
        select: {
          date: true, durationMinutes: true, caloriesBurned: true,
          avgHeartRate: true, maxHeartRate: true, vo2Max: true, deviceSource: true,
        },
      }),
      prisma.sleepEntry.findMany({
        where: { userId, date: { gte: dateNDaysAgo(days) } },
        select: {
          date: true, durationHours: true, quality: true, stages: true,
          spo2Avg: true, hrvAvg: true, awakenings: true,
        },
        orderBy: { date: 'desc' },
        take: days,
      }),
      prisma.healthSample.findMany({
        where: { userId, startAt: { gte: since } },
        select: { kind: true, value: true, unit: true, startAt: true },
        orderBy: { startAt: 'desc' },
        take: 1000, // cap to avoid huge responses on heavy users
      }),
    ]);

    // Resting HR: prefer dedicated `restingHr` samples; fall back to
    // overnight HR p10 if absent. Returned as the 7-day median (or fewer
    // days if user just started syncing).
    const restingHrSamples = sampleRows.filter((s) => s.kind === 'restingHr').map((s) => s.value);
    const restingHrMedian = median(restingHrSamples);

    // Audit 2026-05-29 (HIGH): was `.map().filter().sort().pop()` — a comparator-
    // less .sort() sorts numbers lexicographically ([42,9,55] → 9), so VO2max was
    // wrong. cardioRows has no orderBy, so pick the most-recent reading by date.
    const latestVo2 = cardioRows
      .filter((c) => typeof c.vo2Max === 'number')
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.vo2Max ?? null;

    const latestSpo2 = sampleRows.find((s) => s.kind === 'spo2')?.value ?? null;
    const latestSleep = sleepRows[0] ?? null;

    const todayCardio = cardioRows.filter((c) => c.date === todayDate);
    const todayActiveMin = todayCardio.reduce((sum, c) => sum + c.durationMinutes, 0);
    const todayCalories = todayCardio.reduce((sum, c) => sum + (c.caloriesBurned ?? 0), 0);

    res.json({
      days,
      today: {
        date: todayDate,
        activeMin: todayActiveMin,
        caloriesFromCardio: todayCalories,
      },
      restingHr: restingHrMedian,
      latestVo2Max: latestVo2,
      latestSpo2,
      lastSleep: latestSleep,
      sleepHistory: sleepRows,
      cardioSessions: cardioRows.length,
    });
  } catch (e) {
    logger.error('GET /user/health/summary:', e);
    res.status(500).json({ error: 'Ошибка получения сводки' });
  }
});

// ─── GET /user/health/steps — daily step totals from watch ──────────────────

router.get('/health/steps', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? '30'), 10) || 30));
    // R240 audit H2: timezone alignment. Client (StepsScreen) buckets
    // by LOCAL date via `toLocaleDateString('en-CA')`. Server stored
    // `startAt` as UTC. Without an offset, a 23:30 МСК sample (UTC
    // 20:30) lands in the same UTC day as a 02:30 МСК sample the next
    // local calendar day. Accept the client's timezone offset (in
    // minutes, JS convention: NEGATIVE for east of UTC) and bucket on
    // local-day so the series lines up with the screen.
    const tzOffsetMin = Math.max(-840, Math.min(840, parseInt(String(req.query.tzOffsetMin ?? '0'), 10) || 0));
    const since = new Date(Date.now() - days * 86400_000);

    const samples = await prisma.healthSample.findMany({
      where: { userId, kind: 'steps', startAt: { gte: since } },
      select: { value: true, startAt: true, source: true },
      orderBy: { startAt: 'asc' },
      take: 5000,
    });

    // R240 audit H1: per-day MAX across sources (not SUM). If HC and
    // HK both report steps for the same user, summing inflates the
    // count. Within a single source, summing is correct (one source =
    // one true count split into hourly buckets).
    const bySourceDate = new Map<string, Map<string, number>>(); // date → (source → steps)
    for (const s of samples) {
      // Bucket on client-local day. `getTimezoneOffset()` semantics:
      // returns the offset in minutes FROM local TO UTC. Moscow returns
      // -180 (UTC+3). Local time = UTC - offset = UTC - (-180) = UTC + 180.
      const localMs = s.startAt.getTime() - tzOffsetMin * 60_000;
      const ymd = new Date(localMs).toISOString().slice(0, 10);
      const perSource = bySourceDate.get(ymd) ?? new Map<string, number>();
      perSource.set(s.source, (perSource.get(s.source) ?? 0) + Math.max(0, Math.round(s.value)));
      bySourceDate.set(ymd, perSource);
    }

    const series = Array.from(bySourceDate.entries())
      .map(([date, perSource]) => {
        let max = 0;
        const sources: string[] = [];
        for (const [source, steps] of perSource) {
          if (steps > max) max = steps;
          sources.push(source);
        }
        return { date, steps: max, sources };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ days, tzOffsetMin, series });
  } catch (e) {
    logger.error('GET /user/health/steps:', e);
    res.status(500).json({ error: 'Ошибка получения шагов' });
  }
});

// ─── ConnectedDevice endpoints ───────────────────────────────────────────────

router.get('/devices', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const devices = await prisma.connectedDevice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(devices);
  } catch (e) {
    logger.error('GET /user/devices:', e);
    res.status(500).json({ error: 'Ошибка получения списка устройств' });
  }
});

const pairSchema = z.object({
  kind: z.string().min(1).max(40),
  displayName: z.string().min(1).max(100),
  externalId: externalId,
  capabilities: z.array(z.string().min(1).max(40)).max(20).default([]),
});

router.post('/devices', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const parsed = pairSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
    }
    const { kind, displayName, externalId: extId, capabilities } = parsed.data;

    // Idempotent on (userId, kind, externalId). If the user re-pairs the
    // same Apple Watch after a phone reset, `lastSyncAt` and capabilities
    // get refreshed; the row stays.
    const device = await prisma.connectedDevice.upsert({
      where: {
        userId_kind_externalId: { userId, kind, externalId: extId },
      },
      create: { userId, kind, displayName, externalId: extId, capabilities },
      update: { displayName, capabilities, lastSyncAt: new Date() },
    });
    res.status(201).json(device);
  } catch (e) {
    logger.error('POST /user/devices:', e);
    res.status(500).json({ error: 'Ошибка привязки устройства' });
  }
});

router.delete('/devices/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.length > 50) {
      return res.status(400).json({ error: 'Некорректный id' });
    }
    // Scope by userId so one user can't delete another user's device
    // (defense-in-depth — the auth middleware already binds req.userId
    // to the JWT, but a per-userId WHERE makes the ownership intent
    // explicit at the query layer).
    const result = await prisma.connectedDevice.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      return res.status(404).json({ error: 'Устройство не найдено' });
    }
    res.json({ ok: true });
  } catch (e) {
    logger.error('DELETE /user/devices/:id:', e);
    res.status(500).json({ error: 'Ошибка отвязки устройства' });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2 * 10) / 10
    : sorted[mid];
}

function dateNDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400_000);
  return d.toISOString().slice(0, 10);
}

export { router as healthRouter };
