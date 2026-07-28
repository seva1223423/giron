import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { TOTP, Secret } from 'otpauth';
import * as QRCode from 'qrcode';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { is2faLocked, record2faFailure, clear2faFailures } from '../utils/twofaLockout';
import { invalidateAccessTokens } from '../utils/sessionRevocation';
import { encryptSecret, decryptSecret } from '../utils/secretCrypto';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { getSubStatus } from '../utils/subscriptionCheck';
import { foodVisionCache } from '../utils/memCache';


/** Free plan: max body measurement entries returned */
const FREE_MEASUREMENTS_LIMIT = 5;
import { normalizePhone } from '../services/smsService';
import { sendPushToUser } from '../services/pushService';
import { sendPasswordChangedAlert } from '../services/emailService';
import { overPerUserAiRate } from '../utils/perUserRate';

const JWT_ISS = 'giron-api';
const JWT_AUD = 'giron-app';

/** CUID v1 format: starts with 'c', ~25 chars, alphanumeric */
const CUID_RE = /^c[a-z0-9]{20,30}$/;
const isValidId = (id: string | string[]) => CUID_RE.test(String(id));

/** Constant-time OTP comparison — prevents timing-based enumeration of valid digits. */
const otpEquals = (stored: string, input: string): boolean => {
  if (stored.length !== input.length) return false;
  return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(input));
};

/** Prevent TOTP replay attacks: check if code was recently used, then record it. Returns true if replay detected. */
async function isTotpReplay(userId: string, code: string): Promise<boolean> {
  // TOTP window=1 means codes are valid for up to 90 seconds (prev + current + next period)
  const windowMs = 90 * 1000;
  const since = new Date(Date.now() - windowMs);
  const existing = await prisma.usedTotpCode.findFirst({
    where: { userId, code, usedAt: { gte: since } },
    select: { id: true },
  });
  if (existing) return true;
  // Record this code as used
  await prisma.usedTotpCode.create({ data: { userId, code } });
  return false;
}

/** Issue new access + refresh tokens after revoking all old sessions for the user.
 * Refresh token is stored as SHA-256 hash so a DB read can't be exchanged
 * for a session at /auth/refresh. Sec audit 2026-04: HIGH-5. */
async function reissueTokens(userId: string, req: AuthRequest): Promise<{ token: string; refreshToken: string }> {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '15m', issuer: JWT_ISS, audience: JWT_AUD });
  const rawRefresh = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '30d', issuer: JWT_ISS, audience: JWT_AUD });
  const ip = (req as any).ip ?? null;
  const userAgent = req.headers['user-agent'] ?? null;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const tokenHash = crypto.createHash('sha256').update(rawRefresh).digest('hex');
  await prisma.refreshToken.create({ data: { token: tokenHash, userId, expiresAt, ip, userAgent } });
  return { token, refreshToken: rawRefresh };
}

const router = Router();

const MAX_OTP_ATTEMPTS = 5;

// Explicit select to keep password hash, TOTP secret, backup codes, admin note,
// ban reason, loginAttempts, lockedUntil out of /profile responses.
const USER_PROFILE_SELECT = {
  id: true, email: true, phone: true,
  emailVerified: true, phoneVerified: true,
  firstName: true, lastName: true,
  dateOfBirth: true, gender: true,
  heightCm: true, weightKg: true, goal: true,
  fitnessLevel: true, trainingExperienceYears: true, avatarUrl: true,
  role: true, gymId: true, weekPlan: true,
  targetCalories: true, targetProtein: true, targetFats: true, targetCarbs: true, targetWaterMl: true,
  totpEnabled: true,
  isBanned: true, bannedAt: true,
  createdAt: true, updatedAt: true,
  // Retention flags exposed to the client so the AI screen's
  // FirstPromptCta can detect "user registered but never engaged" via
  // firstChatAt being null. lastActiveAt isn't strictly needed on the
  // client today but exposing it now avoids a follow-up profile-fetch
  // shape change when banner-style nudges show up.
  firstChatAt: true,
  lastActiveAt: true,
  googleId: true, vkId: true, yandexId: true,
  healthRestrictions: true,
} as const;

const strongPassword = z
  .string()
  .min(8, 'Пароль минимум 8 символов')
  .refine((p) => /[A-Z]/.test(p), { message: 'Пароль должен содержать хотя бы одну заглавную букву' })
  .refine((p) => /[a-z]/.test(p), { message: 'Пароль должен содержать хотя бы одну строчную букву' })
  .refine((p) => /[0-9]/.test(p), { message: 'Пароль должен содержать хотя бы одну цифру' });

const weightSchema = z.object({
  weightKg: z.number().finite().min(20, 'Вес не может быть менее 20 кг').max(400, 'Вес не может быть более 400 кг'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате YYYY-MM-DD').refine((d) => !isNaN(Date.parse(d + 'T00:00:00Z')), 'Некорректная дата'),
});

// Get profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: USER_PROFILE_SELECT,
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const { googleId, vkId, yandexId, ...safeProfile } = user;
    res.json({
      ...safeProfile,
      hasVk: !!vkId,
      hasYandex: !!yandexId,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения профиля' });
  }
});

// Update profile
router.patch('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const allowedFields = [
      'firstName', 'lastName', 'dateOfBirth', 'gender',
      'heightCm', 'weightKg', 'goal', 'fitnessLevel',
      'trainingExperienceYears', 'avatarUrl',
    ];

    const profileUpdateSchema = z.object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().max(100).optional(),
      dateOfBirth: z.string().refine((d) => !isNaN(Date.parse(d)), 'Некорректная дата').optional(),
      gender: z.string().transform(v => v.toUpperCase()).pipe(z.enum(['MALE', 'FEMALE'])).optional(),
      heightCm: z.number().finite().min(50).max(300).optional(),
      weightKg: z.number().finite().min(20).max(400).optional(),
      goal: z.string().transform(v => v.toUpperCase()).pipe(
        z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'STRENGTH', 'ENDURANCE', 'FLEXIBILITY', 'GENERAL_FITNESS'])
      ).optional(),
      fitnessLevel: z.string().transform(v => v.toUpperCase()).pipe(
        z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'])
      ).optional(),
      trainingExperienceYears: z.number().int().finite().min(0).max(80).optional(),
      avatarUrl: z.string().url('Некорректный URL').max(2048).refine((u) => u.startsWith('https://'), 'URL должен использовать HTTPS').optional(),
    });

    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
    }

    const data: Record<string, any> = { ...parsed.data };

    if (data.dateOfBirth) {
      data.dateOfBirth = new Date(data.dateOfBirth);
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: USER_PROFILE_SELECT,
    });

    // Audit: gender / weightKg / goal are baked into the food-vision
    // system prompt (rule "Пользователь: ${userInfo}"). Without
    // invalidating foodVisionCache here, a user who switches goal
    // from MUSCLE_GAIN to WEIGHT_LOSS and re-scans the same plate
    // within 24h still gets the old "набор массы" framing in the AI
    // response. Mirrors the AIMemory invalidation path
    // (aiMemoryService.invalidateFoodVisionForUser).
    const visionRelevantField = ['gender', 'weightKg', 'goal'].some((f) => f in data);
    if (visionRelevantField) {
      try { foodVisionCache.deletePrefix(`${req.userId}:`); } catch { /* best-effort */ }
    }

    const { googleId, vkId, yandexId, ...safeProfile } = user;
    res.json({ ...safeProfile, hasVk: !!vkId, hasYandex: !!yandexId });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Пользователь не найден' });
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления профиля' });
  }
});

/**
 * POST /user/onboarding/step — record that the authenticated user reached
 * onboarding step N. Called by OnboardingScreen as the user advances; the
 * server stores first-touch timestamps so admin metrics can compute
 * step-by-step drop-off without instrumenting an event pipeline.
 *
 *   step 0 — gender selected
 *   step 1 — body data submitted (height/weight/age)
 *   step 2 — training goal selected
 *   step 3 — fitness level selected
 *   step 4 — training days selected (final = onboarding complete)
 *
 * Body: { step: 0..4 }
 *
 * Behaviour notes:
 *   - First-touch only: a step's timestamp is set at most once. Idempotent
 *     re-submissions are silently absorbed so a flaky client retry doesn't
 *     reshape the funnel data.
 *   - Step 4 also stamps onboardingCompletedAt for the cohort filter.
 *   - The endpoint is best-effort from the client's perspective: failures
 *     are logged but the client should not block the user from progressing.
 */
router.post('/onboarding/step', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({
      step: z.number().int().min(0).max(4),
    }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректный шаг онбординга' });
    }
    const { step } = parsed.data;
    const now = new Date();

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { onboardingStepLog: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    // First-touch only — preserve the original timestamp if the step was
    // already recorded. Defending against client retries / replays that
    // would otherwise inflate later steps' timestamps.
    const log = (user.onboardingStepLog ?? {}) as Record<string, string>;
    const key = String(step);
    if (log[key]) {
      return res.json({ ok: true, alreadyRecorded: true });
    }
    log[key] = now.toISOString();

    const data: Record<string, any> = { onboardingStepLog: log };
    if (step === 4) data.onboardingCompletedAt = now;

    await prisma.user.update({ where: { id: req.userId }, data });
    return res.json({ ok: true, step, recordedAt: now.toISOString() });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Пользователь не найден' });
    logger.error('POST /user/onboarding/step:', e);
    return res.status(500).json({ error: 'Ошибка записи шага онбординга' });
  }
});

// Update nutrition targets (КБЖУ goals)
router.patch('/nutrition-targets', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      calories: z.number().finite().min(500).max(10000).optional(),
      protein: z.number().finite().min(0).max(500).optional(),
      fats: z.number().finite().min(0).max(500).optional(),
      carbs: z.number().finite().min(0).max(1000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const { calories, protein, fats, carbs } = parsed.data;
    const data: Record<string, number> = {};
    if (calories != null) data.targetCalories = calories;
    if (protein != null) data.targetProtein = protein;
    if (fats != null) data.targetFats = fats;
    if (carbs != null) data.targetCarbs = carbs;

    if (Object.keys(data).length === 0) return res.json({ ok: true });

    await prisma.user.update({ where: { id: req.userId }, data });
    res.json({ ok: true, calories, protein, fats, carbs });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Пользователь не найден' });
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сохранения целей КБЖУ' });
  }
});

// Add body weight
router.post('/weight', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = weightSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const { weightKg, date } = parsed.data;
    const record = await prisma.bodyWeight.upsert({
      where: {
        userId_date: {
          userId: req.userId!,
          date: new Date(date),
        },
      },
      update: { weightKg },
      create: {
        userId: req.userId!,
        weightKg,
        date: new Date(date),
      },
    });
    res.json(record);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сохранения веса' });
  }
});

// Get weight history
router.get('/weight', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const records = await prisma.bodyWeight.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
      take: 90,
    });
    res.json(records);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения веса' });
  }
});

// ── Body measurements ──────────────────────────────────────────────────��──────

const measurementSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !isNaN(Date.parse(d + 'T00:00:00Z')), 'Некорректная дата'),
  chest: z.number().finite().min(0).max(300).optional().nullable(),
  waist: z.number().finite().min(0).max(300).optional().nullable(),
  hips: z.number().finite().min(0).max(300).optional().nullable(),
  bicep: z.number().finite().min(0).max(100).optional().nullable(),
  thigh: z.number().finite().min(0).max(200).optional().nullable(),
  calf: z.number().finite().min(0).max(100).optional().nullable(),
  neck: z.number().finite().min(0).max(100).optional().nullable(),
});

router.post('/measurements', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = measurementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { date, ...fields } = parsed.data;
    const record = await prisma.bodyMeasurement.upsert({
      where: { userId_date: { userId: req.userId!, date: new Date(date) } },
      update: fields,
      create: { userId: req.userId!, date: new Date(date), ...fields },
    });
    res.json(record);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сохранения замеров' });
  }
});

router.get('/measurements', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Free plan: cap at FREE_MEASUREMENTS_LIMIT — prevents paywall bypass via direct API call
    const { isPaid } = await getSubStatus(req.userId!);
    const take = isPaid ? 60 : FREE_MEASUREMENTS_LIMIT;
    const records = await prisma.bodyMeasurement.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
      take,
    });
    res.json(records);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения замеров' });
  }
});

router.delete('/measurements/:date', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.params as { date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Некорректная дата. Формат: YYYY-MM-DD' });
    }
    const deleted = await prisma.bodyMeasurement.deleteMany({
      where: { userId: req.userId!, date: new Date(date) },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Замер не найден' });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления замера' });
  }
});

// ── Sleep entries ─────────────────────────────────────────────────────────────

const sleepSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !isNaN(Date.parse(d + 'T00:00:00Z')), 'Некорректная дата'),
  bedtime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  wakeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationHours: z.number().finite().min(0).max(24),
  quality: z.number().int().finite().min(1).max(5).optional().nullable(),
});

router.post('/sleep', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = sleepSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { date, bedtime, wakeTime, durationHours, quality } = parsed.data;
    const entry = await prisma.sleepEntry.upsert({
      where: { userId_date: { userId: req.userId!, date } },
      update: { bedtime, wakeTime, durationHours, quality },
      create: { userId: req.userId!, date, bedtime, wakeTime, durationHours, quality },
    });
    res.json(entry);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сохранения сна' });
  }
});

router.delete('/sleep/:date', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const dateParam = req.params.date as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return res.status(400).json({ error: 'Некорректный формат даты. Используйте YYYY-MM-DD' });
    }
    const deleted = await prisma.sleepEntry.deleteMany({
      where: { userId: req.userId!, date: dateParam },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Запись сна не найдена' });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления записи сна' });
  }
});

router.get('/sleep', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const entries = await prisma.sleepEntry.findMany({
      where: { userId: req.userId! },
      orderBy: { date: 'desc' },
      take: 90,
    });
    res.json(entries);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения данных сна' });
  }
});

// ── Weekly Plan ───────────────────────────────────────────────────────────────
router.get('/week-plan', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { weekPlan: true } });
    res.json(user?.weekPlan ?? {});
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения недельного плана' });
  }
});

router.put('/week-plan', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // WeekPlanEntry: { name, emoji, exercises: string[], type?: string }
    const weekPlanEntrySchema = z.object({
      name: z.string().max(200),
      emoji: z.string().max(10),
      exercises: z.array(z.string().max(200)).max(50),
      type: z.enum(['workout', 'cardio']).optional(),
    });
    const weekPlanSchema = z.record(
      z.string().regex(/^[0-6]$/, 'Ключ должен быть числом 0-6'),
      z.union([weekPlanEntrySchema, z.null()]),
    ).refine((v) => Object.keys(v).length <= 7, 'Не более 7 дней');

    const parsed = weekPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректный формат недельного плана' });
    }
    await prisma.user.update({ where: { id: req.userId! }, data: { weekPlan: parsed.data } });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сохранения недельного плана' });
  }
});

const PASSWORD_HISTORY_DEPTH = 3;

async function checkPasswordHistory(userId: string, newPassword: string): Promise<boolean> {
  // Returns true if newPassword was recently used (reuse detected)
  const recent = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: PASSWORD_HISTORY_DEPTH,
    select: { passwordHash: true },
  });
  for (const entry of recent) {
    if (await bcrypt.compare(newPassword, entry.passwordHash)) return true;
  }
  return false;
}

async function recordPasswordHistory(userId: string, hash: string): Promise<void> {
  await prisma.passwordHistory.create({ data: { userId, passwordHash: hash } });
  // Prune in SQL: keep only the most recent PASSWORD_HISTORY_DEPTH+2 rows for this user.
  // The previous JS pattern fetched up to N+10 rows then issued a separate deleteMany.
  const keep = PASSWORD_HISTORY_DEPTH + 2;
  await prisma.$executeRaw`
    DELETE FROM "PasswordHistory"
    WHERE "userId" = ${userId}
      AND id NOT IN (
        SELECT id FROM "PasswordHistory"
        WHERE "userId" = ${userId}
        ORDER BY "createdAt" DESC
        LIMIT ${keep}
      )
  `;
}

// ── Change password ───────────────────────────────────────────────────────────

router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword, totpCode } = z.object({
      currentPassword: z.string().min(1, 'Введите текущий пароль'),
      newPassword: strongPassword,
      totpCode: z.string().length(6).optional(),
    }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { passwordHash: true, email: true, emailVerified: true, totpEnabled: true, totpSecret: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    // Social-only users don't have a password — they're creating one for the first time
    if (user.passwordHash) {
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Неверный текущий пароль', code: 'WRONG_CURRENT_PASSWORD' });
      }
    }

    // If 2FA is enabled, also require TOTP code
    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) {
        return res.status(400).json({ error: 'Введите код из аутентификатора', code: 'TOTP_REQUIRED' });
      }
      if (is2faLocked(req.userId!)) {
        return res.status(429).json({ error: 'Слишком много неверных кодов. Попробуйте через 15 минут.', code: 'TOTP_LOCKED' });
      }
      const totp = new TOTP({ secret: Secret.fromBase32(decryptSecret(user.totpSecret)), algorithm: 'SHA1', digits: 6, period: 30 });
      if (totp.validate({ token: totpCode, window: 1 }) === null) {
        record2faFailure(req.userId!); // M2: per-account lockout on step-up TOTP brute-force
        return res.status(401).json({ error: 'Неверный код 2FA', code: 'INVALID_TOTP' });
      }
      clear2faFailures(req.userId!);
      if (await isTotpReplay(req.userId!, totpCode)) {
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
    }

    // Check password history
    if (await checkPasswordHistory(req.userId!, newPassword)) {
      return res.status(400).json({ error: `Нельзя использовать один из последних ${PASSWORD_HISTORY_DEPTH} паролей`, code: 'PASSWORD_REUSED' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.userId! }, data: { passwordHash: newHash } });
    await recordPasswordHistory(req.userId!, newHash);

    // Revoke all refresh tokens and trusted devices (security reset after password change)
    await prisma.$transaction([
      prisma.refreshToken.updateMany({ where: { userId: req.userId!, revoked: false }, data: { revoked: true } }),
      prisma.trustedDevice.deleteMany({ where: { userId: req.userId! } }),
    ]);
    await invalidateAccessTokens(req.userId!); // M1: cut off live access tokens after password change

    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'PASSWORD_CHANGE', details: 'method=change_password' } });

    // Send email security alert for password change
    const ip = (req as any).ip ?? 'unknown';
    if (user.email && user.emailVerified) {
      sendPasswordChangedAlert(user.email, ip, new Date()).catch(() => {});
    }
    sendPushToUser(req.userId!, {
      title: 'Пароль изменён',
      body: 'Пароль вашего аккаунта был изменён. Если это не вы — обратитесь в поддержку.',
      data: { url: 'giron://profile/security' },
    }).catch(() => {});

    res.json({ message: 'Пароль успешно изменён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /user/change-password:', e);
    res.status(500).json({ error: 'Ошибка изменения пароля' });
  }
});

// ── Push tokens ──────────────────────────────────────────────────────────────

/** POST /user/push-token — register or update Expo push token for this device */
router.post('/push-token', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { token } = z.object({ token: z.string().min(1).max(200) }).parse(req.body);
    // Sec audit 2026-04: HIGH-10. Validate Expo token shape — rejecting
    // arbitrary strings stops opportunistic registration of bogus tokens.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const { default: Expo } = require('expo-server-sdk') as typeof import('expo-server-sdk');
    if (!Expo.isExpoPushToken(token)) {
      return res.status(400).json({ error: 'Некорректный формат push-токена', code: 'INVALID_PUSH_TOKEN' });
    }
    // Sec audit 2026-04: HIGH-10. Refuse silent reassignment of a token that
    // already belongs to a different user — otherwise any authenticated
    // attacker can submit the victim's push token, hijack notification
    // delivery (DoS the victim's security alerts) and receive their own
    // crafted security pushes on the victim's device (phishing primitive).
    const existing = await prisma.pushToken.findUnique({
      where: { token },
      select: { userId: true },
    });
    if (existing && existing.userId !== req.userId) {
      // Log both sides so the legit owner sees an attempted takeover.
      await prisma.securityEvent.create({
        data: { userId: req.userId!, action: 'PUSH_TOKEN_TAKEOVER_BLOCKED', ip: (req as any).ip ?? null, details: 'attempt' },
      }).catch(() => {});
      await prisma.securityEvent.create({
        data: { userId: existing.userId, action: 'PUSH_TOKEN_TAKEOVER_BLOCKED', ip: (req as any).ip ?? null, details: 'target' },
      }).catch(() => {});
      return res.status(409).json({
        error: 'Этот push-токен уже зарегистрирован под другим аккаунтом. Сначала выйдите из того аккаунта на устройстве.',
        code: 'PUSH_TOKEN_OWNED',
      });
    }
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId: req.userId!, updatedAt: new Date() },
      create: { token, userId: req.userId! },
    });
    res.json({ ok: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /user/push-token:', e);
    res.status(500).json({ error: 'Ошибка регистрации токена' });
  }
});

/** DELETE /user/push-token — remove push token on logout */
router.delete('/push-token', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    await prisma.pushToken.deleteMany({ where: { token, userId: req.userId! } });
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// ── Security events (user's own log) ─────────────────────────────────────────

/** GET /user/security-events — last 30 security events for the authenticated user */
router.get('/security-events', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const events = await prisma.securityEvent.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, action: true, ip: true, userAgent: true, createdAt: true, details: true },
    });
    res.json(events);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка загрузки событий безопасности' });
  }
});

// ── Has password ──────────────────────────────────────────────────────────────

/** GET /user/has-password — returns whether the authenticated user has a password set */
router.get('/has-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { passwordHash: true } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ hasPassword: !!user.passwordHash });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── Sessions (refresh tokens) ─────────────────────────────────────────────────

/** GET /user/sessions — list active sessions for the authenticated user */
router.get('/sessions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.userId!, revoked: false, expiresAt: { gte: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ip: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(sessions);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения сессий' });
  }
});

/** DELETE /user/sessions/:id — revoke a specific session */
router.delete('/sessions/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { id } = req.params as { id: string };
    const session = await prisma.refreshToken.findUnique({ where: { id }, select: { userId: true } });
    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    await prisma.refreshToken.update({ where: { id }, data: { revoked: true } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Сессия не найдена' });
    logger.error(e);
    res.status(500).json({ error: 'Ошибка отзыва сессии' });
  }
});

/** DELETE /user/sessions — revoke all sessions (logout everywhere) */
router.delete('/sessions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.refreshToken.updateMany({ where: { userId: req.userId!, revoked: false }, data: { revoked: true } });
    await invalidateAccessTokens(req.userId!); // M1: "logout everywhere" also kills live access tokens
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'TOKEN_REVOKED', details: 'all_sessions' } });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка выхода из всех устройств' });
  }
});

// ── Trusted devices ───────────────────────────────────────────────────────────

/** GET /user/trusted-devices — list active trusted devices */
router.get('/trusted-devices', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const devices = await prisma.trustedDevice.findMany({
      where: { userId: req.userId!, expiresAt: { gte: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ip: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(devices);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения устройств' });
  }
});

/** DELETE /user/trusted-devices/:id — revoke a specific trusted device */
router.delete('/trusted-devices/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { id } = req.params as { id: string };
    const device = await prisma.trustedDevice.findUnique({ where: { id }, select: { userId: true } });
    if (!device || device.userId !== req.userId) {
      return res.status(404).json({ error: 'Устройство не найдено' });
    }
    await prisma.trustedDevice.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Устройство не найдено' });
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления устройства' });
  }
});

/** DELETE /user/trusted-devices — revoke all trusted devices */
router.delete('/trusted-devices', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.trustedDevice.deleteMany({ where: { userId: req.userId! } });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления устройств' });
  }
});

// ── Two-factor authentication (TOTP) ─────────────────────────────────────────

const APP_NAME = 'Giron';

/** GET /user/2fa/status — returns current 2FA state */
router.get('/2fa/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpEnabled: true, totpSecret: true },
    });
    res.json({ enabled: user?.totpEnabled ?? false, setupPending: !!(user?.totpSecret && !user.totpEnabled) });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения статуса 2FA' });
  }
});

/** POST /user/2fa/setup — generate TOTP secret, return QR code (2FA not enabled until verified) */
router.post('/2fa/setup', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword } = z.object({
      currentPassword: z.string().optional(),
    }).parse(req.body ?? {});

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { email: true, totpEnabled: true, passwordHash: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.totpEnabled) {
      return res.status(400).json({ error: 'Двухфакторная аутентификация уже включена', code: 'TOTP_ALREADY_ENABLED' });
    }

    // Step-up re-auth: a stolen access token must not be enough to bind an attacker's
    // authenticator to the victim's account. Require the current password before setup.
    // Social-only accounts (no passwordHash) are exempt — they are re-authed via OAuth.
    if (user.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Введите текущий пароль', code: 'PASSWORD_REQUIRED' });
      }
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Неверный пароль', code: 'INVALID_PASSWORD' });
      }
    }

    const secret = new Secret();
    const totp = new TOTP({
      issuer: APP_NAME,
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUri = totp.toString();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, { width: 256, margin: 2 });

    // Store secret (unconfirmed — not enabled yet)
    await prisma.user.update({
      where: { id: req.userId! },
      data: { totpSecret: encryptSecret(secret.base32), totpEnabled: false }, // L8: encrypt TOTP seed at rest
    });

    res.json({
      secret: secret.base32,
      otpauthUri,
      qrCodeDataUrl,
      instructions: 'Отсканируйте QR-код в Google Authenticator или Яндекс.Ключ, затем введите 6-значный код для подтверждения.',
    });
  } catch (e) {
    logger.error('POST /user/2fa/setup:', e);
    res.status(500).json({ error: 'Ошибка настройки 2FA' });
  }
});

/** POST /user/2fa/enable — verify TOTP code and enable 2FA */
router.post('/2fa/enable', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpSecret: true, totpEnabled: true },
    });
    if (!user?.totpSecret) {
      return res.status(400).json({ error: 'Сначала настройте 2FA', code: 'TOTP_NOT_SETUP' });
    }
    if (user.totpEnabled) {
      return res.status(400).json({ error: 'Двухфакторная аутентификация уже включена', code: 'TOTP_ALREADY_ENABLED' });
    }

    const totp = new TOTP({ secret: Secret.fromBase32(decryptSecret(user.totpSecret)), algorithm: 'SHA1', digits: 6, period: 30 });
    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return res.status(400).json({ error: 'Неверный код. Проверьте время на устройстве.', code: 'INVALID_TOTP' });
    }
    if (await isTotpReplay(req.userId!, code)) {
      return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
    }

    // Generate 8 single-use backup codes
    const plainCodes: string[] = Array.from({ length: 8 }, () =>
      crypto.randomBytes(10).toString('hex').toUpperCase(), // L9: 20-char hex codes — 80 bits entropy (offline brute-force of a leaked hash now infeasible)
    );
    const backupCodeEntries = plainCodes.map((code) => ({
      hash: crypto.createHash('sha256').update(code).digest('hex'),
      used: false,
    }));

    await prisma.user.update({
      where: { id: req.userId! },
      data: { totpEnabled: true, totpBackupCodes: JSON.stringify(backupCodeEntries) },
    });
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'TOTP_ENABLED' } });

    sendPushToUser(req.userId!, {
      title: 'Двухфакторная аутентификация включена',
      body: 'Ваш аккаунт теперь защищён 2FA. Если это не вы — немедленно смените пароль.',
      data: { url: 'giron://profile/security' },
    }).catch(() => {});

    // Return plaintext backup codes only once — user must save them
    res.json({ ok: true, backupCodes: plainCodes });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /user/2fa/enable:', e);
    res.status(500).json({ error: 'Ошибка включения 2FA' });
  }
});

/** DELETE /user/2fa — disable 2FA.
 *  SECURITY (audit 2026-06-07 L1): disabling the second factor REQUIRES the second factor —
 *  a valid current TOTP code OR an unused backup code. The account password alone must NOT
 *  remove 2FA (its whole purpose is to survive a leaked/phished password). Per-account
 *  lockout (M2) throttles code guessing across IPs; all sessions + access tokens are
 *  revoked on success (a 2FA change is security-sensitive). */
router.delete('/2fa', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (is2faLocked(req.userId!)) {
      return res.status(429).json({ error: 'Слишком много неверных кодов. Попробуйте через 15 минут.', code: 'TOTP_LOCKED' });
    }
    const { code } = z.object({
      code: z.string().min(6).max(20),
    }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpSecret: true, totpEnabled: true, totpBackupCodes: true },
    });
    if (!user?.totpEnabled) {
      return res.status(400).json({ error: '2FA не включена', code: 'TOTP_NOT_ENABLED' });
    }

    // Verify the SECOND factor: a 6-digit TOTP code, or an unused backup code.
    let verified = false;
    if (user.totpSecret && /^\d{6}$/.test(code)) {
      const totp = new TOTP({ secret: Secret.fromBase32(decryptSecret(user.totpSecret)), algorithm: 'SHA1', digits: 6, period: 30 });
      verified = totp.validate({ token: code, window: 1 }) !== null;
      if (verified && await isTotpReplay(req.userId!, code)) {
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
    }
    if (!verified && user.totpBackupCodes) {
      const provided = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
      try {
        const codes: string[] = JSON.parse(user.totpBackupCodes);
        verified = Array.isArray(codes) && codes.includes(provided);
      } catch { /* malformed backup-code blob — treat as no match */ }
    }

    if (!verified) {
      record2faFailure(req.userId!);
      return res.status(401).json({ error: 'Неверный код подтверждения', code: 'VERIFICATION_FAILED' });
    }
    clear2faFailures(req.userId!);

    await prisma.user.update({ where: { id: req.userId! }, data: { totpEnabled: false, totpSecret: null, totpBackupCodes: null } });
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'TOTP_DISABLED' } });
    // A 2FA change is security-sensitive → revoke all sessions AND already-issued access tokens.
    await prisma.refreshToken.updateMany({ where: { userId: req.userId!, revoked: false }, data: { revoked: true } });
    await invalidateAccessTokens(req.userId!);

    res.json({ ok: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('DELETE /user/2fa:', e);
    res.status(500).json({ error: 'Ошибка отключения 2FA' });
  }
});

/** POST /user/2fa/backup-codes — regenerate backup codes (requires current TOTP code) */
router.post('/2fa/backup-codes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpSecret: true, totpEnabled: true },
    });
    if (!user?.totpEnabled || !user.totpSecret) {
      return res.status(400).json({ error: '2FA не включена', code: 'TOTP_NOT_ENABLED' });
    }

    if (is2faLocked(req.userId!)) {
      return res.status(429).json({ error: 'Слишком много неверных кодов. Попробуйте через 15 минут.', code: 'TOTP_LOCKED' });
    }
    const totp = new TOTP({ secret: Secret.fromBase32(decryptSecret(user.totpSecret)), algorithm: 'SHA1', digits: 6, period: 30 });
    if (totp.validate({ token: code, window: 1 }) === null) {
      record2faFailure(req.userId!); // M2: per-account lockout on step-up TOTP brute-force
      return res.status(401).json({ error: 'Неверный код', code: 'INVALID_TOTP' });
    }
    clear2faFailures(req.userId!);
    if (await isTotpReplay(req.userId!, code)) {
      return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
    }

    const plainCodes: string[] = Array.from({ length: 8 }, () =>
      crypto.randomBytes(10).toString('hex').toUpperCase(),
    );
    const backupCodeEntries = plainCodes.map((c) => ({
      hash: crypto.createHash('sha256').update(c).digest('hex'),
      used: false,
    }));

    await prisma.user.update({ where: { id: req.userId! }, data: { totpBackupCodes: JSON.stringify(backupCodeEntries) } });
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'TOTP_ENABLED', details: 'backup_codes_regenerated' } });

    res.json({ ok: true, backupCodes: plainCodes });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /user/2fa/backup-codes:', e);
    res.status(500).json({ error: 'Ошибка регенерации резервных кодов' });
  }
});

// ── Change email ──────────────────────────────────────────────────────────────

/**
 * POST /user/change-email — update email address with OTP verification.
 * Client must first call POST /auth/send-otp with { email: newEmail, purpose: 'email-change' }.
 */
router.post('/change-email', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { email: newEmail, code, totpCode, currentPassword } = z.object({
      // Normalize trim/case/unicode-form so lookups stay consistent across
      // all entry points (sec audit 2026-04: HIGH-14).
      email: z.string().email('Некорректный email').transform((s) => s.trim().toLowerCase().normalize('NFKC')),
      code: z.string().length(6, 'Код должен быть 6 цифр'),
      totpCode: z.string().length(6).optional(),
      // Step-up re-auth required to prevent account-takeover with a stolen
      // access token. The email-change OTP goes to the NEW (attacker-chosen)
      // address, so it adds zero proof of identity. Sec audit 2026-04: HIGH-6.
      currentPassword: z.string().optional(),
    }).parse(req.body);

    // Step-up re-auth (sec audit 2026-04: HIGH-6).
    const userFor2fa = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpEnabled: true, totpSecret: true, passwordHash: true },
    });
    // Password owners must re-type their current password.
    if (userFor2fa?.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Введите текущий пароль', code: 'PASSWORD_REQUIRED' });
      }
      const ok = await bcrypt.compare(currentPassword, userFor2fa.passwordHash);
      if (!ok) {
        await prisma.securityEvent.create({
          data: { userId: req.userId!, action: 'REAUTH_FAILED', ip: (req as any).ip ?? null, details: 'op=change-email' },
        }).catch(() => {});
        return res.status(401).json({ error: 'Неверный пароль', code: 'INVALID_PASSWORD' });
      }
    } else if (!userFor2fa?.totpEnabled) {
      // Social-only account with no 2FA — refuse and direct the user to add
      // a password (or enable 2FA) so a stolen access token can't pivot to
      // a permanent account takeover by re-pointing the email.
      return res.status(403).json({
        error: 'Чтобы сменить email, сначала установите пароль или включите 2FA в настройках безопасности.',
        code: 'STEPUP_REQUIRED',
      });
    }
    // If 2FA is enabled, require TOTP before allowing email change
    if (userFor2fa?.totpEnabled && userFor2fa.totpSecret) {
      if (!totpCode) {
        return res.status(400).json({ error: 'Введите код из аутентификатора', code: 'TOTP_REQUIRED' });
      }
      if (is2faLocked(req.userId!)) {
        return res.status(429).json({ error: 'Слишком много неверных кодов. Попробуйте через 15 минут.', code: 'TOTP_LOCKED' });
      }
      const totp = new TOTP({ secret: Secret.fromBase32(decryptSecret(userFor2fa.totpSecret)), algorithm: 'SHA1', digits: 6, period: 30 });
      if (totp.validate({ token: totpCode, window: 1 }) === null) {
        record2faFailure(req.userId!); // M2: per-account lockout on step-up TOTP brute-force
        return res.status(401).json({ error: 'Неверный код 2FA', code: 'INVALID_TOTP' });
      }
      clear2faFailures(req.userId!);
      if (await isTotpReplay(req.userId!, totpCode)) {
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
    }

    // Find active OTP for new email (purpose: email-change) — validate BEFORE checking availability
    // to prevent email enumeration (attacker can't distinguish 409 from 400 without a valid OTP).
    // SECURITY: Scope by userId — an OTP is only valid for the user it was issued to.
    //
    // Round 234 (security audit): dropped the legacy `{ userId: null }`
    // fallback. The `userId` column has been live for >10 minutes (the
    // OTP TTL), so any unscoped row is either expired or doesn't apply
    // to this `email-change` purpose. Keeping the OR open meant any
    // historical unscoped code for `target@example.com` could still be
    // consumed by ANY logged-in user changing their address to that
    // same email — closes the cross-user OTP-bind gap.
    const activeOtp = await prisma.otpCode.findFirst({
      where: {
        email: newEmail,
        purpose: 'email-change',
        used: false,
        expiresAt: { gte: new Date() },
        userId: req.userId!,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!activeOtp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }
    // Atomic increment with limit guard — prevents concurrent requests from bypassing the attempt cap
    const incResult = await prisma.otpCode.updateMany({
      where: { id: activeOtp.id, attempts: { lt: MAX_OTP_ATTEMPTS }, used: false },
      data: { attempts: { increment: 1 } },
    });
    if (incResult.count === 0) {
      return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', code: 'OTP_BRUTEFORCE' });
    }
    if (!otpEquals(activeOtp.code, code)) {
      const attemptsLeft = MAX_OTP_ATTEMPTS - activeOtp.attempts - 1;
      return res.status(400).json({ error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.', code: 'INVALID_OTP' });
    }
    // Atomic mark-as-used: only the first concurrent request wins; subsequent ones are rejected
    const { count: consumed } = await prisma.otpCode.updateMany({ where: { id: activeOtp.id, used: false }, data: { used: true } });
    if (consumed === 0) {
      return res.status(400).json({ error: 'Код уже был использован', code: 'INVALID_OTP' });
    }

    // Round 234 (security audit): capture the OLD email BEFORE the update
    // so we can notify it post-change. Without this alert, a stolen access
    // token can permanently take over by repointing the email then asking
    // for a password reset — the legitimate owner never sees it happen.
    const userBeforeUpdate = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { email: true },
    });
    const oldEmail = userBeforeUpdate?.email ?? null;

    // Atomically update email — unique constraint violation (P2002) means already taken
    try {
      await prisma.user.update({
        where: { id: req.userId! },
        data: { email: newEmail, emailVerified: true },
      });
    } catch (updateErr: any) {
      if (updateErr?.code === 'P2002') {
        return res.status(409).json({ error: 'Этот email уже используется', code: 'EMAIL_TAKEN' });
      }
      throw updateErr;
    }
    await prisma.$transaction([
      prisma.refreshToken.updateMany({ where: { userId: req.userId!, revoked: false }, data: { revoked: true } }),
      prisma.trustedDevice.deleteMany({ where: { userId: req.userId! } }),
    ]);
    await invalidateAccessTokens(req.userId!); // M1: kill old access tokens; reissueTokens below mints a fresh one for this device
    const { token: newToken, refreshToken: newRefreshToken } = await reissueTokens(req.userId!, req);

    const ip = (req as any).ip ?? null;
    await prisma.securityEvent.create({
      data: { userId: req.userId!, action: 'EMAIL_CHANGED', ip, details: `email=${newEmail}` },
    });

    sendPushToUser(req.userId!, {
      title: 'Email аккаунта изменён',
      body: `К аккаунту привязан новый email. Другие устройства были отключены.`,
      data: { url: 'giron://profile/security' },
    }).catch(() => {});

    // Round 234: alert the OLD email — best-effort, the security boundary
    // is already intact (refresh tokens revoked + trusted devices wiped
    // above), this is the user-facing notification the owner sees in
    // their inbox if they didn't trigger the change.
    if (oldEmail && oldEmail !== newEmail) {
      const { sendEmailChangedAlert } = await import('../services/emailService');
      sendEmailChangedAlert(oldEmail, newEmail, ip ?? 'unknown', new Date()).catch((mailErr) => {
        logger.warn('sendEmailChangedAlert failed (non-blocking):', mailErr);
      });
    }

    res.json({ ok: true, email: newEmail, emailVerified: true, token: newToken, refreshToken: newRefreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    if (e?.code === 'P2002') return res.status(409).json({ error: 'Этот email уже используется', code: 'EMAIL_TAKEN' });
    logger.error('POST /user/change-email:', e);
    res.status(500).json({ error: 'Ошибка смены email' });
  }
});

// ── Change phone ──────────────────────────────────────────────────────────────

/**
 * POST /user/change-phone — update phone number.
 * Requires a valid OTP sent to the new phone via POST /auth/send-otp (purpose: 'phone-change').
 */
router.post('/change-phone', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { phone: rawPhone, code, totpCode, currentPassword } = z.object({
      phone: z.string().min(10, 'Введите номер телефона'),
      code: z.string().length(6, 'Код должен быть 6 цифр'),
      totpCode: z.string().length(6).optional(),
      // Step-up re-auth (sec audit 2026-04: HIGH-6 — same rationale as
      // /change-email; the SMS OTP goes to the new attacker-chosen number).
      currentPassword: z.string().optional(),
    }).parse(req.body);

    const phone = normalizePhone(rawPhone);

    // Step-up re-auth (sec audit 2026-04: HIGH-6).
    const userFor2fa = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpEnabled: true, totpSecret: true, passwordHash: true },
    });
    if (userFor2fa?.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Введите текущий пароль', code: 'PASSWORD_REQUIRED' });
      }
      const ok = await bcrypt.compare(currentPassword, userFor2fa.passwordHash);
      if (!ok) {
        await prisma.securityEvent.create({
          data: { userId: req.userId!, action: 'REAUTH_FAILED', ip: (req as any).ip ?? null, details: 'op=change-phone' },
        }).catch(() => {});
        return res.status(401).json({ error: 'Неверный пароль', code: 'INVALID_PASSWORD' });
      }
    } else if (!userFor2fa?.totpEnabled) {
      return res.status(403).json({
        error: 'Чтобы сменить телефон, сначала установите пароль или включите 2FA в настройках безопасности.',
        code: 'STEPUP_REQUIRED',
      });
    }
    // If 2FA is enabled, require TOTP before allowing phone change
    if (userFor2fa?.totpEnabled && userFor2fa.totpSecret) {
      if (!totpCode) {
        return res.status(400).json({ error: 'Введите код из аутентификатора', code: 'TOTP_REQUIRED' });
      }
      if (is2faLocked(req.userId!)) {
        return res.status(429).json({ error: 'Слишком много неверных кодов. Попробуйте через 15 минут.', code: 'TOTP_LOCKED' });
      }
      const totp = new TOTP({ secret: Secret.fromBase32(decryptSecret(userFor2fa.totpSecret)), algorithm: 'SHA1', digits: 6, period: 30 });
      if (totp.validate({ token: totpCode, window: 1 }) === null) {
        record2faFailure(req.userId!); // M2: per-account lockout on step-up TOTP brute-force
        return res.status(401).json({ error: 'Неверный код 2FA', code: 'INVALID_TOTP' });
      }
      clear2faFailures(req.userId!);
      if (await isTotpReplay(req.userId!, totpCode)) {
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
    }

    // Find active OTP for this phone — validate BEFORE checking availability
    // to prevent phone enumeration (attacker can't distinguish 409 from 400 without a valid OTP).
    // SECURITY: Scope by userId (see /change-email for rationale).
    const activeOtp = await prisma.otpCode.findFirst({
      where: {
        phone,
        purpose: 'phone-change',
        used: false,
        expiresAt: { gte: new Date() },
        OR: [{ userId: req.userId! }, { userId: null }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!activeOtp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }
    // Atomic increment with limit guard — prevents concurrent requests from bypassing the attempt cap
    const incResult = await prisma.otpCode.updateMany({
      where: { id: activeOtp.id, attempts: { lt: MAX_OTP_ATTEMPTS }, used: false },
      data: { attempts: { increment: 1 } },
    });
    if (incResult.count === 0) {
      return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', code: 'OTP_BRUTEFORCE' });
    }
    if (!otpEquals(activeOtp.code, code)) {
      const attemptsLeft = MAX_OTP_ATTEMPTS - activeOtp.attempts - 1;
      return res.status(400).json({ error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.', code: 'INVALID_OTP' });
    }
    // Atomic mark-as-used: only the first concurrent request wins; subsequent ones are rejected
    const { count: consumed } = await prisma.otpCode.updateMany({ where: { id: activeOtp.id, used: false }, data: { used: true } });
    if (consumed === 0) {
      return res.status(400).json({ error: 'Код уже был использован', code: 'INVALID_OTP' });
    }

    // Atomically update phone — unique constraint violation (P2002) means already taken
    try {
      await prisma.user.update({
        where: { id: req.userId! },
        data: { phone, phoneVerified: true },
      });
    } catch (updateErr: any) {
      if (updateErr?.code === 'P2002') {
        return res.status(409).json({ error: 'Этот номер телефона уже используется', code: 'PHONE_TAKEN' });
      }
      throw updateErr;
    }
    await prisma.$transaction([
      prisma.refreshToken.updateMany({ where: { userId: req.userId!, revoked: false }, data: { revoked: true } }),
      prisma.trustedDevice.deleteMany({ where: { userId: req.userId! } }),
    ]);
    await invalidateAccessTokens(req.userId!); // M1: kill old access tokens; reissueTokens below mints a fresh one for this device
    const { token: newToken, refreshToken: newRefreshToken } = await reissueTokens(req.userId!, req);

    const ip = (req as any).ip ?? null;
    await prisma.securityEvent.create({
      data: { userId: req.userId!, action: 'PHONE_CHANGED', ip, details: `phone=${phone}` },
    });

    sendPushToUser(req.userId!, {
      title: 'Номер телефона изменён',
      body: `К аккаунту привязан новый номер. Другие устройства были отключены.`,
      data: { url: 'giron://profile/security' },
    }).catch(() => {});

    res.json({ ok: true, phone, phoneVerified: true, token: newToken, refreshToken: newRefreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    if (e?.code === 'P2002') return res.status(409).json({ error: 'Этот номер уже используется', code: 'PHONE_TAKEN' });
    logger.error('POST /user/change-phone:', e);
    res.status(500).json({ error: 'Ошибка смены номера телефона' });
  }
});

// ── Linked accounts ───────────────────────────────────────────────────────────

/**
 * POST /user/linked-accounts/:provider — link a social provider to the current account.
 * Validates the provider token server-side, checks for conflicts with other accounts,
 * then stores the provider ID on the current user.
 */
router.post('/linked-accounts/:provider', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const provider = z.enum(['yandex', 'vk']).parse(req.params.provider);
    const { accessToken, userId: claimedUserId, currentPassword, totpCode } = z.object({
      accessToken: z.string().min(1, 'accessToken обязателен'),
      userId: z.string().optional(),
      // Step-up re-auth (sec audit 2026-04: HIGH-9). Linking a new social
      // provider creates a permanent additional login channel — without
      // step-up, anyone holding a 15-min access token can attach their own
      // OAuth account and own the victim's account forever.
      currentPassword: z.string().optional(),
      totpCode: z.string().length(6).optional(),
    }).parse(req.body);

    const authUserId = req.userId!;

    // Sec audit 2026-04: HIGH-9. Require at least one step-up factor before
    // linking. Mirrors the /change-email and /change-phone gates.
    const meStepUp = await prisma.user.findUnique({
      where: { id: authUserId },
      select: { passwordHash: true, totpEnabled: true, totpSecret: true },
    });
    if (meStepUp?.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Введите текущий пароль', code: 'PASSWORD_REQUIRED' });
      }
      const ok = await bcrypt.compare(currentPassword, meStepUp.passwordHash);
      if (!ok) {
        await prisma.securityEvent.create({
          data: { userId: authUserId, action: 'REAUTH_FAILED', ip: (req as any).ip ?? null, details: `op=link-${provider}` },
        }).catch(() => {});
        return res.status(401).json({ error: 'Неверный пароль', code: 'INVALID_PASSWORD' });
      }
    } else if (!meStepUp?.totpEnabled) {
      return res.status(403).json({
        error: 'Чтобы привязать новый аккаунт, сначала установите пароль или включите 2FA в настройках безопасности.',
        code: 'STEPUP_REQUIRED',
      });
    }
    if (meStepUp?.totpEnabled && meStepUp.totpSecret) {
      if (!totpCode) {
        return res.status(400).json({ error: 'Введите код из аутентификатора', code: 'TOTP_REQUIRED' });
      }
      if (is2faLocked(authUserId)) {
        return res.status(429).json({ error: 'Слишком много неверных кодов. Попробуйте через 15 минут.', code: 'TOTP_LOCKED' });
      }
      const totp = new TOTP({ secret: Secret.fromBase32(decryptSecret(meStepUp.totpSecret)), algorithm: 'SHA1', digits: 6, period: 30 });
      if (totp.validate({ token: totpCode, window: 1 }) === null) {
        record2faFailure(authUserId); // M2: per-account lockout on step-up TOTP brute-force
        return res.status(401).json({ error: 'Неверный код 2FA', code: 'INVALID_TOTP' });
      }
      clear2faFailures(authUserId);
      if (await isTotpReplay(authUserId, totpCode)) {
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
    }

    let providerId: string;
    let fieldName: 'vkId' | 'yandexId' | 'googleId';

    if (provider === 'vk') {
      if (!process.env.VK_APP_ID) {
        return res.status(503).json({ error: 'VK OAuth не настроен на сервере' });
      }
      let vkUser: any;
      try {
        const params = new URLSearchParams({ fields: 'photo_200', access_token: accessToken, v: '5.199' });
        const resp = await fetch(`https://api.vk.com/method/users.get?${params}`, { signal: AbortSignal.timeout(5000) });
        const data = await resp.json() as any;
        if (data.error) throw new Error(data.error.error_msg);
        vkUser = data.response?.[0];
      } catch (e: any) {
        logger.warn('VK users.get failed (link):', e.message);
        return res.status(401).json({ error: 'Не удалось получить данные из VK', code: 'INVALID_TOKEN' });
      }
      if (!vkUser) return res.status(401).json({ error: 'Пользователь VK не найден', code: 'INVALID_TOKEN' });
      // Verify token owner matches claimed userId (prevents ID spoofing)
      if (claimedUserId && String(vkUser.id) !== String(claimedUserId)) {
        logger.warn(`VK link mismatch: claimed=${claimedUserId} actual=${vkUser.id} ip=${(req as any).ip}`);
        return res.status(401).json({ error: 'Токен VK не совпадает с указанным пользователем', code: 'ID_MISMATCH' });
      }
      fieldName = 'vkId';
      providerId = String(vkUser.id);

    } else if (provider === 'yandex') {
      if (!process.env.YANDEX_CLIENT_ID) {
        return res.status(503).json({ error: 'Yandex OAuth не настроен на сервере' });
      }
      let yandexUser: any;
      try {
        const resp = await fetch('https://login.yandex.ru/info?format=json', {
          headers: { Authorization: `OAuth ${accessToken}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) throw new Error(`Yandex API error: ${resp.status}`);
        yandexUser = await resp.json();
      } catch (e: any) {
        logger.warn('Yandex token validation failed (link):', e.message);
        return res.status(401).json({ error: 'Не удалось проверить Yandex токен', code: 'INVALID_TOKEN' });
      }
      if (!yandexUser?.id) return res.status(401).json({ error: 'Пользователь Яндекса не найден', code: 'INVALID_TOKEN' });
      // Verify token was issued for our app
      if (yandexUser.client_id && yandexUser.client_id !== process.env.YANDEX_CLIENT_ID) {
        logger.warn(`[SECURITY] Yandex link token client_id mismatch: expected=${process.env.YANDEX_CLIENT_ID} got=${yandexUser.client_id}`);
        return res.status(401).json({ error: 'Токен выдан для другого приложения', code: 'WRONG_APP' });
      }
      fieldName = 'yandexId';
      providerId = String(yandexUser.id);

    } else {
      // Exhaustive guard: zod already restricts provider to vk|yandex,
      // but TS can't narrow `let fieldName` after the if-chain. Throw to make
      // the compiler happy and surface a runtime error if the enum changes.
      return res.status(400).json({ error: 'Неподдерживаемый провайдер', code: 'UNSUPPORTED_PROVIDER' });
    }

    // Check the provider ID is not already linked to a DIFFERENT account
    const existing = await prisma.user.findUnique({ where: { [fieldName]: providerId } as any, select: { id: true } });
    if (existing && existing.id !== authUserId) {
      return res.status(409).json({
        error: 'Этот аккаунт уже привязан к другому пользователю',
        code: 'PROVIDER_ALREADY_LINKED',
      });
    }

    // Already linked to the same user — idempotent success
    if (existing && existing.id === authUserId) {
      return res.json({ message: 'Уже привязан' });
    }

    await prisma.user.update({
      where: { id: authUserId },
      data: { [fieldName]: providerId },
    });

    const ip = (req as any).ip ?? null;
    await prisma.securityEvent.create({
      data: { userId: authUserId, action: 'ACCOUNT_UPDATED', ip, details: `linked:${provider}` },
    });

    res.json({ message: `${provider} успешно привязан` });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /user/linked-accounts:', e);
    res.status(500).json({ error: 'Ошибка привязки аккаунта' });
  }
});

/**
 * DELETE /user/linked-accounts/:provider — unlink a social provider from the account.
 * Safety: user must have either a password or another linked provider to log in after unlinking.
 */
router.delete('/linked-accounts/:provider', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const provider = z.enum(['yandex', 'vk']).parse(req.params.provider);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { passwordHash: true, vkId: true, yandexId: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const fieldMap: Record<typeof provider, keyof typeof user> = {
      yandex: 'yandexId',
      vk: 'vkId',
    };

    if (!user[fieldMap[provider]]) {
      return res.status(400).json({ error: `Аккаунт ${provider} не привязан`, code: 'NOT_LINKED' });
    }

    // Ensure user won't lose all login methods
    const otherProviders = (['vk', 'yandex'] as const)
      .filter((p) => p !== provider)
      .filter((p) => !!user[fieldMap[p]]);
    if (!user.passwordHash && otherProviders.length === 0) {
      return res.status(400).json({
        error: 'Нельзя отвязать единственный способ входа. Сначала установите пароль.',
        code: 'LAST_LOGIN_METHOD',
      });
    }

    await prisma.user.update({
      where: { id: req.userId! },
      data: { [fieldMap[provider]]: null },
    });

    const ip = (req as any).ip ?? null;
    await prisma.securityEvent.create({
      data: { userId: req.userId!, action: 'ACCOUNT_UPDATED', ip, details: `unlinked:${provider}` },
    });

    res.json({ ok: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Неверный провайдер' });
    logger.error('DELETE /user/linked-accounts/:provider:', e);
    res.status(500).json({ error: 'Ошибка отвязки аккаунта' });
  }
});

// ── Data export (152-ФЗ / GDPR — right to data portability) ──────────────────

/**
 * GET /user/export — full dump of the authenticated user's data as JSON.
 *
 * Covers the subject-access request obligation under 152-ФЗ ст. 14 (right to
 * know what data is held) and GDPR art. 20 (portability). Excluded on purpose:
 * passwordHash, totpSecret, totpBackupCodes, adminNote — these are internal
 * and not "personal data of the subject" in the portability sense.
 */
router.get('/export', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    // 14 parallel queries, several of them capped at 5000 rows — cheap to
    // request, expensive to serve. Nothing in the client calls this yet, so
    // any traffic here is either a power user or someone hammering it; two a
    // minute is plenty for a genuine data export (audit R29).
    if (overPerUserAiRate(userId, 2)) {
      return res.status(429).json({ error: 'Экспорт можно запрашивать не чаще двух раз в минуту.' });
    }
    // Round 240: bound every list query so a power user with 10K+ workouts
    // doesn't produce a multi-MB synchronous JSON dump that blocks the
    // event loop. Limits chosen to be generous (covers ~5 years of typical
    // training/eating) but stop the worst case. Future: stream NDJSON for
    // unlimited export.
    const EXPORT_LIMIT_LARGE = 5000;
    const EXPORT_LIMIT_MED = 2000;
    const EXPORT_LIMIT_SMALL = 500;
    const [
      user, workouts, meals, bodyWeights, bodyMeasurements, chatMessages,
      aiMemories, savedNews, subscription, cardioSessions, sleepEntries,
      supportTickets, securityEvents, foodScanLogs,
    ] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: USER_PROFILE_SELECT }),
      prisma.workout.findMany({ where: { userId }, include: { exercises: { include: { sets: true } } }, orderBy: { createdAt: 'desc' }, take: EXPORT_LIMIT_LARGE }),
      prisma.meal.findMany({ where: { userId }, include: { items: true }, orderBy: { date: 'desc' }, take: EXPORT_LIMIT_LARGE }),
      prisma.bodyWeight.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: EXPORT_LIMIT_LARGE }),
      prisma.bodyMeasurement.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: EXPORT_LIMIT_MED }),
      prisma.chatMessage.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, take: EXPORT_LIMIT_LARGE }),
      prisma.aIMemory.findMany({ where: { userId }, take: EXPORT_LIMIT_MED }),
      prisma.savedNews.findMany({ where: { userId }, include: { article: true }, take: EXPORT_LIMIT_MED }),
      prisma.subscription.findUnique({ where: { userId } }),
      prisma.cardioSession.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: EXPORT_LIMIT_MED }),
      prisma.sleepEntry.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: EXPORT_LIMIT_MED }),
      prisma.supportTicket.findMany({ where: { userId }, include: { messages: true }, orderBy: { createdAt: 'desc' }, take: EXPORT_LIMIT_SMALL }),
      prisma.securityEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: EXPORT_LIMIT_SMALL }),
      prisma.foodScanLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: EXPORT_LIMIT_MED }),
    ]);

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="giron-export-${userId}-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      format: 'giron/user-export/v1',
      user,
      workouts,
      meals,
      bodyWeights,
      bodyMeasurements,
      chatMessages,
      aiMemories,
      savedNews,
      subscription,
      cardioSessions,
      sleepEntries,
      supportTickets,
      securityEvents,
      foodScanLogs,
    });
  } catch (e) {
    logger.error('GET /user/export:', e);
    res.status(500).json({ error: 'Ошибка экспорта данных' });
  }
});

// ── Delete account ────────────────────────────────────────────────────────────

/**
 * DELETE /user/account — permanently delete the authenticated user's account.
 * Requires password confirmation (or skip if social-only with no password).
 * If 2FA is enabled, also requires a valid TOTP code.
 */
router.delete('/account', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { password, totpCode } = z.object({
      password: z.string().optional(),
      totpCode: z.string().length(6).optional(),
    }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { passwordHash: true, email: true, totpEnabled: true, totpSecret: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    // Sec audit 2026-04: HIGH-7. Account deletion is irreversible (cascade
    // wipes everything). At least one step-up factor is mandatory. Previously
    // a social-only account with no 2FA could be permanently destroyed by
    // anyone holding a 15-minute access token.
    if (!user.passwordHash && !user.totpEnabled) {
      return res.status(403).json({
        error: 'Чтобы удалить аккаунт, сначала установите пароль или включите 2FA в настройках безопасности.',
        code: 'STEPUP_REQUIRED',
      });
    }

    // If user has a password, they must provide it to confirm deletion
    if (user.passwordHash) {
      if (!password) {
        return res.status(400).json({ error: 'Введите пароль для подтверждения удаления', code: 'PASSWORD_REQUIRED' });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Неверный пароль', code: 'WRONG_PASSWORD' });
      }
    }

    // If 2FA is enabled, require TOTP code
    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) {
        return res.status(400).json({ error: 'Введите код из аутентификатора для подтверждения', code: 'TOTP_REQUIRED' });
      }
      if (is2faLocked(req.userId!)) {
        return res.status(429).json({ error: 'Слишком много неверных кодов. Попробуйте через 15 минут.', code: 'TOTP_LOCKED' });
      }
      const totp = new TOTP({ secret: Secret.fromBase32(decryptSecret(user.totpSecret)), algorithm: 'SHA1', digits: 6, period: 30 });
      if (totp.validate({ token: totpCode, window: 1 }) === null) {
        record2faFailure(req.userId!); // M2: per-account lockout on step-up TOTP brute-force
        return res.status(401).json({ error: 'Неверный код 2FA', code: 'INVALID_TOTP' });
      }
      clear2faFailures(req.userId!);
      if (await isTotpReplay(req.userId!, totpCode)) {
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
    }

    // Log before deletion (userId will be gone after cascade delete).
    // 152-ФЗ §3: avoid writing the full email to SecurityEvent.details —
    // the row is keyed by userId already, and we keep this audit trail in
    // a DB that's grep-able by SIEM/admin queries. A redacted form is
    // enough for "what happened" without holding raw PII after the user
    // exercised right-to-erasure.
    const emailLocal = user.email.split('@')[0];
    const emailDomain = user.email.split('@')[1] ?? '';
    const redactedEmail = emailLocal.length <= 2
      ? `***@${emailDomain}`
      : `${emailLocal[0]}***${emailLocal[emailLocal.length - 1]}@${emailDomain}`;
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'ACCOUNT_DELETED', details: `email=${redactedEmail}` } });

    // Round 236 (security audit): final notification BEFORE cascade.
    // After delete, user.email is freed and we have no way to alert the
    // legitimate owner if a stolen token + credentials triggered the
    // destruction. Sent best-effort — SMTP outage doesn't block delete.
    const deleteIp = (req as any).ip ?? 'unknown';
    const { sendAccountDeletedAlert } = await import('../services/emailService');
    await sendAccountDeletedAlert(user.email, deleteIp, new Date()).catch((mailErr) => {
      logger.warn('sendAccountDeletedAlert failed (non-blocking):', mailErr);
    });

    // Cascade delete: Prisma schema has onDelete: Cascade on all user relations
    await prisma.user.delete({ where: { id: req.userId! } });

    // ...but SecurityEvent and OtpCode hold userId as a PLAIN STRING with no
    // relation, so the cascade never reaches them. Up to 200 security rows per
    // person — IP address, device, action details — plus any outstanding OTP
    // codes were surviving account deletion indefinitely, which defeats the
    // right to erasure under 152-ФЗ (audit R32). Deleted explicitly, after the
    // user row is gone so a failure here cannot leave a half-deleted account.
    // The ACCOUNT_DELETED audit row written above goes with them: keeping it
    // would mean keeping the very identifier we were asked to erase.
    await Promise.all([
      prisma.securityEvent.deleteMany({ where: { userId: req.userId! } }),
      prisma.otpCode.deleteMany({ where: { userId: req.userId! } }),
    ]).catch((cleanupErr) => {
      // Non-blocking: the account itself is already gone.
      logger.error('Post-delete cleanup of SecurityEvent/OtpCode failed:', cleanupErr);
    });

    res.json({ message: 'Аккаунт удалён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('DELETE /user/account:', e);
    res.status(500).json({ error: 'Ошибка удаления аккаунта' });
  }
});

export { router as userRouter };
