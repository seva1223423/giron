import { Router, Response } from 'express';
import os from 'os';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { TOTP, Secret } from 'otpauth';
import { prisma } from '../db';
import { authenticate, requireAdmin, requireStaff, AuthRequest } from '../middleware/auth';
import { getActiveUsersCount, getActiveUserIds } from '../utils/activityTracker';
import { getAIMetrics } from '../utils/aiMetrics';
import { logger } from '../utils/logger';
import { adminStatsCache, authUserCache } from '../utils/memCache';
import { getCronHealth } from '../utils/cronHealth';

const router = Router();

// All admin routes require authentication first
router.use(authenticate);

/** Returns true if the Prisma error is "record not found" (P2025) */
const isNotFound = (e: any) => e?.code === 'P2025';

/**
 * Round 261: bounded-concurrency mapper to replace Promise.allSettled
 * over thousands of items. Plain allSettled fans out N parallel writes
 * which overwhelms the Prisma connection pool (default 10 connections,
 * Neon free tier typically 5) and causes transient timeouts that look
 * like silent data loss to the admin.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(slice.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

const CUID_RE = /^c[a-z0-9]{20,30}$/;
const isValidId = (id: string | string[]) => CUID_RE.test(String(id));

/**
 * Step-up re-auth for admin destructive operations (sec audit 2026-04: HIGH-11).
 * A 7-day admin access token alone must NOT be enough to permanently
 * destroy data, promote anyone to ADMIN, force-disable 2FA, or move money
 * (subscription overrides). Acting admin must prove fresh possession of
 * password + TOTP (when set) by passing them in the request body.
 *
 * Returns null on success (caller proceeds). Returns a Response on failure
 * (caller must `return`).
 */
async function requireAdminStepUp(req: AuthRequest, res: Response): Promise<Response | null> {
  const parsed = z.object({
    adminPassword: z.string().optional(),
    adminTotpCode: z.string().length(6).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Некорректное подтверждение администратора', code: 'STEPUP_INVALID' });
  }
  const { adminPassword, adminTotpCode } = parsed.data;
  const me = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { passwordHash: true, totpEnabled: true, totpSecret: true },
  });
  if (!me) return res.status(401).json({ error: 'Сессия недействительна', code: 'NO_USER' });
  if (!me.passwordHash) {
    return res.status(403).json({ error: 'Установите пароль администратора, чтобы выполнять опасные операции.', code: 'ADMIN_STEPUP_PASSWORD_MISSING' });
  }
  if (!adminPassword) {
    return res.status(400).json({ error: 'Введите пароль администратора', code: 'ADMIN_PASSWORD_REQUIRED' });
  }
  const ok = await bcrypt.compare(adminPassword, me.passwordHash);
  if (!ok) {
    await prisma.securityEvent.create({
      data: { userId: req.userId!, action: 'ADMIN_REAUTH_FAILED', ip: (req as any).ip ?? null, details: req.path },
    }).catch(() => {});
    return res.status(401).json({ error: 'Неверный пароль администратора', code: 'INVALID_ADMIN_PASSWORD' });
  }
  if (me.totpEnabled && me.totpSecret) {
    if (!adminTotpCode) {
      return res.status(400).json({ error: 'Введите код 2FA администратора', code: 'ADMIN_TOTP_REQUIRED' });
    }
    const totp = new TOTP({ secret: Secret.fromBase32(me.totpSecret), algorithm: 'SHA1', digits: 6, period: 30 });
    if (totp.validate({ token: adminTotpCode, window: 1 }) === null) {
      return res.status(401).json({ error: 'Неверный код 2FA администратора', code: 'INVALID_ADMIN_TOTP' });
    }
  }
  return null;
}

// ── DASHBOARD STATS ─────────────────────────────────────────────────────────

/** GET /admin/stats — main dashboard data (cached 90s to avoid 35+ DB queries per page load) */
router.get('/stats', requireAdmin, async (req: AuthRequest, res: Response) => {
  // Allow cache bypass for forced refreshes: ?refresh=1
  const bypassCache = req.query.refresh === '1';
  const CACHE_KEY = 'admin:stats';
  const CACHE_TTL_MS = 90 * 1000; // 90 seconds

  if (!bypassCache) {
    const cached = adminStatsCache.get(CACHE_KEY);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
  }

  try {
    const now = new Date();
    // Use UTC day boundaries to avoid server-local-timezone drift
    const todayDateStr = now.toISOString().slice(0, 10);
    const todayStart = new Date(`${todayDateStr}T00:00:00.000Z`);
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000);
    const prevWeekStart = new Date(todayStart.getTime() - 14 * 86_400_000);
    const monthStart = new Date(todayStart.getTime() - 30 * 86_400_000);

    const [
      totalUsers,
      newToday,
      newThisWeek,
      newThisMonth,
      bannedUsers,
      usersByRole,
      subscriptionCounts,
      usersWithActiveSub,
      workoutsToday,
      workoutsThisWeek,
      totalWorkouts,
      aiMessagesToday,
      aiMessagesThisWeek,
      mealsToday,
      mealsThisWeek,
      cardioToday,
      cardioThisWeek,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      newPrevWeek,
      workoutsPrevWeek,
      aiPrevWeek,
      subsExpiringSoon,
      urgentTickets,
      activeAnnouncements,
      overdueTickets,
      churnRiskUsers,
      signupsYesterday,
      workoutsYesterday,
      aiYesterday,
      mealsYesterday,
      cardioYesterday,
      mauWorkoutUsers,
      mauAiUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.user.groupBy({ by: ['role'], _count: { id: true } }),
      prisma.subscription.groupBy({ by: ['plan', 'status'], _count: { id: true } }),
      prisma.subscription.count({ where: { status: 'active', plan: { not: 'free' } } }),
      prisma.workout.count({ where: { completedAt: { gte: todayStart } } }),
      prisma.workout.count({ where: { completedAt: { gte: weekStart } } }),
      prisma.workout.count({ where: { completedAt: { not: null } } }),
      prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: todayStart } } }),
      prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: weekStart } } }),
      prisma.meal.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.meal.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.cardioSession.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.cardioSession.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.supportTicket.count({ where: { status: 'open' } }),
      prisma.supportTicket.count({ where: { status: 'in_progress' } }),
      prisma.supportTicket.count({ where: { status: 'resolved' } }),
      prisma.user.count({ where: { createdAt: { gte: prevWeekStart, lt: weekStart } } }),
      prisma.workout.count({ where: { completedAt: { gte: prevWeekStart, lt: weekStart } } }),
      prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: prevWeekStart, lt: weekStart } } }),
      prisma.subscription.count({ where: { status: 'active', plan: { not: 'free' }, endDate: { gte: now, lte: new Date(now.getTime() + 7 * 86400 * 1000) } } }),
      prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] }, priority: 'urgent' } }),
      prisma.announcement.count({ where: { isActive: true, OR: [{ endsAt: null }, { endsAt: { gte: now } }] } }),
      // Tickets open for > 24h without any staff reply
      prisma.supportTicket.count({ where: { status: 'open', updatedAt: { lt: new Date(now.getTime() - 86400 * 1000) } } }),
      // Paid users with no workout in last 14 days
      prisma.user.count({ where: { isBanned: false, subscription: { status: 'active', plan: { not: 'free' } }, workouts: { none: { completedAt: { gte: new Date(now.getTime() - 14 * 86400 * 1000) } } } } }),
      // Yesterday counts for day-over-day comparison
      prisma.user.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      prisma.workout.count({ where: { completedAt: { gte: yesterdayStart, lt: todayStart } } }),
      prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      prisma.meal.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      prisma.cardioSession.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      // MAU/WAU: distinct active users (workout or AI) in last 30/7 days
      prisma.workout.groupBy({ by: ['userId'], where: { completedAt: { gte: monthStart } } }).then((r) => r.length),
      prisma.chatMessage.groupBy({ by: ['userId'], where: { role: 'user', createdAt: { gte: monthStart } } }).then((r) => r.length),
    ]);

    // Server metrics
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uptime = process.uptime();

    // DB health ping
    let dbPingMs: number | null = null;
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbPingMs = Date.now() - dbStart;
    } catch { dbPingMs = null; }

    // Top active users this week (by workout count) + top AI users + demographics + recent signups + hourly pulse
    const [topUsers, topAiUsers, dauWorkout, dauAi, goalCounts, levelCounts, genderCounts, recentSignups, workoutsTodayRaw, aiTodayRaw] = await Promise.all([
      prisma.workout.groupBy({
        by: ['userId'],
        where: { completedAt: { gte: weekStart } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.chatMessage.groupBy({
        by: ['userId'],
        where: { role: 'user', createdAt: { gte: weekStart } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.workout.groupBy({ by: ['userId'], where: { completedAt: { gte: todayStart } } }).then((r) => r.length),
      prisma.chatMessage.groupBy({ by: ['userId'], where: { role: 'user', createdAt: { gte: todayStart } } }).then((r) => r.length),
      prisma.user.groupBy({ by: ['goal'], where: { goal: { not: null } }, _count: { id: true } }),
      prisma.user.groupBy({ by: ['fitnessLevel'], where: { fitnessLevel: { not: null } }, _count: { id: true } }),
      prisma.user.groupBy({ by: ['gender'], where: { gender: { not: null } }, _count: { id: true } }),
      prisma.user.findMany({
        where: { createdAt: { gte: todayStart } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, firstName: true, lastName: true, email: true, createdAt: true, role: true },
      }),
      // Hourly pulse: aggregate in SQL to avoid loading N individual records into Node.js memory.
      // Returns max 24 rows (one per hour) instead of potentially thousands of records.
      prisma.$queryRaw<Array<{ hour: number; cnt: bigint }>>`
        SELECT EXTRACT(HOUR FROM "completedAt" AT TIME ZONE 'UTC')::int AS hour, COUNT(*)::bigint AS cnt
        FROM "Workout"
        WHERE "completedAt" >= ${todayStart}
        GROUP BY hour
      `,
      prisma.$queryRaw<Array<{ hour: number; cnt: bigint }>>`
        SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'UTC')::int AS hour, COUNT(*)::bigint AS cnt
        FROM "ChatMessage"
        WHERE role = 'user' AND "createdAt" >= ${todayStart}
        GROUP BY hour
      `,
    ]);

    // Build 24-hour activity pulse for today
    const hourlyPulse = new Array(24).fill(0);
    (workoutsTodayRaw as Array<{ hour: number; cnt: bigint }>).forEach(({ hour, cnt }) => {
      hourlyPulse[hour] = (hourlyPulse[hour] || 0) + Number(cnt);
    });
    (aiTodayRaw as Array<{ hour: number; cnt: bigint }>).forEach(({ hour, cnt }) => {
      hourlyPulse[hour] = (hourlyPulse[hour] || 0) + Number(cnt);
    });

    const allTopIds = [...new Set([...topUsers.map((t) => t.userId), ...topAiUsers.map((t) => t.userId)])];
    const topUserDetails = allTopIds.length > 0 ? await prisma.user.findMany({
      where: { id: { in: allTopIds } },
      select: { id: true, firstName: true, lastName: true },
    }) : [];
    const getName = (id: string) => {
      const u = topUserDetails.find((d) => d.id === id);
      return u ? `${u.firstName} ${u.lastName ?? ''}`.trim() : 'Unknown';
    };
    const topActiveUsers = topUsers.map((t) => ({ userId: t.userId, name: getName(t.userId), workouts: t._count.id }));
    const topAiActiveUsers = topAiUsers.map((t) => ({ userId: t.userId, name: getName(t.userId), messages: t._count.id }));

    const aiMetrics = getAIMetrics();
    const activeNow = getActiveUsersCount(5 * 60 * 1000);    // 5 min
    const activeHour = getActiveUsersCount(60 * 60 * 1000);  // 1 hour

    // Fetch names for currently active users (max 10)
    const activeUserIds = getActiveUserIds(5 * 60 * 1000).slice(0, 10);
    const onlineUsers = activeUserIds.length > 0 ? await prisma.user.findMany({
      where: { id: { in: activeUserIds } },
      select: { id: true, firstName: true, lastName: true, role: true },
    }) : [];

    const statsPayload = {
      users: {
        total: totalUsers,
        newToday,
        newThisWeek,
        newThisMonth,
        activeNow,
        activeHour,
        banned: bannedUsers,
        withSubscription: usersWithActiveSub,
        withoutSubscription: totalUsers - usersWithActiveSub,
        byRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count.id])),
      },
      subscriptions: subscriptionCounts.map((s) => ({
        plan: s.plan,
        status: s.status,
        count: s._count.id,
      })),
      subsExpiringSoon,
      trends: {
        usersWeekVsPrev: newPrevWeek > 0 ? Math.round(((newThisWeek - newPrevWeek) / newPrevWeek) * 100) : null,
        workoutsWeekVsPrev: workoutsPrevWeek > 0 ? Math.round(((workoutsThisWeek - workoutsPrevWeek) / workoutsPrevWeek) * 100) : null,
        aiWeekVsPrev: aiPrevWeek > 0 ? Math.round(((aiMessagesThisWeek - aiPrevWeek) / aiPrevWeek) * 100) : null,
      },
      workouts: {
        completedToday: workoutsToday,
        completedThisWeek: workoutsThisWeek,
        total: totalWorkouts,
      },
      nutrition: {
        mealsToday,
        mealsThisWeek,
      },
      cardio: {
        sessionsToday: cardioToday,
        sessionsThisWeek: cardioThisWeek,
      },
      ai: {
        messagesToday: aiMessagesToday,
        messagesThisWeek: aiMessagesThisWeek,
        ...aiMetrics,
      },
      support: {
        openTickets,
        inProgressTickets,
        resolvedTickets,
        urgentTickets,
        overdueTickets,
      },
      activeAnnouncements,
      churnRiskUsers,
      topActiveUsers,
      topAiActiveUsers,
      dau: { workoutUsers: dauWorkout, aiUsers: dauAi },
      mau: { workoutUsers: mauWorkoutUsers, aiUsers: mauAiUsers },
      recentSignups,
      onlineUsers,
      todayVsYesterday: {
        signups: { today: newToday, yesterday: signupsYesterday },
        workouts: { today: workoutsToday, yesterday: workoutsYesterday },
        ai: { today: aiMessagesToday, yesterday: aiYesterday },
        meals: { today: mealsToday, yesterday: mealsYesterday },
        cardio: { today: cardioToday, yesterday: cardioYesterday },
      },
      hourlyPulse,
      demographics: {
        goals: Object.fromEntries(goalCounts.map((g) => [g.goal, g._count.id])),
        levels: Object.fromEntries(levelCounts.map((l) => [l.fitnessLevel, l._count.id])),
        genders: Object.fromEntries(genderCounts.map((g) => [g.gender, g._count.id])),
      },
      server: {
        uptimeSeconds: Math.round(uptime),
        // Report `heapUsed` against the V8 max-old-space ceiling (or
        // `rss` against the dyno's perceived memory limit) instead of
        // `heapUsed / heapTotal`. The latter ratio is always ~70-95%
        // because Node grows heapTotal lazily right up to whatever
        // it's currently using — that triggered the founder's
        // "Память процесса 93%" warning even though the actual
        // process was well under any limit. Now we surface heapUsed
        // and dyno-relative RSS so the admin dashboard's banner can
        // fire on real pressure.
        memoryUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
        memoryTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
        // RSS = total process memory (heap + native + buffers). This
        // is what Render measures against the 512MB free-tier cap.
        rssMb: Math.round(memUsage.rss / 1024 / 1024),
        // Render free dyno is 512MB; assume that as the cap when the
        // platform doesn't report a hard limit. systemMemTotalMb is
        // the *host* memory which can be 30+ GB on shared instances
        // and is not what's relevant to us.
        rssLimitMb: 512,
        rssUsedPct: Math.round((memUsage.rss / 1024 / 1024 / 512) * 100),
        systemMemUsedPct: Math.round(((totalMem - freeMem) / totalMem) * 100),
        systemMemFreeMb: Math.round(freeMem / 1024 / 1024),
        systemMemTotalMb: Math.round(totalMem / 1024 / 1024),
        loadAvg: os.loadavg(),
        platform: os.platform(),
        nodeVersion: process.version,
        dbPingMs,
      },
    };

    // Cache the payload (server metrics excluded — they're real-time by nature)
    adminStatsCache.set(CACHE_KEY, statsPayload, CACHE_TTL_MS);
    res.setHeader('X-Cache', 'MISS');
    res.json(statsPayload);

    // Fire-and-forget: auto-escalate stale tickets
    setImmediate(async () => {
      try {
        const h8ago = new Date(now.getTime() - 8 * 3600 * 1000);
        const h24ago = new Date(now.getTime() - 24 * 3600 * 1000);
        // Sequential: first escalate low/normal → high, then high → urgent
        // (parallel would miss tickets just escalated in the same batch)
        await prisma.supportTicket.updateMany({
          where: {
            status: { in: ['open', 'in_progress'] },
            priority: { in: ['low', 'normal'] },
            updatedAt: { lt: h8ago },
            messages: { none: { isStaff: true, isInternal: false } },
          },
          data: { priority: 'high' },
        });
        await prisma.supportTicket.updateMany({
          where: {
            status: { in: ['open', 'in_progress'] },
            priority: 'high',
            updatedAt: { lt: h24ago },
            messages: { none: { isStaff: true, isInternal: false } },
          },
          data: { priority: 'urgent' },
        });
      } catch { /* ignore, non-critical */ }
    });
  } catch (e) {
    logger.error('GET /admin/stats:', e);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// ── FOUNDER SELF-DIAGNOSTIC ─────────────────────────────────────────────────

/**
 * GET /admin/me — quick self-status for the founder. Bundles the answers
 * to the questions sevka actually asks during a session ("am I getting
 * push? did the activation email fire? subscription state? last AI msg?")
 * into a single uncached call so the AdminDashboard can render a
 * "your account" panel without N round-trips.
 *
 * Why a separate endpoint and not a tweak to /stats:
 * - /stats is global (all users) and cached 90s. This is per-actor.
 * - This is the only admin endpoint that is *expected* to be uncached —
 *   the founder is debugging his own state in real time and a 90s lag
 *   would defeat the purpose.
 *
 * Scoped to the calling admin only: never accepts a userId param.
 */
router.get('/me', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const now = new Date();

    const [user, pushTokens, lastChat, lastWorkout, subscription, sessionCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
          firstChatAt: true,
          lastActiveAt: true,
          activationPushSentAt: true,
          activationEmailSentAt: true,
          reactivation7dSentAt: true,
          reactivation14dSentAt: true,
          reactivation30dSentAt: true,
          onboardingStepLog: true,
          onboardingCompletedAt: true,
          isBanned: true,
          lockedUntil: true,
          totpEnabled: true,
          emailVerified: true,
          phoneVerified: true,
        },
      }),
      prisma.pushToken.findMany({
        where: { userId },
        select: { id: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.chatMessage.findFirst({
        where: { userId, role: 'user' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.workout.findFirst({
        where: { userId, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true, totalVolume: true },
      }),
      prisma.subscription.findFirst({
        where: { userId },
        select: { plan: true, status: true, endDate: true, renewalNoticeSentAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.refreshToken.count({
        where: { userId, expiresAt: { gt: now }, revoked: false },
      }),
    ]);

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Days-since helpers — null-safe, returns null if the source date is null.
    const daysSince = (d: Date | null | undefined): number | null => {
      if (!d) return null;
      return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    };

    // Activation funnel state — answers "did I make it past first chat?"
    // and which retention nudges have already fired against this account.
    const activation = {
      firstChatAt: user.firstChatAt,
      daysSinceSignup: daysSince(user.createdAt),
      daysSinceLastActive: daysSince(user.lastActiveAt),
      activated: user.firstChatAt !== null,
      pushFired: user.activationPushSentAt !== null,
      emailFired: user.activationEmailSentAt !== null,
    };

    const reactivation = {
      d7Fired: user.reactivation7dSentAt !== null,
      d14Fired: user.reactivation14dSentAt !== null,
      d30Fired: user.reactivation30dSentAt !== null,
    };

    // Onboarding state — derived from the JSON log so the dashboard can
    // show "you reached step N" without parsing JSON client-side.
    const stepLog = (user.onboardingStepLog ?? {}) as Record<string, string>;
    const reachedSteps = Object.keys(stepLog).map(Number).sort((a, b) => a - b);
    const onboarding = {
      completed: user.onboardingCompletedAt !== null,
      completedAt: user.onboardingCompletedAt,
      maxStepReached: reachedSteps.length > 0 ? reachedSteps[reachedSteps.length - 1] : null,
      stepLog,
    };

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        createdAt: user.createdAt,
        isBanned: user.isBanned,
        lockedUntil: user.lockedUntil,
        totpEnabled: user.totpEnabled,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      },
      activation,
      reactivation,
      onboarding,
      pushTokens: {
        count: pushTokens.length,
        latest: pushTokens[0] ?? null,
      },
      lastChatAt: lastChat?.createdAt ?? null,
      lastWorkoutAt: lastWorkout?.completedAt ?? null,
      lastWorkoutVolume: lastWorkout?.totalVolume ?? null,
      subscription: subscription ?? { plan: 'free', status: 'inactive', endDate: null, renewalNoticeSentAt: null },
      activeSessionCount: sessionCount,
      now: now.toISOString(),
    });
  } catch (e) {
    logger.error('GET /admin/me:', e);
    return res.status(500).json({ error: 'Ошибка получения профиля администратора' });
  }
});

/**
 * POST /admin/test-notification — send a test push and/or email to the
 * calling admin. Lets the founder verify both channels work end-to-end
 * after a deploy without waiting for the activation cron tick or
 * fabricating a real test user. Per-actor only — the recipient is always
 * `req.userId`, never accepts a userId param to avoid cross-account
 * misuse.
 *
 * Body: { channel: 'push' | 'email' | 'both' }
 *
 * Response: { pushSent, emailSent, errors? } — partial-success aware
 * (push may succeed while email fails or vice versa).
 */
router.post('/test-notification', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({
      channel: z.enum(['push', 'email', 'both']).default('both'),
    }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректный канал', code: 'INVALID_CHANNEL' });
    }
    const { channel } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { email: true, firstName: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    let pushSent = false;
    let emailSent = false;
    const errors: Record<string, string> = {};

    if (channel === 'push' || channel === 'both') {
      // sendPushToUser silently no-ops if the user has zero registered push
      // tokens AND silently swallows every Expo error inside its try/catch.
      // Without this guard the founder sees "✓ pushSent=true" even when no
      // device is registered — the whole point of /test-notification is to
      // distinguish "push works" from "push is silently broken", so probe
      // the token table explicitly first. The send still runs best-effort
      // when tokens exist; we don't try to bubble Expo receipts up here
      // because that would mean changing pushService's contract.
      const tokenCount = await prisma.pushToken.count({ where: { userId: req.userId! } });
      if (tokenCount === 0) {
        errors.push = 'Нет зарегистрированных push-устройств для этого аккаунта';
      } else {
        try {
          const { sendPushToUser } = await import('../services/pushService');
          await sendPushToUser(req.userId!, {
            title: 'Giron — тест',
            body: 'Это тестовое уведомление из админки. Если ты его видишь — push работает.',
            data: { url: 'giron://admin', cohort: 'admin-test' },
          });
          pushSent = true;
        } catch (e: any) {
          errors.push = String(e?.message ?? e).slice(0, 200);
        }
      }
    }

    if ((channel === 'email' || channel === 'both') && user.email) {
      try {
        const { sendActivationReminderEmail, isSmtpConfigured } = await import('../services/emailService');
        // Detect the silent-noop case (SMTP env vars not all set).
        // Without this guard, the test would report emailSent=true even
        // though the transporter wrapper just returned a fake messageId
        // and nothing actually left the server. The founder would see
        // "✓ Email отправлено" and assume SMTP works when it doesn't.
        if (!isSmtpConfigured()) {
          errors.email = 'SMTP не настроен (SMTP_HOST/SMTP_USER/SMTP_PASS)';
        } else {
          await sendActivationReminderEmail(user.email, user.firstName ?? null);
          emailSent = true;
        }
      } catch (e: any) {
        errors.email = String(e?.message ?? e).slice(0, 200);
      }
    }

    // Audit-log the action so the founder can grep AdminLog for SMTP/push
    // outages later. Best-effort write — never fail the test notification
    // because the audit log itself failed.
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'TEST_NOTIFICATION',
        targetId: null,
        details: `channel=${channel} push=${pushSent} email=${emailSent}` +
          (Object.keys(errors).length > 0 ? ` errors=${Object.keys(errors).join(',')}` : ''),
      },
    }).catch(() => { /* best-effort audit */ });

    return res.json({
      pushSent,
      emailSent,
      ...(Object.keys(errors).length > 0 ? { errors } : {}),
    });
  } catch (e) {
    logger.error('POST /admin/test-notification:', e);
    return res.status(500).json({ error: 'Ошибка отправки тестового уведомления' });
  }
});

/**
 * GET /admin/cron-health — liveness ledger for the in-process crons.
 * Each entry shows when the named cron last succeeded, last failed,
 * total counts, and last run duration. Lets the founder verify
 * retention/digest/keep-warm are firing on Render without grepping
 * stdout. Records reset on dyno restart (in-memory by design — see
 * utils/cronHealth.ts comment).
 *
 * Common ids (registered when their handler first runs):
 *   - retention      — hourly retention cohorts (activation/reactivation/376-фз pre-renewal)
 *   - weekly-summary — Sunday 18:00 UTC weekly recap email
 *   - admin-digest   — daily 06:00 UTC admin digest push+email
 *   - keep-warm      — 10-min DB SELECT 1 ping
 */
router.get('/cron-health', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({
      cronJobs: getCronHealth(),
      now: new Date().toISOString(),
    });
  } catch (e) {
    logger.error('GET /admin/cron-health:', e);
    return res.status(500).json({ error: 'Ошибка получения здоровья cron-задач' });
  }
});

/**
 * POST /admin/cron/run/:id — manually trigger a cron right now. Useful
 * after deploying changes to a cron handler so the founder doesn't have
 * to wait an hour to verify it works. Idempotent because each cron has
 * its own write-once *SentAt gates (retention) or hour-of-day check
 * (digest, weekly-summary), so re-firing won't double-send.
 *
 * Allowed ids: 'retention', 'weekly-summary', 'admin-digest'. Keep-warm
 * and news-refresh are also wrapped in trackCron but excluded here —
 * they're internal infrastructure that doesn't benefit from manual
 * triggering.
 *
 * Response: { ok, sent? } — `sent` is the cohort count returned by the
 * underlying handler (retention only).
 */
router.post('/cron/run/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const ALLOWED = new Set(['retention', 'weekly-summary', 'admin-digest']);
  const id = req.params.id as string;
  if (!ALLOWED.has(id)) {
    return res.status(400).json({
      error: 'Недопустимый ID cron-задачи',
      code: 'INVALID_CRON_ID',
      allowed: Array.from(ALLOWED),
    });
  }
  try {
    let result: unknown = null;
    if (id === 'retention') {
      const { runAllRetentionCohorts } = await import('../services/retentionService');
      await runAllRetentionCohorts();
    } else if (id === 'weekly-summary') {
      const { processWeeklySummaryEmails } = await import('../services/retentionService');
      result = await processWeeklySummaryEmails();
    } else if (id === 'admin-digest') {
      const { sendDailyAdminDigest } = await import('../services/adminDigestService');
      await sendDailyAdminDigest();
    }
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'MANUAL_CRON_TRIGGER',
        targetId: null,
        details: `id=${id}`,
      },
    }).catch(() => { /* best-effort audit */ });
    return res.json({ ok: true, id, sent: result });
  } catch (e: any) {
    logger.error(`POST /admin/cron/run/${id}:`, e);
    return res.status(500).json({
      error: 'Ошибка ручного запуска cron-задачи',
      details: String(e?.message ?? e).slice(0, 200),
    });
  }
});

// ── USER MANAGEMENT ──────────────────────────────────────────────────────────

/** GET /admin/users — paginated user list */
router.get('/users', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { search = '', role, plan, banned, locked, dormant, subExpiringSoon, recentlyActive, page = '1', limit = '20', sort = 'createdAt', order = 'desc' } = req.query as Record<string, string>;
    const ALLOWED_SORT = ['createdAt', 'email', 'firstName', 'lastName'] as const;
    const safeSort = ALLOWED_SORT.includes(sort as any) ? sort : 'createdAt';
    const safeOrder = order === 'asc' ? 'asc' : 'desc';
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;
    const VALID_USER_ROLES = ['GUEST', 'VISITOR', 'CLIENT', 'TRAINER', 'SUPPORT', 'ADMIN'];
    const VALID_PLANS = ['free', 'pro', 'trainer', 'club'];
    const where: any = {};
    if (role && VALID_USER_ROLES.includes(role.toUpperCase())) where.role = role.toUpperCase();
    if (banned === 'true') where.isBanned = true;
    if (locked === 'true') where.lockedUntil = { gt: new Date() };
    if (plan && VALID_PLANS.includes(plan)) {
      where.subscription = { plan, status: 'active' };
    }
    if (dormant === 'true') {
      // Users with no workout in last 30 days (excluding new users registered < 7 days ago)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000);
      where.createdAt = { lt: sevenDaysAgo };
      where.workouts = { none: { completedAt: { gte: thirtyDaysAgo } } };
    }
    if (subExpiringSoon === 'true') {
      const inSevenDays = new Date(Date.now() + 7 * 86400 * 1000);
      where.subscription = { status: 'active', plan: { not: 'free' }, endDate: { gte: new Date(), lte: inSevenDays } };
    }
    if (recentlyActive === 'true') {
      const h24ago = new Date(Date.now() - 24 * 3600 * 1000);
      // Use AND to avoid overwriting by the search OR below
      where.AND = (where.AND ?? []);
      where.AND.push({ OR: [
        { workouts: { some: { completedAt: { gte: h24ago } } } },
        { chatMessages: { some: { createdAt: { gte: h24ago } } } },
        { meals: { some: { createdAt: { gte: h24ago } } } },
      ] });
    }
    if (search) {
      if (search.length > 100) return res.status(400).json({ error: 'Запрос слишком длинный' });
      const searchOR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { adminNote: { contains: search, mode: 'insensitive' } },
      ];
      // Use AND so search can coexist with recentlyActive filter
      where.AND = (where.AND ?? []);
      where.AND.push({ OR: searchOR });
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, firstName: true, lastName: true, phone: true,
          role: true, createdAt: true, isBanned: true, banReason: true,
          lockedUntil: true, loginAttempts: true, phoneVerified: true,
          subscription: { select: { plan: true, status: true, endDate: true } },
          _count: { select: { workouts: true, chatMessages: true } },
          workouts: { where: { completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: 1, select: { completedAt: true } },
        },
        orderBy: { [safeSort]: safeOrder },
        skip,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (e) {
    logger.error('GET /admin/users:', e);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

/** GET /admin/users/:id — user detail */
router.get('/users/:id([a-z0-9]{10,30})', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000);
    const [user, firstWorkout, recentWorkoutDates] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.params.id as string },
        include: {
          subscription: true,
          _count: {
            select: {
              workouts: true,
              meals: true,
              chatMessages: true,
              cardioSessions: true,
              supportTickets: true,
            },
          },
          workouts: {
            where: { completedAt: { not: null } },
            orderBy: { completedAt: 'desc' },
            take: 5,
            select: { id: true, name: true, completedAt: true, totalVolume: true, durationMinutes: true },
          },
          supportTickets: {
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { id: true, subject: true, status: true, createdAt: true },
          },
          chatMessages: {
            where: { role: 'user' },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { id: true, content: true, createdAt: true },
          },
          cardioSessions: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, type: true, durationMinutes: true, distanceKm: true, caloriesBurned: true, createdAt: true },
          },
          bodyWeights: {
            orderBy: { date: 'desc' },
            take: 12,
            select: { id: true, weightKg: true, date: true },
          },
          sleepEntries: {
            orderBy: { date: 'desc' },
            take: 14,
            select: { id: true, date: true, durationHours: true, quality: true },
          },
          aiMemories: {
            orderBy: { updatedAt: 'desc' },
            select: { id: true, category: true, key: true, value: true, confidence: true, source: true, updatedAt: true },
          },
        },
      }),
      prisma.workout.findFirst({
        where: { userId: req.params.id as string, completedAt: { not: null } },
        orderBy: { completedAt: 'asc' },
        select: { completedAt: true },
      }),
      prisma.workout.findMany({
        where: { userId: req.params.id as string, completedAt: { gte: ninetyDaysAgo, not: null } },
        select: { completedAt: true },
      }),
    ]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const { passwordHash, totpSecret, totpBackupCodes, ...safeUser } = user as any;
    const workoutDates = recentWorkoutDates.map((w) => w.completedAt!.toISOString().split('T')[0]);
    res.json({ ...safeUser, firstWorkoutAt: firstWorkout?.completedAt ?? null, workoutDates90d: workoutDates });
  } catch (e) {
    logger.error('GET /admin/users/:id:', e);
    res.status(500).json({ error: 'Ошибка получения пользователя' });
  }
});

const changeRoleSchema = z.object({
  role: z.enum(['GUEST', 'VISITOR', 'CLIENT', 'TRAINER', 'SUPPORT', 'ADMIN']),
});

/** PATCH /admin/users/:id/role — change user role */
router.patch('/users/:id/role', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { role } = changeRoleSchema.parse(req.body);
    // Prevent admin from removing their own admin role
    if (req.params.id === req.userId && role !== 'ADMIN') {
      return res.status(400).json({ error: 'Нельзя убрать у себя роль администратора' });
    }
    // "Last-admin" lockout guard (sec audit 2026-04: HIGH-11). A compromised
    // single admin token must not be able to demote ALL other admins and
    // become the sole controller.
    const currentTarget = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: { role: true, isBanned: true },
    });
    if (currentTarget?.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN', isBanned: false } });
      if (adminCount <= 1) {
        return res.status(409).json({ error: 'Нельзя демоутить последнего активного администратора', code: 'LAST_ADMIN' });
      }
    }
    // Step-up re-auth (sec audit 2026-04: HIGH-11)
    const stepup = await requireAdminStepUp(req, res);
    if (stepup) return;
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { role },
      select: { id: true, email: true, firstName: true, role: true },
    });
    // Round 280: invalidate cached role so the new permissions take
    // effect on the user's next request, not 60s later.
    try { authUserCache.delete(req.params.id as string); } catch { /* best-effort cache invalidation */ }
    // Log action
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'CHANGE_ROLE',
        targetId: req.params.id as string,
        details: `role → ${role}`,
      },
    });
    res.json(user);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    if (isNotFound(e)) return res.status(404).json({ error: 'Пользователь не найден' });
    logger.error('PATCH /admin/users/:id/role:', e);
    res.status(500).json({ error: 'Ошибка изменения роли' });
  }
});

const changeSubSchema = z.object({
  plan: z.enum(['free', 'pro', 'trainer', 'club']),
  status: z.enum(['active', 'cancelled', 'expired']).optional(),
  endDate: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'Некорректная дата endDate').optional(),
  // Optional optimistic-concurrency token. Client passes the
  // `updatedAt` value from the last GET. If the row was modified
  // (e.g. by a webhook payment renewal) since that read, the
  // conditional update fires count=0 and the route returns 409
  // CONCURRENT_MODIFICATION instead of silently overwriting a
  // legitimate payment. When omitted, falls back to the legacy
  // unconditional upsert (backwards compat).
  expectedUpdatedAt: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'Некорректная expectedUpdatedAt').optional(),
});

/** PATCH /admin/users/:id/subscription — override subscription */
router.patch('/users/:id/subscription', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const data = changeSubSchema.parse(req.body);
    // Step-up re-auth (sec audit 2026-04: HIGH-11) — financial mutation
    const stepup = await requireAdminStepUp(req, res);
    if (stepup) return;

    const targetUserId = req.params.id as string;
    const updatePayload = {
      plan: data.plan,
      status: data.status ?? 'active',
      ...(data.endDate !== undefined ? { endDate: new Date(data.endDate) } : {}),
      updatedAt: new Date(),
    };

    // Optimistic concurrency control (round 286+).
    //
    // The classic race we defend against: admin reads sub at T0, decides
    // to downgrade plan=free; webhook payment-renewed lands at T1
    // setting plan=pro/endDate+30d; admin upsert at T2 overwrites the
    // legit renewal back to free. The fix is a conditional update keyed
    // on the admin's `expectedUpdatedAt` — if anyone wrote to the row
    // between admin's GET and PATCH, the updateMany count is 0 and we
    // reject with 409 so the admin can re-fetch and re-decide.
    //
    // Falls back to the legacy unconditional upsert when the client
    // doesn't pass expectedUpdatedAt — backwards compat for clients that
    // weren't updated yet.
    let sub: any;
    if (data.expectedUpdatedAt !== undefined) {
      const expected = new Date(data.expectedUpdatedAt);
      // Conditional update only — if the row doesn't exist we still need
      // a create path. Two-step: try updateMany first; if 0 rows matched,
      // either (a) row didn't exist (do create), or (b) row exists but
      // updatedAt drifted (race). Disambiguate with a fresh read.
      const { count } = await prisma.subscription.updateMany({
        where: { userId: targetUserId, updatedAt: expected },
        data: updatePayload,
      });
      if (count === 0) {
        const fresh = await prisma.subscription.findUnique({ where: { userId: targetUserId } });
        if (fresh) {
          // Row exists but updatedAt didn't match — someone else wrote.
          return res.status(409).json({
            error: 'Подписка была изменена параллельно (платёж/другой админ). Обновите данные и повторите.',
            code: 'CONCURRENT_MODIFICATION',
            currentUpdatedAt: fresh.updatedAt,
          });
        }
        // No row — create fresh. expectedUpdatedAt was wrong (client
        // assumed a row that doesn't exist), but the desired end state
        // is "create with this plan" so we proceed.
        sub = await prisma.subscription.create({
          data: {
            userId: targetUserId,
            plan: data.plan,
            status: data.status ?? 'active',
            startDate: new Date(),
            endDate: data.endDate ? new Date(data.endDate) : null,
          },
        });
      } else {
        // Refetch to return the updated row to the client.
        sub = await prisma.subscription.findUnique({ where: { userId: targetUserId } });
      }
    } else {
      // Legacy path — unconditional upsert.
      sub = await prisma.subscription.upsert({
        where: { userId: targetUserId },
        update: updatePayload,
        create: {
          userId: targetUserId,
          plan: data.plan,
          status: data.status ?? 'active',
          startDate: new Date(),
          endDate: data.endDate ? new Date(data.endDate) : null,
        },
      });
    }
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'CHANGE_SUBSCRIPTION',
        targetId: targetUserId,
        details: `plan → ${data.plan}, status → ${data.status ?? 'active'}`,
      },
    });
    res.json(sub);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('PATCH /admin/users/:id/subscription:', e);
    res.status(500).json({ error: 'Ошибка изменения подписки' });
  }
});

const banSchema = z.object({
  reason: z.string().min(1).max(500),
});

/** POST /admin/users/:id/ban — ban user */
router.post('/users/:id/ban', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { reason } = banSchema.parse(req.body);
    if (req.params.id === req.userId) {
      return res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
    }
    // "Last-admin" lockout guard (sec audit 2026-04: HIGH-11). Banning an
    // admin must not strip the last surviving administrator from the system.
    const banTarget = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: { role: true },
    });
    if (banTarget?.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN', isBanned: false } });
      if (adminCount <= 1) {
        return res.status(409).json({ error: 'Нельзя забанить последнего активного администратора', code: 'LAST_ADMIN' });
      }
    }
    // Step-up re-auth (sec audit 2026-04: HIGH-11)
    const stepup = await requireAdminStepUp(req, res);
    if (stepup) return;
    // Ban + revoke sessions atomically — prevents banned user from using a valid refresh token during the window
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: req.params.id as string },
        data: { isBanned: true, bannedAt: new Date(), banReason: reason },
        select: { id: true, email: true, firstName: true, isBanned: true },
      }),
      prisma.refreshToken.updateMany({ where: { userId: req.params.id as string, revoked: false }, data: { revoked: true } }),
      prisma.trustedDevice.deleteMany({ where: { userId: req.params.id as string } }),
    ]);
    // Round 280: invalidate auth cache so the ban takes effect on the
    // user's NEXT request, not 60 seconds later.
    try { authUserCache.delete(req.params.id as string); } catch { /* best-effort cache invalidation */ }
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'BAN_USER',
        targetId: req.params.id as string,
        details: `reason: ${reason}`,
      },
    });
    res.json(user);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    if (isNotFound(e)) return res.status(404).json({ error: 'Пользователь не найден' });
    logger.error('POST /admin/users/:id/ban:', e);
    res.status(500).json({ error: 'Ошибка блокировки пользователя' });
  }
});

/** POST /admin/users/:id/unban — unban user */
router.post('/users/:id/unban', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { isBanned: false, bannedAt: null, banReason: null },
      select: { id: true, email: true, firstName: true, isBanned: true },
    });
    // Round 280: invalidate cached ban state immediately.
    try { authUserCache.delete(req.params.id as string); } catch { /* best-effort cache invalidation */ }
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'UNBAN_USER',
        targetId: req.params.id as string,
        details: null,
      },
    });
    res.json(user);
  } catch (e) {
    if (isNotFound(e)) return res.status(404).json({ error: 'Пользователь не найден' });
    logger.error('POST /admin/users/:id/unban:', e);
    res.status(500).json({ error: 'Ошибка разблокировки пользователя' });
  }
});

/** POST /admin/users/:id/force-verify-email — mark user email as verified */
router.post('/users/:id/force-verify-email', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { emailVerified: true },
      select: { id: true, email: true, emailVerified: true },
    });
    await prisma.adminLog.create({
      data: { adminId: req.userId!, action: 'FORCE_VERIFY_EMAIL', targetId: req.params.id as string, details: `email=${user.email}` },
    });
    res.json(user);
  } catch (e) {
    if (isNotFound(e)) return res.status(404).json({ error: 'Пользователь не найден' });
    logger.error('POST /admin/users/:id/force-verify-email:', e);
    res.status(500).json({ error: 'Ошибка верификации email' });
  }
});

/** POST /admin/users/:id/unlock — clear login lockout */
router.post('/users/:id/unlock', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { loginAttempts: 0, lockedUntil: null },
      select: { id: true, email: true, firstName: true, loginAttempts: true, lockedUntil: true },
    });
    await prisma.adminLog.create({
      data: { adminId: req.userId!, action: 'UNLOCK_USER', targetId: req.params.id as string },
    });
    res.json(user);
  } catch (e) {
    if (isNotFound(e)) return res.status(404).json({ error: 'Пользователь не найден' });
    logger.error('POST /admin/users/:id/unlock:', e);
    res.status(500).json({ error: 'Ошибка снятия блокировки' });
  }
});

const noteSchema = z.object({
  note: z.string().max(1000),
});

/** PATCH /admin/users/:id/note — set admin note */
router.patch('/users/:id/note', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { note } = noteSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { adminNote: note || null },
      select: { id: true, adminNote: true },
    });
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'UPDATE_NOTE',
        targetId: req.params.id as string,
        details: note ? `note set (${note.length} chars)` : 'note cleared',
      },
    });
    res.json(user);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    if (isNotFound(e)) return res.status(404).json({ error: 'Пользователь не найден' });
    logger.error('PATCH /admin/users/:id/note:', e);
    res.status(500).json({ error: 'Ошибка сохранения заметки' });
  }
});

/** DELETE /admin/users/:id — soft-delete: ban + clear personal data */
router.delete('/users/:id([a-z0-9]{10,30})', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (req.params.id === req.userId) {
      return res.status(400).json({ error: 'Нельзя удалить свой аккаунт' });
    }
    // "Last-admin" guard + step-up (sec audit 2026-04: HIGH-11)
    const delTarget = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: { role: true },
    });
    if (delTarget?.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN', isBanned: false } });
      if (adminCount <= 1) {
        return res.status(409).json({ error: 'Нельзя удалить последнего активного администратора', code: 'LAST_ADMIN' });
      }
    }
    const stepup = await requireAdminStepUp(req, res);
    if (stepup) return;
    // Anonymize the user instead of hard delete to preserve referential integrity
    const anon = `deleted_${Date.now()}`;
    await prisma.user.update({
      where: { id: req.params.id as string },
      data: {
        email: `${anon}@deleted.invalid`,
        firstName: 'Удалён',
        lastName: null,
        phone: null,
        isBanned: true,
        banReason: 'Account deleted by admin',
        adminNote: `Deleted at ${new Date().toISOString()}`,
      },
    });
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'DELETE_USER',
        targetId: req.params.id as string,
        details: 'Account anonymized',
      },
    });
    res.json({ success: true });
  } catch (e) {
    if (isNotFound(e)) return res.status(404).json({ error: 'Пользователь не найден' });
    logger.error('DELETE /admin/users/:id:', e);
    res.status(500).json({ error: 'Ошибка удаления пользователя' });
  }
});

/** POST /admin/users/:id/message — create a support ticket and send message to user from admin */
router.post('/users/:id/message', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { subject, message } = z.object({
      subject: z.string().min(1).max(200),
      message: z.string().min(1).max(2000),
    }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const ticket = await prisma.supportTicket.create({
      data: {
        subject,
        category: 'other',
        status: 'in_progress',
        priority: 'normal',
        userId: user.id,
        assignedToId: req.userId!,
        messages: {
          create: {
            content: message,
            authorId: req.userId!,
            isStaff: true,
            isInternal: false,
          },
        },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
        messages: {
          include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
      },
    });

    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'SEND_MESSAGE',
        targetId: user.id,
        details: `Ticket created: ${subject}`,
      },
    });

    res.status(201).json(ticket);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /admin/users/:id/message:', e);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});


/** POST /admin/mass-message — send a message to multiple users (creates support tickets) */
router.post('/mass-message', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { userIds, subject, message } = z.object({
      userIds: z.array(z.string().cuid()).min(1).max(100),
      subject: z.string().min(1).max(200),
      message: z.string().min(1).max(2000),
    }).parse(req.body);

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, isBanned: false },
      select: { id: true },
    });

    // Round 261: bounded concurrency (was Promise.allSettled fanning
    // out thousands of writes at once and saturating the connection pool).
    const results = await mapWithConcurrency(users, 10, (u) =>
      prisma.supportTicket.create({
        data: {
          subject,
          category: 'other',
          status: 'in_progress',
          priority: 'normal',
          userId: u.id,
          assignedToId: req.userId!,
          messages: {
            create: {
              content: message,
              authorId: req.userId!,
              isStaff: true,
              isInternal: false,
            },
          },
        },
        select: { id: true },
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'MASS_MESSAGE',
        details: `Sent to ${succeeded}/${users.length} users: "${subject}"`,
      },
    });

    res.json({ sent: succeeded, failed, total: users.length });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /admin/mass-message:', e);
    res.status(500).json({ error: 'Ошибка массовой рассылки' });
  }
});

/** POST /admin/subscriptions/broadcast — send a support ticket message to all users in a plan segment */
router.post('/subscriptions/broadcast', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { plan, subject, message, expiringSoonOnly } = z.object({
      plan: z.enum(['pro', 'trainer', 'club', 'free']),
      subject: z.string().min(1).max(200),
      message: z.string().min(1).max(2000),
      expiringSoonOnly: z.boolean().optional(),
    }).parse(req.body);

    const now = new Date();
    // Include both active subs and cancelled-but-not-yet-expired (they still have access)
    const subWhere: Record<string, unknown> = {
      plan,
      OR: [
        { status: 'active' },
        { status: 'cancelled', endDate: { gte: now } },
      ],
    };
    if (expiringSoonOnly) {
      subWhere.endDate = { gte: now, lte: new Date(now.getTime() + 14 * 86400 * 1000) };
    }

    const users = await prisma.user.findMany({
      where: { isBanned: false, subscription: subWhere },
      select: { id: true },
      take: 10000,
    });

    if (users.length === 0) return res.json({ sent: 0, failed: 0, total: 0 });

    // Round 261: bounded concurrency (was Promise.allSettled fanning
    // out up to 10000 writes at once and saturating the connection pool).
    const results = await mapWithConcurrency(users, 10, (u) =>
      prisma.supportTicket.create({
        data: {
          subject,
          category: 'other',
          status: 'in_progress',
          priority: 'normal',
          userId: u.id,
          assignedToId: req.userId!,
          messages: {
            create: {
              content: message,
              authorId: req.userId!,
              isStaff: true,
              isInternal: false,
            },
          },
        },
        select: { id: true },
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'SEGMENT_BROADCAST',
        details: `plan=${plan}${expiringSoonOnly ? ' expiring' : ''} · ${succeeded}/${users.length} tickets: "${subject}"`,
      },
    });

    res.json({ sent: succeeded, failed, total: users.length });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /admin/subscriptions/broadcast:', e);
    res.status(500).json({ error: 'Ошибка рассылки' });
  }
});

/** GET /admin/users/export — CSV export of user list */
router.get('/users/export', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { role, plan, banned } = req.query as Record<string, string>;
    const EXPORT_VALID_ROLES = ['GUEST', 'VISITOR', 'CLIENT', 'TRAINER', 'SUPPORT', 'ADMIN'];
    const EXPORT_VALID_PLANS = ['free', 'pro', 'trainer', 'club'];
    const where: any = {};
    if (role && EXPORT_VALID_ROLES.includes(role.toUpperCase())) where.role = role.toUpperCase();
    if (banned === 'true') where.isBanned = true;
    if (plan && EXPORT_VALID_PLANS.includes(plan)) where.subscription = { plan, status: 'active' };

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, createdAt: true, isBanned: true,
        subscription: { select: { plan: true, status: true, endDate: true } },
        _count: { select: { workouts: true, chatMessages: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    // Sanitize a CSV cell: quote, escape internal quotes, and strip leading formula chars
    // to prevent formula injection attacks when opening in spreadsheet apps.
    const csvCell = (v: unknown): string => {
      let s = String(v ?? '');
      // Strip leading chars that trigger formula execution in Excel/Google Sheets
      if (['+', '-', '=', '@', '\t', '\r'].includes(s[0])) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };

    const header = 'id,email,firstName,lastName,role,plan,subStatus,workouts,aiMessages,createdAt,isBanned\n';
    const rows = users.map((u) => [
      u.id,
      u.email,
      u.firstName,
      u.lastName ?? '',
      u.role,
      u.subscription?.plan ?? 'free',
      u.subscription?.status ?? 'none',
      u._count.workouts,
      u._count.chatMessages,
      u.createdAt.toISOString().split('T')[0],
      u.isBanned ? '1' : '0',
    ].map(csvCell).join(','));

    await prisma.adminLog.create({
      data: { adminId: req.userId!, action: 'EXPORT_USERS', details: `${users.length} users exported` },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="users_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(header + rows.join('\n'));
  } catch (e) {
    logger.error('GET /admin/users/export:', e);
    res.status(500).json({ error: 'Ошибка экспорта' });
  }
});

// ── ANALYTICS ────────────────────────────────────────────────────────────────

/** GET /admin/analytics — growth, retention, activity trends (cached 5 minutes) */
router.get('/analytics', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { days = '30', refresh } = req.query as Record<string, string>;
    const numDays = Math.min(90, Math.max(7, parseInt(days, 10) || 30));
    const ANALYTICS_CACHE_KEY = `admin:analytics:${numDays}`;
    const ANALYTICS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    if (refresh !== '1') {
      const cached = adminStatsCache.get(ANALYTICS_CACHE_KEY);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }
    }

    const todayUtcStr = new Date().toISOString().slice(0, 10);
    const since = new Date(`${todayUtcStr}T00:00:00.000Z`);
    since.setUTCDate(since.getUTCDate() - numDays);

    // Previous period window for comparison
    const prevSince = new Date(since.getTime() - numDays * 86_400_000);

    // Use SQL DATE aggregation instead of loading all individual records into Node.js.
    // Returns at most numDays rows per table instead of potentially thousands of records.
    type DayRow = { day: string; cnt: bigint };
    const [signupsByDay, workoutsByDay, aiByDay, cardioByDay, prevSignups, prevWorkouts, prevAi, prevCardio] = await Promise.all([
      prisma.$queryRaw<DayRow[]>`
        SELECT TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS cnt
        FROM "User" WHERE "createdAt" >= ${since}
        GROUP BY day ORDER BY day ASC
      `,
      prisma.$queryRaw<DayRow[]>`
        SELECT TO_CHAR("completedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS cnt
        FROM "Workout" WHERE "completedAt" >= ${since}
        GROUP BY day ORDER BY day ASC
      `,
      prisma.$queryRaw<DayRow[]>`
        SELECT TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS cnt
        FROM "ChatMessage" WHERE role = 'user' AND "createdAt" >= ${since}
        GROUP BY day ORDER BY day ASC
      `,
      prisma.$queryRaw<DayRow[]>`
        SELECT TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS cnt
        FROM "CardioSession" WHERE "createdAt" >= ${since}
        GROUP BY day ORDER BY day ASC
      `,
      // Previous period counts (scalar — unchanged)
      prisma.user.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
      prisma.workout.count({ where: { completedAt: { gte: prevSince, lt: since, not: null } } }),
      prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: prevSince, lt: since } } }),
      prisma.cardioSession.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
    ]);

    // Build day-by-day buckets (pre-initialised so days with 0 activity still appear)
    const buckets: Record<string, { signups: number; workouts: number; ai: number; cardio: number }> = {};
    for (let i = 0; i < numDays; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().split('T')[0];
      buckets[key] = { signups: 0, workouts: 0, ai: 0, cardio: 0 };
    }

    signupsByDay.forEach(({ day, cnt }) => { if (buckets[day]) buckets[day].signups = Number(cnt); });
    workoutsByDay.forEach(({ day, cnt }) => { if (buckets[day]) buckets[day].workouts = Number(cnt); });
    aiByDay.forEach(({ day, cnt }) => { if (buckets[day]) buckets[day].ai = Number(cnt); });
    cardioByDay.forEach(({ day, cnt }) => { if (buckets[day]) buckets[day].cardio = Number(cnt); });

    const timeline = Object.entries(buckets).map(([date, v]) => ({ date, ...v }));

    // Top programs by completed workout count in the period
    const topProgramsRaw = await prisma.workout.groupBy({
      by: ['programId'],
      where: { completedAt: { gte: since, not: null }, programId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });
    const programIds = topProgramsRaw.map((p) => p.programId!).filter(Boolean);
    const programDetails = programIds.length > 0 ? await prisma.program.findMany({
      where: { id: { in: programIds } },
      select: { id: true, name: true, type: true },
    }) : [];
    const topPrograms = topProgramsRaw.map((p) => {
      const prog = programDetails.find((d) => d.id === p.programId);
      return { id: p.programId!, name: prog?.name ?? 'Unknown', type: prog?.type ?? '', count: p._count.id };
    });

    // Onboarding funnel for new users in last 30 days
    const thirtyAgo = new Date(Date.now() - 30 * 86400 * 1000);
    const [newUsers30d, profiledUsers30d, firstWorkoutUsers30d, convertedUsers30d] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: thirtyAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyAgo }, goal: { not: null } } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyAgo }, workouts: { some: { completedAt: { not: null } } } } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyAgo }, subscription: { status: 'active', plan: { not: 'free' } } } }),
    ]);

    // Totals for conversion funnel + top exercises
    const [totalUsers, paidUsers, activeLastWeek, topExercisesRaw] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'active', plan: { not: 'free' } } }),
      prisma.workout.groupBy({
        by: ['userId'],
        where: { completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }).then((r) => r.length),
      prisma.workoutExercise.groupBy({
        by: ['exerciseId'],
        where: { workout: { completedAt: { gte: since, not: null } } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 8,
      }),
    ]);
    const exerciseIds = topExercisesRaw.map((e) => e.exerciseId);
    const exerciseDetails = exerciseIds.length > 0 ? await prisma.exercise.findMany({
      where: { id: { in: exerciseIds } },
      select: { id: true, name: true, type: true },
    }) : [];
    const topExercises = topExercisesRaw.map((e) => {
      const ex = exerciseDetails.find((d) => d.id === e.exerciseId);
      return { id: e.exerciseId, name: ex?.name ?? 'Unknown', type: ex?.type ?? '', count: e._count.id };
    });

    const analyticsPayload = {
      timeline,
      funnel: {
        totalUsers,
        paidUsers,
        activeLastWeek,
        conversionRate: totalUsers > 0 ? Math.round((paidUsers / totalUsers) * 100) : 0,
        retentionRate: totalUsers > 0 ? Math.round((activeLastWeek / totalUsers) * 100) : 0,
      },
      previous: { signups: prevSignups, workouts: prevWorkouts, ai: prevAi, cardio: prevCardio },
      topPrograms,
      topExercises,
      period: numDays,
      onboardingFunnel: {
        signups: newUsers30d,
        profiled: profiledUsers30d,
        firstWorkout: firstWorkoutUsers30d,
        converted: convertedUsers30d,
      },
    };
    adminStatsCache.set(ANALYTICS_CACHE_KEY, analyticsPayload, ANALYTICS_CACHE_TTL);
    res.setHeader('X-Cache', 'MISS');
    res.json(analyticsPayload);
  } catch (e) {
    logger.error('GET /admin/analytics:', e);
    res.status(500).json({ error: 'Ошибка получения аналитики' });
  }
});

/** GET /admin/analytics/cohorts — weekly cohort retention: % of each signup week still active */
router.get('/analytics/cohorts', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    // Round 267: replaced 8-iteration loop (16 sequential queries) with
    // a single SQL using generate_series for the week bucket frame +
    // LATERAL joins for signup count and active count. Drops a 200-500ms
    // cold response down to ~30ms.
    const weeks = 8;
    const now = new Date();
    const activeStart = new Date(now.getTime() - 7 * 86400 * 1000);

    const rows = await prisma.$queryRaw<Array<{
      week_start: Date;
      signups: bigint;
      active_this_week: bigint;
    }>>`
      WITH weeks AS (
        SELECT
          ${now}::timestamp - ((i + 1) * 7) * INTERVAL '1 day' AS week_start,
          ${now}::timestamp - (i * 7) * INTERVAL '1 day' AS week_end
        FROM generate_series(0, ${weeks - 1}) AS s(i)
      ),
      signups AS (
        SELECT
          w.week_start,
          u.id AS user_id
        FROM weeks w
        JOIN "User" u ON u."createdAt" >= w.week_start AND u."createdAt" < w.week_end
      ),
      active_users AS (
        SELECT DISTINCT "userId" FROM "Workout"
        WHERE "completedAt" >= ${activeStart}
      )
      SELECT
        s.week_start,
        COUNT(DISTINCT s.user_id)::bigint AS signups,
        COUNT(DISTINCT CASE WHEN au."userId" IS NOT NULL THEN s.user_id END)::bigint AS active_this_week
      FROM weeks w
      LEFT JOIN signups s ON s.week_start = w.week_start
      LEFT JOIN active_users au ON au."userId" = s.user_id
      GROUP BY s.week_start
      ORDER BY s.week_start ASC
    `;

    const cohorts = rows
      .filter((r) => r.week_start) // generate_series + outer joins can produce a null row if 0 signups
      .map((r) => {
        const signups = Number(r.signups);
        const activeThisWeek = Number(r.active_this_week);
        return {
          week: new Date(r.week_start).toISOString().split('T')[0],
          signups,
          activeThisWeek,
          retentionPct: signups > 0 ? Math.round((activeThisWeek / signups) * 100) : 0,
        };
      });

    res.json(cohorts);
  } catch (e) {
    logger.error('GET /admin/analytics/cohorts:', e);
    res.status(500).json({ error: 'Ошибка когортного анализа' });
  }
});

/** GET /admin/analytics/subscriptions — daily new paid subscriptions by plan */
router.get('/analytics/subscriptions', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { days = '30' } = req.query as Record<string, string>;
    const numDays = Math.min(90, Math.max(7, parseInt(days, 10) || 30));
    const todayUtcStr2 = new Date().toISOString().slice(0, 10);
    const since = new Date(`${todayUtcStr2}T00:00:00.000Z`);
    since.setUTCDate(since.getUTCDate() - numDays);

    // Aggregate in Postgres instead of loading up to 50k rows. DATE_TRUNC + GROUP BY
    // returns one row per (day, plan) — a few hundred rows for 90 days max.
    const rows = await prisma.$queryRaw<{ day: Date; plan: string; count: bigint }[]>`
      SELECT DATE_TRUNC('day', "createdAt")::date AS day, plan, COUNT(*)::bigint AS count
      FROM "Subscription"
      WHERE plan != 'free' AND "createdAt" >= ${since}
      GROUP BY day, plan
    `;

    // Build daily buckets per plan
    const buckets: Record<string, { pro: number; trainer: number; club: number; total: number }> = {};
    for (let i = 0; i < numDays; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      buckets[d.toISOString().split('T')[0]] = { pro: 0, trainer: 0, club: 0, total: 0 };
    }
    let totalNew = 0;
    for (const r of rows) {
      const key = r.day.toISOString().split('T')[0];
      if (!buckets[key]) continue;
      const c = Number(r.count);
      totalNew += c;
      buckets[key].total += c;
      if (r.plan === 'pro') buckets[key].pro += c;
      else if (r.plan === 'trainer') buckets[key].trainer += c;
      else if (r.plan === 'club') buckets[key].club += c;
    }

    const timeline = Object.entries(buckets).map(([date, v]) => ({ date, ...v }));
    res.json({ timeline, totalNew, period: numDays });
  } catch (e) {
    logger.error('GET /admin/analytics/subscriptions:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/**
 * GET /admin/metrics/key — the 5 numbers a solo founder actually needs to
 * decide what to do next, returned in one query so the dashboard doesn't
 * need to stitch three endpoints together:
 *
 *   1. payingUsers       — current paid subscribers (plan != free, status active or cancelled-but-not-expired)
 *   2. monthlyChurn      — % of paid users who left in the past 30d
 *   3. arpu              — average revenue per paid user (₽/mo)
 *   4. activation        — % of new signups who started a chat within 24h + median time-to-first-chat
 *   5. funnel            — signup → profiled → first workout → first chat → paid (last 30d cohort)
 *
 * Cached 5 minutes — the underlying aggregation hits Subscription, User, and
 * ChatMessage. At <10k users this runs in under 200ms; revisit when the
 * table grows past that. ?refresh=1 forces a re-compute.
 */
router.get('/metrics/key', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { refresh, days: rawDays } = req.query as Record<string, string>;

    // Parse + clamp date-range filter. Default 30 days matches the
    // historical contract; allow 7/14/30/60/90 as common founder views
    // (last week, last 2 weeks, last month, last 2 months, last quarter).
    // Anything else gets coerced to 30 silently — never error on a
    // malformed query string for a metrics dashboard.
    const ALLOWED_DAYS = [7, 14, 30, 60, 90];
    const requestedDays = parseInt(rawDays ?? '30', 10);
    const days = ALLOWED_DAYS.includes(requestedDays) ? requestedDays : 30;

    // Cache key includes the window so different ranges don't trample
    // each other. Keeps the 5-min TTL semantics per range.
    const KEY_METRICS_CACHE_KEY = `admin:metrics:key:${days}d`;
    const KEY_METRICS_CACHE_TTL = 5 * 60 * 1000;

    if (refresh !== '1') {
      const cached = adminStatsCache.get(KEY_METRICS_CACHE_KEY);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }
    }

    const now = new Date();
    // Window boundaries based on the requested `days` filter. The previous
    // names (thirtyDaysAgo/sixtyDaysAgo) were left over from when the
    // window was hardcoded at 30d — they remained even after we
    // parameterised `days`, which made the math read as 30/60 even when
    // it was actually 7/14 or 90/180. Renamed to match what they hold.
    const windowStart = new Date(now.getTime() - days * 86400 * 1000);
    const previousWindowStart = new Date(now.getTime() - days * 2 * 86400 * 1000);

    // ── 1. Paying users (current + delta vs window start) ──────────────────
    // "Paying" = active OR cancelled-not-yet-expired AND plan != free. The
    // cancelled bucket counts because the user has already paid — they
    // contribute to current MRR until endDate hits.
    const payingNow = await prisma.subscription.count({
      where: {
        plan: { not: 'free' },
        OR: [
          { status: 'active' },
          { status: 'cancelled', endDate: { gte: now } },
        ],
      },
    });

    // Window-start snapshot: subscriptions that existed AND were paid AND
    // hadn't expired yet at the cutoff. We approximate via createdAt + endDate.
    // The variable name preserves the legacy `payingThirtyDaysAgo` because
    // the public payload field is also `thirtyDaysAgo` — renaming it
    // would break the client interface contract.
    const payingThirtyDaysAgo = await prisma.subscription.count({
      where: {
        plan: { not: 'free' },
        createdAt: { lte: windowStart },
        OR: [
          { endDate: null },
          { endDate: { gte: windowStart } },
        ],
      },
    });

    // ── 2. Churn over the requested window ─────────────────────────────────
    // churnEvents = paid subscriptions that hit 'expired' OR canceledAt landed
    // in the window. Uses canceledAt (the audit field added for 376-ФЗ) when
    // present, falls back to updatedAt for the legacy 'expired' status flips
    // that pre-date the audit field.
    const churnedLast30 = await prisma.subscription.count({
      where: {
        plan: { not: 'free' },
        OR: [
          { canceledAt: { gte: windowStart } },
          { status: 'expired', updatedAt: { gte: windowStart } },
        ],
      },
    });
    // Denominator: average paid users over the window (start + end / 2).
    const avgPaying = (payingNow + payingThirtyDaysAgo) / 2;
    const monthlyChurnPct = avgPaying > 0
      ? Math.round((churnedLast30 / avgPaying) * 1000) / 10
      : 0;

    // ── 3. ARPU ──────────────────────────────────────────────────────────────
    // Use the renewalAmountRub snapshot when populated (added with the 376-ФЗ
    // audit fields). For pre-audit subscriptions we fall back to a plan-based
    // estimate: pro=299₽/mo, trainer=599₽/mo, club=1990₽/mo. These are list
    // prices and may diverge from reality after promo codes — once the
    // payment integration writes renewalAmountRub on every renewal this
    // estimate is dead code.
    const PLAN_PRICE_FALLBACK_RUB: Record<string, number> = {
      pro: 299,
      trainer: 599,
      club: 1990,
    };
    const activeSubs = await prisma.subscription.findMany({
      where: {
        plan: { not: 'free' },
        OR: [
          { status: 'active' },
          { status: 'cancelled', endDate: { gte: now } },
        ],
      },
      select: { plan: true, renewalAmountRub: true },
    });
    let totalMrrRub = 0;
    for (const sub of activeSubs) {
      totalMrrRub += sub.renewalAmountRub ?? PLAN_PRICE_FALLBACK_RUB[sub.plan] ?? 0;
    }
    const arpuRub = activeSubs.length > 0 ? Math.round(totalMrrRub / activeSubs.length) : 0;

    // ── 4. Activation: TTF-chat distribution ─────────────────────────────────
    // % of users in the window cohort who completed first AI chat within
    // 24h, plus the median time-to-first-chat in minutes for that cohort.
    // Median computed in SQL via percentile_cont — moves the work to PG
    // instead of pulling timestamps into Node.
    const ttfRows = await prisma.$queryRaw<{
      cohort_size: bigint;
      activated_24h: bigint;
      median_minutes: number | null;
    }[]>`
      WITH cohort AS (
        SELECT id, "createdAt", "firstChatAt"
        FROM "User"
        WHERE "createdAt" >= ${windowStart}
      )
      SELECT
        COUNT(*)::bigint AS cohort_size,
        COUNT(*) FILTER (
          WHERE "firstChatAt" IS NOT NULL
          AND EXTRACT(EPOCH FROM ("firstChatAt" - "createdAt")) <= 86400
        )::bigint AS activated_24h,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM ("firstChatAt" - "createdAt")) / 60.0
        ) FILTER (WHERE "firstChatAt" IS NOT NULL) AS median_minutes
      FROM cohort
    `;
    const cohortSize = Number(ttfRows[0]?.cohort_size ?? 0);
    const activated24h = Number(ttfRows[0]?.activated_24h ?? 0);
    const activationRatePct = cohortSize > 0
      ? Math.round((activated24h / cohortSize) * 1000) / 10
      : 0;
    const medianTtfMinutes = ttfRows[0]?.median_minutes != null
      ? Math.round(Number(ttfRows[0].median_minutes))
      : null;

    // ── 5. Funnel: signup → profiled → first workout → first chat → paid ─────
    const [funnelSignups, funnelProfiled, funnelFirstWorkout, funnelFirstChat, funnelPaid] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: windowStart } } }),
      prisma.user.count({
        where: {
          createdAt: { gte: windowStart },
          goal: { not: null },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: windowStart },
          workouts: { some: { completedAt: { not: null } } },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: windowStart },
          firstChatAt: { not: null },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: windowStart },
          subscription: { plan: { not: 'free' }, status: 'active' },
        },
      }),
    ]);

    // ── 6. Onboarding funnel: per-step drop-off ───────────────────────────
    // Drives "where in onboarding do users bail?" answers. Counts come from
    // the onboardingStepLog Json field (set by POST /user/onboarding/step,
    // first-touch only). A user who reached step N is counted at every step
    // 0..N. The "completed" count uses onboardingCompletedAt as the
    // canonical "finished onboarding" signal — set when step 4 is recorded.
    //
    // Not joinable to the main funnel without scanning JSON paths, so we
    // run a separate raw query. Falls back to zeroes on error so the
    // metrics endpoint never blocks on this optional block.
    let onboardingFunnel = {
      cohortSize: 0,
      reachedStep0: 0,
      reachedStep1: 0,
      reachedStep2: 0,
      reachedStep3: 0,
      reachedStep4: 0,
      completed: 0,
      completionRatePct: 0,
    };
    try {
      const onbRows = await prisma.$queryRaw<{
        cohort_size: bigint;
        reached0: bigint;
        reached1: bigint;
        reached2: bigint;
        reached3: bigint;
        reached4: bigint;
        completed: bigint;
      }[]>`
        SELECT
          COUNT(*)::bigint AS cohort_size,
          COUNT(*) FILTER (WHERE "onboardingStepLog" ? '0')::bigint AS reached0,
          COUNT(*) FILTER (WHERE "onboardingStepLog" ? '1')::bigint AS reached1,
          COUNT(*) FILTER (WHERE "onboardingStepLog" ? '2')::bigint AS reached2,
          COUNT(*) FILTER (WHERE "onboardingStepLog" ? '3')::bigint AS reached3,
          COUNT(*) FILTER (WHERE "onboardingStepLog" ? '4')::bigint AS reached4,
          COUNT(*) FILTER (WHERE "onboardingCompletedAt" IS NOT NULL)::bigint AS completed
        FROM "User"
        WHERE "createdAt" >= ${windowStart}
      `;
      const cohort = Number(onbRows[0]?.cohort_size ?? 0);
      const completed = Number(onbRows[0]?.completed ?? 0);
      onboardingFunnel = {
        cohortSize: cohort,
        reachedStep0: Number(onbRows[0]?.reached0 ?? 0),
        reachedStep1: Number(onbRows[0]?.reached1 ?? 0),
        reachedStep2: Number(onbRows[0]?.reached2 ?? 0),
        reachedStep3: Number(onbRows[0]?.reached3 ?? 0),
        reachedStep4: Number(onbRows[0]?.reached4 ?? 0),
        completed,
        completionRatePct: cohort > 0
          ? Math.round((completed / cohort) * 1000) / 10
          : 0,
      };
    } catch (err) {
      // Telemetry block — never block the metrics endpoint on this.
      logger.warn('[admin/metrics/key] onboarding funnel query failed:', err);
    }

    // ── Trend: same numbers for the previous 30d window for delta context ───
    const [prevPayingNow, prevSignups] = await Promise.all([
      prisma.subscription.count({
        where: {
          plan: { not: 'free' },
          createdAt: { lte: previousWindowStart },
          OR: [
            { endDate: null },
            { endDate: { gte: previousWindowStart } },
          ],
        },
      }),
      prisma.user.count({ where: { createdAt: { gte: previousWindowStart, lt: windowStart } } }),
    ]);

    const payload = {
      generatedAt: now.toISOString(),
      // Window the response covers, so the client can label charts and
      // pick the right axis without re-deriving from `days` query param.
      windowDays: days,
      payingUsers: {
        current: payingNow,
        thirtyDaysAgo: payingThirtyDaysAgo,
        deltaPct: payingThirtyDaysAgo > 0
          ? Math.round(((payingNow - payingThirtyDaysAgo) / payingThirtyDaysAgo) * 1000) / 10
          : null,
      },
      monthlyChurn: {
        churnedLast30,
        avgPaying: Math.round(avgPaying * 10) / 10,
        churnPct: monthlyChurnPct,
        // Healthy benchmark for early-stage consumer SaaS: <10% monthly. Above
        // that and acquisition can't keep up regardless of channel.
        healthyThreshold: 10,
        isHealthy: monthlyChurnPct <= 10,
      },
      arpu: {
        rub: arpuRub,
        sampleSize: activeSubs.length,
        totalMrrRub,
        // Healthy ARPU for RU fitness market: ≥400 ₽/mo. Below = paid acquisition
        // doesn't pencil out unless retention is >12 months.
        healthyThreshold: 400,
        isHealthy: arpuRub >= 400,
      },
      activation: {
        cohortSize,
        activated24h,
        activationRatePct,
        medianTtfMinutes,
        healthyThreshold: 50,
        isHealthy: activationRatePct >= 50,
      },
      funnel: {
        signups: funnelSignups,
        profiled: funnelProfiled,
        firstWorkout: funnelFirstWorkout,
        firstChat: funnelFirstChat,
        paid: funnelPaid,
        // Conversion rates between consecutive steps — easier to read than the
        // raw counts when comparing across periods.
        signupToProfiledPct: funnelSignups > 0 ? Math.round((funnelProfiled / funnelSignups) * 1000) / 10 : 0,
        profiledToFirstChatPct: funnelProfiled > 0 ? Math.round((funnelFirstChat / funnelProfiled) * 1000) / 10 : 0,
        firstChatToPaidPct: funnelFirstChat > 0 ? Math.round((funnelPaid / funnelFirstChat) * 1000) / 10 : 0,
        signupToPaidPct: funnelSignups > 0 ? Math.round((funnelPaid / funnelSignups) * 1000) / 10 : 0,
      },
      previous30d: {
        payingUsers: prevPayingNow,
        signups: prevSignups,
      },
      onboardingFunnel,
    };

    adminStatsCache.set(KEY_METRICS_CACHE_KEY, payload, KEY_METRICS_CACHE_TTL);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (e) {
    logger.error('GET /admin/metrics/key:', e);
    res.status(500).json({ error: 'Ошибка получения ключевых метрик' });
  }
});

/**
 * GET /admin/digest/preview — return today's admin digest stats without
 * sending email/push. Useful for verifying the cron output before 06:00 UTC
 * fires for real. No side effects.
 */
router.get('/digest/preview', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const { computeDigestStats } = await import('../services/adminDigestService');
    const stats = await computeDigestStats();
    res.json(stats);
  } catch (e) {
    logger.error('GET /admin/digest/preview:', e);
    res.status(500).json({ error: 'Ошибка получения превью дайджеста' });
  }
});

/**
 * GET /admin/digest/readiness — diagnostic endpoint that reports whether
 * everything required for the daily digest is in place.
 *
 * Two response shapes depending on caller role:
 *
 * 1. Caller is ADMIN → full payload with per-recipient status (which
 *    admin will get the digest tomorrow morning, push token status,
 *    bootstrap email value, admin email list).
 *
 * 2. Caller is NOT admin → minimal self-info payload. Earlier this route
 *    returned the full admin email array to ANY authenticated user
 *    (the doc said it was bootstrap-friendly: "the answer tells them
 *    whether they are admin"). But that goal only needs the caller's
 *    OWN status — leaking the bootstrap email value and the email of
 *    every other admin is a PII leak with no bootstrap benefit. The
 *    minimal shape still answers the bootstrap question:
 *      - youAreAdmin: tells the founder if their account took the role
 *      - bootstrapEmailRegistered: tells them if the email they set in
 *        env actually corresponds to a registered account yet
 *      - smtpConfigured: env diagnostic
 *    Crucially we do NOT echo back the bootstrap email value or any
 *    other admin's email/firstName/id.
 *
 * Rate-limited via the global admin limiter upstream.
 */
router.get('/digest/readiness', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() ?? null;

    const { isSmtpConfigured } = await import('../services/emailService');
    const smtpConfigured = isSmtpConfigured();

    let bootstrapEmailRegistered = false;
    if (bootstrapEmail) {
      const exists = await prisma.user.count({ where: { email: bootstrapEmail } });
      bootstrapEmailRegistered = exists > 0;
    }

    const isAdmin = req.userRole === 'ADMIN';

    if (!isAdmin) {
      // Minimal self-info shape for non-admins. Bootstrap UX preserved
      // (founder sees if SMTP + their email registration is in place)
      // without leaking the email list of other admins.
      return res.json({
        youAreAdmin: false,
        bootstrapEmailRegistered,
        smtpConfigured,
      });
    }

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isBanned: false },
      select: {
        id: true,
        email: true,
        firstName: true,
        pushTokens: { select: { id: true } },
      },
    });

    res.json({
      youAreAdmin: true,
      adminCount: admins.length,
      bootstrapEmail,
      bootstrapEmailRegistered,
      smtpConfigured,
      admins: admins.map((a) => ({
        id: a.id,
        email: a.email,
        firstName: a.firstName,
        hasPushToken: a.pushTokens.length > 0,
        pushTokenCount: a.pushTokens.length,
        hasEmail: Boolean(a.email),
      })),
      // Surface the single critical question: will the next 09:00 МСК cron
      // deliver a usable digest to anyone? True iff at least one admin has
      // both an email AND SMTP is configured (push is bonus — most useful
      // is email since it persists in inbox).
      readyForNextDigest: smtpConfigured && admins.some((a) => Boolean(a.email)),
    });
  } catch (e) {
    logger.error('GET /admin/digest/readiness:', e);
    res.status(500).json({ error: 'Ошибка проверки готовности дайджеста' });
  }
});

/**
 * POST /admin/digest/send-now — fire the digest immediately to all admins.
 * Use sparingly; meant for manual testing right after deploy. Returns the
 * delivery count.
 */
router.post('/digest/send-now', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { sendDailyAdminDigest } = await import('../services/adminDigestService');
    const sent = await sendDailyAdminDigest();
    // Round 233 (security audit): the only mutating admin endpoint that
    // wasn't writing to AdminLog. Sending the digest pushes notifications
    // and emails to every admin — must show up in /admin/logs alongside
    // bans, role changes, etc., so we can audit "who triggered the 03:00
    // notification storm" later.
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'DIGEST_SEND_NOW',
        targetId: null,
        details: `sent=${sent}`,
      },
    }).catch(() => { /* best-effort audit */ });
    res.json({ sent });
  } catch (e) {
    logger.error('POST /admin/digest/send-now:', e);
    res.status(500).json({ error: 'Ошибка отправки дайджеста' });
  }
});

/** GET /admin/analytics/export — CSV export of daily timeline data */
router.get('/analytics/export', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { days = '30' } = req.query as Record<string, string>;
    const numDays = Math.min(365, Math.max(1, parseInt(days, 10) || 30));
    const now = new Date();
    const start = new Date(now.getTime() - numDays * 86400 * 1000);

    // Per-day aggregation pushed down to Postgres. `groupBy({ by: ['createdAt'] })` on a
    // timestamp column creates one bucket per unique millisecond — effectively a full scan
    // returning one row per record. DATE_TRUNC collapses to one row per day.
    type DailyCount = { day: Date; count: bigint };
    const [signups, workouts, aiMessages, cardio] = await Promise.all([
      prisma.$queryRaw<DailyCount[]>`SELECT DATE_TRUNC('day', "createdAt")::date AS day, COUNT(*)::bigint AS count FROM "User" WHERE "createdAt" >= ${start} GROUP BY day`,
      prisma.$queryRaw<DailyCount[]>`SELECT DATE_TRUNC('day', "completedAt")::date AS day, COUNT(*)::bigint AS count FROM "Workout" WHERE "completedAt" >= ${start} GROUP BY day`,
      prisma.$queryRaw<DailyCount[]>`SELECT DATE_TRUNC('day', "createdAt")::date AS day, COUNT(*)::bigint AS count FROM "ChatMessage" WHERE role = 'user' AND "createdAt" >= ${start} GROUP BY day`,
      prisma.$queryRaw<DailyCount[]>`SELECT DATE_TRUNC('day', "createdAt")::date AS day, COUNT(*)::bigint AS count FROM "CardioSession" WHERE "createdAt" >= ${start} GROUP BY day`,
    ]);

    const buckets: Record<string, { signups: number; workouts: number; ai: number; cardio: number }> = {};
    for (let i = 0; i < numDays; i++) {
      const d = new Date(start.getTime() + i * 86400 * 1000);
      buckets[d.toISOString().split('T')[0]] = { signups: 0, workouts: 0, ai: 0, cardio: 0 };
    }
    const keyOf = (d: Date) => d.toISOString().split('T')[0];
    signups.forEach((r) => { const k = keyOf(r.day); if (buckets[k]) buckets[k].signups += Number(r.count); });
    workouts.forEach((r) => { const k = keyOf(r.day); if (buckets[k]) buckets[k].workouts += Number(r.count); });
    aiMessages.forEach((r) => { const k = keyOf(r.day); if (buckets[k]) buckets[k].ai += Number(r.count); });
    cardio.forEach((r) => { const k = keyOf(r.day); if (buckets[k]) buckets[k].cardio += Number(r.count); });

    const header = 'date,signups,workouts,ai_messages,cardio_sessions';
    const rows = Object.entries(buckets).map(([date, v]) => `${date},${v.signups},${v.workouts},${v.ai},${v.cardio}`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="analytics_${numDays}d_${now.toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + [header, ...rows].join('\n'));
  } catch (e) {
    logger.error('GET /admin/analytics/export:', e);
    res.status(500).json({ error: 'Ошибка экспорта аналитики' });
  }
});

// ── ADMIN LOG ────────────────────────────────────────────────────────────────

/** GET /admin/logs — recent admin actions with filter */
router.get('/logs', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '50', action, adminId, search, from, to } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;
    const where: any = {};
    if (action) where.action = action;
    if (adminId) where.adminId = adminId;
    if (search) {
      if (search.length > 100) return res.status(400).json({ error: 'Запрос слишком длинный' });
      where.OR = [
        { details: { contains: search, mode: 'insensitive' } },
        { admin: { email: { contains: search, mode: 'insensitive' } } },
        { admin: { firstName: { contains: search, mode: 'insensitive' } } },
        { admin: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (from || to) {
      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;
      if ((fromDate && isNaN(fromDate.getTime())) || (toDate && isNaN(toDate.getTime()))) {
        return res.status(400).json({ error: 'Некорректный формат даты (from/to)' });
      }
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }
    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where,
        include: { admin: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.adminLog.count({ where }),
    ]);
    res.json({ logs, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (e) {
    logger.error('GET /admin/logs:', e);
    res.status(500).json({ error: 'Ошибка получения логов' });
  }
});

/** GET /admin/logs/export — CSV export of admin audit log */
router.get('/logs/export', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { action, adminId, from, to } = req.query as Record<string, string>;
    const where: any = {};
    if (action) where.action = action;
    if (adminId) where.adminId = adminId;
    if (from || to) {
      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;
      if ((fromDate && isNaN(fromDate.getTime())) || (toDate && isNaN(toDate.getTime()))) {
        return res.status(400).json({ error: 'Некорректный формат даты (from/to)' });
      }
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }
    const logs = await prisma.adminLog.findMany({
      where,
      include: { admin: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const logCsvCell = (v: unknown): string => {
      let s = String(v ?? '');
      if (['+', '-', '=', '@', '\t', '\r'].includes(s[0])) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = [['id', 'action', 'admin_email', 'admin_name', 'targetId', 'details', 'createdAt'].join(',')];
    for (const l of logs) {
      rows.push([
        l.id,
        l.action,
        l.admin?.email ?? '',
        `${l.admin?.firstName ?? ''} ${l.admin?.lastName ?? ''}`.trim(),
        l.targetId ?? '',
        l.details ?? '',
        l.createdAt.toISOString(),
      ].map(logCsvCell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="admin_logs_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(rows.join('\n'));
  } catch (e) {
    logger.error('GET /admin/logs/export:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── SUPPORT MANAGEMENT (staff — admin or support role) ───────────────────────

/** GET /admin/support — all tickets with filters */
router.get('/support', requireStaff, async (req: AuthRequest, res: Response) => {
  try {
    const { status, priority, assignedToMe, search, sort = 'priority', page = '1', limit = '20' } = req.query as Record<string, string>;
    const VALID_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
    const VALID_TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
    const where: any = {};
    if (status && VALID_TICKET_STATUSES.includes(status)) where.status = status;
    if (priority && VALID_TICKET_PRIORITIES.includes(priority)) where.priority = priority;
    if (assignedToMe === 'true') where.assignedToId = req.userId;
    if (search) {
      if (search.length > 100) return res.status(400).json({ error: 'Запрос слишком длинный' });
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Build sort order
    const orderBy: any[] =
      sort === 'oldest' ? [{ createdAt: 'asc' }] :
      sort === 'newest' ? [{ updatedAt: 'desc' }] :
      sort === 'created_desc' ? [{ createdAt: 'desc' }] :
      [{ priority: 'desc' }, { status: 'asc' }, { updatedAt: 'desc' }]; // default: priority

    const pageNum2 = Math.max(1, parseInt(page, 10) || 1);
    const limitNum2 = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum2 - 1) * limitNum2;
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        take: limitNum2,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { author: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy,
        skip,
      }),
      prisma.supportTicket.count({ where }),
    ]);
    res.json({ tickets, total, page: pageNum2, pages: Math.ceil(total / limitNum2) });
  } catch (e) {
    logger.error('GET /admin/support:', e);
    res.status(500).json({ error: 'Ошибка получения тикетов поддержки' });
  }
});

/** GET /admin/support/counts — quick counts per status for badge display */
router.get('/support/counts', requireStaff, async (_req: AuthRequest, res: Response) => {
  try {
    const counts = await prisma.supportTicket.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    res.json(Object.fromEntries(counts.map((c) => [c.status, c._count.id])));
  } catch (e) {
    logger.error('GET /admin/support/counts:', e);
    res.status(500).json({ error: 'Ошибка получения счётчиков' });
  }
});

/** GET /admin/support/metrics — performance stats for support queue */
router.get('/support/metrics', requireStaff, async (_req: AuthRequest, res: Response) => {
  try {
    const todayStart = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000);

    const [resolvedToday, openCount, unassigned, categoryCounts, ticketsWithFirstReply, staffAssignedCounts] = await Promise.all([
      prisma.supportTicket.count({ where: { status: { in: ['resolved', 'closed'] }, updatedAt: { gte: todayStart } } }),
      prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] } } }),
      prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] }, assignedToId: null } }),
      prisma.supportTicket.groupBy({ by: ['category'], _count: { id: true } }),
      // Get first staff message time for tickets created this week to compute avg response time
      prisma.supportTicket.findMany({
        where: { createdAt: { gte: weekStart } },
        take: 500,
        select: {
          createdAt: true,
          messages: {
            where: { isStaff: true, isInternal: false },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      // Staff workload: open/in-progress tickets per assignee
      prisma.supportTicket.groupBy({
        by: ['assignedToId'],
        where: { status: { in: ['open', 'in_progress'] }, assignedToId: { not: null } },
        _count: { id: true },
      }),
    ]);

    // Compute avg first response time in hours
    const responseTimes = ticketsWithFirstReply
      .filter((t) => t.messages.length > 0)
      .map((t) => (new Date(t.messages[0].createdAt).getTime() - new Date(t.createdAt).getTime()) / 3600000);
    const avgResponseHours = responseTimes.length > 0
      ? Math.round((responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length) * 10) / 10
      : null;

    // Enrich staff workload with names
    const staffIds = staffAssignedCounts.map((s) => s.assignedToId).filter(Boolean) as string[];
    const staffDetails = staffIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const staffWorkload = staffAssignedCounts.map((s) => {
      const staff = staffDetails.find((d) => d.id === s.assignedToId);
      return { id: s.assignedToId!, name: `${staff?.firstName ?? ''} ${staff?.lastName ?? ''}`.trim(), count: s._count.id };
    });

    res.json({
      resolvedToday,
      openCount,
      unassigned,
      avgResponseHours,
      categoryBreakdown: Object.fromEntries(categoryCounts.map((c) => [c.category, c._count.id])),
      staffWorkload,
    });
  } catch (e) {
    logger.error('GET /admin/support/metrics:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/** GET /admin/support/export — export tickets as CSV */
router.get('/support/export', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const ticketCsvCell = (v: unknown): string => {
      let s = String(v ?? '');
      if (['+', '-', '=', '@', '\t', '\r'].includes(s[0])) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = 'ID,Subject,Category,Status,Priority,User Email,User Name,Assigned To,Messages,Created,Updated';
    const rows = tickets.map((t) => [
      t.id, t.subject, t.category, t.status, t.priority,
      t.user?.email, `${t.user?.firstName} ${t.user?.lastName ?? ''}`.trim(),
      t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName ?? ''}`.trim() : '',
      t.messages.length,
      t.createdAt.toISOString(), t.updatedAt.toISOString(),
    ].map(ticketCsvCell).join(','));
    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=tickets.csv');
    res.send('\uFEFF' + csv);
  } catch (e) {
    logger.error('GET /admin/support/export:', e);
    res.status(500).json({ error: 'Ошибка экспорта' });
  }
});

/** POST /admin/support/:id/note — add internal staff note (not visible to user) */
router.post('/support/:id/note', requireStaff, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(req.body);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id as string } });
    if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
    const note = await prisma.supportMessage.create({
      data: {
        content,
        ticketId: ticket.id,
        authorId: req.userId!,
        isStaff: true,
        isInternal: true,
      },
      include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });
    res.status(201).json(note);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /admin/support/:id/note:', e);
    res.status(500).json({ error: 'Ошибка добавления заметки' });
  }
});

/** GET /admin/staff — list staff/admin users for ticket assignment */
router.get('/staff', requireStaff, async (_req: AuthRequest, res: Response) => {
  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: ['SUPPORT', 'ADMIN'] as any }, isBanned: false },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
      orderBy: { firstName: 'asc' },
    });
    res.json(staff);
  } catch (e) {
    logger.error('GET /admin/staff:', e);
    res.status(500).json({ error: 'Ошибка получения списка сотрудников' });
  }
});

/** PATCH /admin/support/:id/assign — assign ticket to a staff member (or unassign with null) */
router.patch('/support/:id/assign', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { assignedToId } = z.object({ assignedToId: z.string().cuid().nullable() }).parse(req.body);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id as string } });
    if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
    // Validate assignee is staff if not null. Round 82: also check
    // isBanned — a banned admin/support shouldn't get assigned new
    // tickets. The user-route equivalent at routes/support.ts:283
    // (PATCH /support/tickets/:id/assign) already checks isBanned;
    // this admin route was the inconsistent one.
    if (assignedToId) {
      const assignee = await prisma.user.findUnique({
        where: { id: assignedToId },
        select: { role: true, isBanned: true },
      });
      if (!assignee || assignee.isBanned || !['SUPPORT', 'ADMIN'].includes(assignee.role)) {
        return res.status(400).json({ error: 'Назначенный пользователь не является сотрудником' });
      }
    }
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { assignedToId, updatedAt: new Date() },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
      },
    });
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'ASSIGN_TICKET',
        targetId: ticket.id,
        details: assignedToId ? `Assigned to ${assignedToId}` : 'Unassigned',
      },
    });
    res.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('PATCH /admin/support/:id/assign:', e);
    res.status(500).json({ error: 'Ошибка назначения тикета' });
  }
});

// ── ANNOUNCEMENTS ─────────────────────────────────────────────────────────────

const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  type: z.enum(['info', 'warning', 'maintenance', 'promo']).default('info'),
  endsAt: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'Некорректная дата endsAt').optional(),
  isActive: z.boolean().optional(),
  targetRole: z.string().nullable().optional(),
});

/** GET /admin/announcements — list all announcements */
router.get('/announcements', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const list = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { firstName: true, lastName: true } } },
      take: 200,
    });
    res.json(list);
  } catch (e) {
    logger.error('GET /admin/announcements:', e);
    res.status(500).json({ error: 'Ошибка получения объявлений' });
  }
});

/** GET /admin/announcements/active — active announcements for client display */
router.get('/announcements/active', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    // Get user's subscription plan if needed for targeting
    const userSub = await prisma.subscription.findFirst({ where: { userId: req.userId! }, select: { plan: true, status: true, endDate: true } });
    const subActive = (userSub?.status === 'active' || userSub?.status === 'cancelled') && (!userSub.endDate || userSub.endDate >= now);
    const userPlan = subActive ? userSub!.plan : 'free';
    // Round 80: targeting matches by EITHER subscription plan ('free' / 'pro' /
    // 'trainer' / 'club') OR user role ('USER' / 'TRAINER' / 'SUPPORT' /
    // 'ADMIN'). The /announcements/preview audience-sizer at line 2569 already
    // accepts both, but this delivery endpoint only matched plans — so an
    // admin who set targetRole='ADMIN' silently delivered to no one because
    // userPlan is always 'free' or a plan name, never a role string.
    // req.userRole is set by the authenticate middleware, no extra query.
    const userRole = req.userRole ?? null;
    const list = await prisma.announcement.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          {
            OR: [
              { targetRole: null },
              { targetRole: userPlan },
              ...(userRole ? [{ targetRole: userRole }] : []),
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, body: true, type: true, createdAt: true },
      take: 20,
    });
    // Increment view count for all returned announcements (fire-and-forget)
    if (list.length > 0) {
      prisma.announcement.updateMany({ where: { id: { in: list.map((a) => a.id) } }, data: { viewCount: { increment: 1 } } }).catch(() => {});
    }
    res.json(list);
  } catch (e) {
    logger.error('GET /admin/announcements/active:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/** GET /admin/announcements/preview — estimate audience size for a given targetRole */
router.get('/announcements/preview', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { targetRole } = req.query as Record<string, string>;
    const where: any = { isBanned: false };
    if (targetRole) {
      // Map subscription plans and roles to user filters
      const VALID_PLANS = ['free', 'pro', 'trainer', 'club'];
      const VALID_ROLES = ['GUEST', 'VISITOR', 'CLIENT', 'TRAINER', 'SUPPORT', 'ADMIN'];
      if (VALID_PLANS.includes(targetRole)) {
        // Round 83: match the same "is paying / has access" semantics that
        // /announcements/active uses (the `subActive` ternary above), so the
        // preview number doesn't undercount the actual delivery audience.
        // active = currently paying; cancelled-not-yet-expired = still has
        // access until endDate. Both see the announcement at delivery time;
        // the previous filter only counted the `active` half.
        const now = new Date();
        where.subscription = {
          plan: targetRole,
          status: { in: ['active', 'cancelled'] },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        };
      } else if (VALID_ROLES.includes(targetRole.toUpperCase())) {
        where.role = targetRole.toUpperCase();
      }
      // else: unrecognised filter — count all non-banned users (safe fallback)
    }
    const count = await prisma.user.count({ where });
    res.json({ count });
  } catch (e) {
    logger.error('GET /admin/announcements/preview:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/** POST /admin/announcements — create announcement */
router.post('/announcements', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = announcementSchema.parse(req.body);
    const ann = await prisma.announcement.create({
      data: {
        title: data.title,
        body: data.body,
        type: data.type,
        isActive: data.isActive ?? true,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        targetRole: data.targetRole ?? null,
        authorId: req.userId!,
      },
    });
    await prisma.adminLog.create({
      data: { adminId: req.userId!, action: 'CREATE_ANNOUNCEMENT', details: data.title },
    });
    res.status(201).json(ann);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /admin/announcements:', e);
    res.status(500).json({ error: 'Ошибка создания объявления' });
  }
});

/** PATCH /admin/announcements/:id — update (e.g., deactivate) */
router.patch('/announcements/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const data = announcementSchema.partial().parse(req.body);
    const ann = await prisma.announcement.update({
      where: { id: req.params.id as string },
      data: {
        ...data,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
      },
    });
    await prisma.adminLog.create({
      data: { adminId: req.userId!, action: 'UPDATE_ANNOUNCEMENT', details: ann.title },
    });
    res.json(ann);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    if (isNotFound(e)) return res.status(404).json({ error: 'Объявление не найдено' });
    logger.error('PATCH /admin/announcements/:id:', e);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

/** POST /admin/announcements/:id/duplicate — create a copy with "(копия)" suffix */
router.post('/announcements/:id/duplicate', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const original = await prisma.announcement.findUnique({ where: { id: req.params.id as string } });
    if (!original) return res.status(404).json({ error: 'Объявление не найдено' });
    const copy = await prisma.announcement.create({
      data: {
        title: `${original.title} (копия)`,
        body: original.body,
        type: original.type,
        isActive: false, // start inactive
        endsAt: original.endsAt,
        targetRole: original.targetRole,
        authorId: req.userId!,
      },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
    res.status(201).json(copy);
  } catch (e) {
    logger.error('POST /admin/announcements/:id/duplicate:', e);
    res.status(500).json({ error: 'Ошибка дублирования' });
  }
});

/** DELETE /admin/announcements/:id */
router.delete('/announcements/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const ann = await prisma.announcement.delete({ where: { id: req.params.id as string } });
    await prisma.adminLog.create({
      data: { adminId: req.userId!, action: 'DELETE_ANNOUNCEMENT', details: ann.title },
    });
    res.json({ ok: true });
  } catch (e) {
    if (isNotFound(e)) return res.status(404).json({ error: 'Объявление не найдено' });
    logger.error('DELETE /admin/announcements/:id:', e);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

/** GET /admin/report/daily — generate text summary for a given date (defaults to today) */
router.get('/report/daily', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query as Record<string, string>;
    const targetStr = date ? date.trim() : new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetStr) || isNaN(Date.parse(targetStr))) {
      return res.status(400).json({ error: 'Некорректная дата. Формат: YYYY-MM-DD' });
    }
    const dayStart = new Date(`${targetStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${targetStr}T23:59:59.999Z`);
    const prevDayStart = new Date(dayStart.getTime() - 86_400_000);
    const prevDayEnd = new Date(dayEnd.getTime() - 86_400_000);

    const PLAN_PRICE: Record<string, number> = { pro: 9.99, trainer: 19.99, club: 29.99 };

    const [
      signups, prevSignups,
      workouts, prevWorkouts,
      aiMessages, prevAi,
      cardio, prevCardio,
      meals, prevMeals,
      newSubs, openTickets, resolvedTickets,
      totalUsers, activeSubs,
    ] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.user.count({ where: { createdAt: { gte: prevDayStart, lte: prevDayEnd } } }),
      prisma.workout.count({ where: { completedAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.workout.count({ where: { completedAt: { gte: prevDayStart, lte: prevDayEnd } } }),
      prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: prevDayStart, lte: prevDayEnd } } }),
      prisma.cardioSession.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.cardioSession.count({ where: { createdAt: { gte: prevDayStart, lte: prevDayEnd } } }),
      prisma.meal.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.meal.count({ where: { createdAt: { gte: prevDayStart, lte: prevDayEnd } } }),
      prisma.subscription.count({ where: { plan: { not: 'free' }, createdAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] } } }),
      prisma.supportTicket.count({ where: { status: 'resolved', updatedAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.user.count(),
      // MRR: aggregate plan counts in SQL rather than loading all rows into Node.js
      prisma.$queryRaw<Array<{ plan: string; cnt: bigint }>>`
        SELECT plan, COUNT(*)::bigint AS cnt FROM "Subscription"
        WHERE status = 'active' AND plan != 'free'
        GROUP BY plan
      `,
    ]);

    const mrr = (activeSubs as Array<{ plan: string; cnt: bigint }>).reduce(
      (sum, s) => sum + (PLAN_PRICE[s.plan] ?? 0) * Number(s.cnt), 0
    );

    function delta(now: number, prev: number): string {
      if (prev === 0) return now > 0 ? ` (+${now})` : '';
      const d = now - prev;
      if (d === 0) return ' (=)';
      return d > 0 ? ` (+${d})` : ` (${d})`;
    }

    const dateLabel = dayStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const lines = [
      `📊 Giron — Отчёт за ${dateLabel}`,
      ``,
      `👤 Новых пользователей: ${signups}${delta(signups, prevSignups)}`,
      `💪 Тренировок завершено: ${workouts}${delta(workouts, prevWorkouts)}`,
      `🤖 ИИ-сообщений: ${aiMessages}${delta(aiMessages, prevAi)}`,
      `🏃 Кардио-сессий: ${cardio}${delta(cardio, prevCardio)}`,
      `🍽 Приёмов пищи: ${meals}${delta(meals, prevMeals)}`,
      ``,
      `💳 Новых подписок: ${newSubs}`,
      `💰 MRR (оценка): $${mrr.toFixed(0)}`,
      ``,
      `🎧 Открытых тикетов: ${openTickets}`,
      `✅ Решено сегодня: ${resolvedTickets}`,
      ``,
      `📈 Всего пользователей: ${totalUsers}`,
      ``,
      `Сформировано: ${new Date().toLocaleString('ru-RU')}`,
    ];

    res.json({ report: lines.join('\n'), date: dayStart.toISOString().split('T')[0], metrics: { signups, workouts, aiMessages, cardio, meals, mrr: Math.round(mrr), newSubscriptions: newSubs, openTickets } });
  } catch (e) {
    logger.error('GET /admin/report/daily:', e);
    res.status(500).json({ error: 'Ошибка генерации отчёта' });
  }
});

/** GET /admin/users/top-revenue — users with highest subscription value (active paid plans) */
router.get('/users/top-revenue', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const PLAN_PRICE: Record<string, number> = { pro: 9.99, trainer: 19.99, club: 29.99 };
    const users = await prisma.user.findMany({
      where: { isBanned: false, subscription: { status: 'active', plan: { not: 'free' } } },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        subscription: { select: { plan: true, startDate: true, endDate: true } },
        _count: { select: { workouts: true, chatMessages: true } },
      },
      take: 20,
    });

    const result = users
      .map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        plan: u.subscription?.plan ?? 'free',
        revenue: PLAN_PRICE[u.subscription?.plan ?? 'free'] ?? 0,
        workouts: u._count.workouts,
        aiMessages: u._count.chatMessages,
        endDate: u.subscription?.endDate ?? null,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.workouts - a.workouts);

    res.json(result);
  } catch (e) {
    logger.error('GET /admin/users/top-revenue:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/** GET /admin/users/churn-risk — paid users at risk of churning (no workout in 14+ days) */
router.get('/users/churn-risk', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const cutoff = new Date(Date.now() - 14 * 86400 * 1000);
    const users = await prisma.user.findMany({
      where: {
        isBanned: false,
        subscription: { status: 'active', plan: { not: 'free' } },
        workouts: { none: { completedAt: { gte: cutoff } } },
      },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        subscription: { select: { plan: true, endDate: true } },
        workouts: {
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { completedAt: true },
          where: { completedAt: { not: null } },
        },
        _count: { select: { workouts: true } },
      },
      take: 20,
      orderBy: { createdAt: 'asc' }, // oldest first = highest risk
    });

    const result = users.map((u) => {
      const lastWorkout = u.workouts[0]?.completedAt ?? null;
      const daysSinceWorkout = lastWorkout
        ? Math.floor((Date.now() - lastWorkout.getTime()) / 86400000)
        : null;
      const daysUntilExpiry = u.subscription?.endDate
        ? Math.ceil((new Date(u.subscription.endDate).getTime() - Date.now()) / 86400000)
        : null;
      return {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        plan: u.subscription?.plan ?? 'free',
        totalWorkouts: u._count.workouts,
        daysSinceWorkout,
        daysUntilExpiry,
        riskScore: (daysSinceWorkout ?? 99) + (daysUntilExpiry != null && daysUntilExpiry < 30 ? 50 : 0),
      };
    }).sort((a, b) => b.riskScore - a.riskScore);

    res.json(result);
  } catch (e) {
    logger.error('GET /admin/users/churn-risk:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/** GET /admin/subscriptions/forecast — upcoming subscription expirations by week */
router.get('/subscriptions/forecast', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const weeks = 4;
    const PLAN_PRICE: Record<string, number> = { pro: 9.99, trainer: 19.99, club: 29.99 };

    // Round 269: replaced findMany({take: 50000}) + JS bucket-and-sum
    // with a single $queryRaw that GROUP BYs week_trunc + plan in
    // Postgres. Avoids loading up to 50K subscription rows into the
    // Node process for what's just a 4-week × 3-plan = 12-row result.
    // Memory delta: ~5MB → ~1KB on a busy month.
    const rows = await prisma.$queryRaw<Array<{
      week_start: Date;
      plan: string;
      sub_count: bigint;
    }>>`
      SELECT
        DATE_TRUNC('week', "endDate")::date AS week_start,
        plan,
        COUNT(*)::bigint AS sub_count
      FROM "Subscription"
      WHERE status = 'active'
        AND plan != 'free'
        AND "endDate" >= ${now}
        AND "endDate" < ${new Date(now.getTime() + weeks * 7 * 86400 * 1000)}
      GROUP BY week_start, plan
      ORDER BY week_start ASC
    `;

    // Build a 4-week scaffold so empty weeks still appear in the
    // response (frontend chart needs continuous x-axis).
    const forecast: Array<{ weekStart: string; weekEnd: string; count: number; revenue: number }> = [];
    for (let i = 0; i < weeks; i++) {
      const start = new Date(now.getTime() + i * 7 * 86400 * 1000);
      const end = new Date(start.getTime() + 7 * 86400 * 1000);
      const startStr = start.toISOString().split('T')[0];
      const matching = rows.filter((r) => {
        const rowDate = new Date(r.week_start);
        return rowDate >= start && rowDate < end;
      });
      const count = matching.reduce((sum, r) => sum + Number(r.sub_count), 0);
      const revenue = matching.reduce((sum, r) => sum + Number(r.sub_count) * (PLAN_PRICE[r.plan] ?? 0), 0);
      forecast.push({
        weekStart: startStr,
        weekEnd: end.toISOString().split('T')[0],
        count,
        revenue: Math.round(revenue * 100) / 100,
      });
    }

    res.json(forecast);
  } catch (e) {
    logger.error('GET /admin/subscriptions/forecast:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/** GET /admin/analytics/segments — engagement metrics by subscription plan */
const SEGMENTS_CACHE_KEY = 'analytics:segments';
const SEGMENTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — 16 join-heavy queries underneath
router.get('/analytics/segments', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const cached = adminStatsCache.get(SEGMENTS_CACHE_KEY);
    if (cached) return res.json(cached);

    const thirtyAgo = new Date(Date.now() - 30 * 86400 * 1000);
    const sevenAgo = new Date(Date.now() - 7 * 86400 * 1000);
    const plans = ['free', 'pro', 'trainer', 'club'];

    const results = await Promise.all(
      plans.map(async (plan) => {
        const userFilter = plan === 'free'
          ? { OR: [{ subscription: null }, { subscription: { plan: 'free' } }] }
          : { subscription: { plan, status: 'active' } };

        const [userCount, workouts30d, ai30d, activeLastWeek] = await Promise.all([
          prisma.user.count({ where: { isBanned: false, ...userFilter } }),
          prisma.workout.count({ where: { completedAt: { gte: thirtyAgo }, user: { ...userFilter } } }),
          prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: thirtyAgo }, user: { ...userFilter } } }),
          prisma.workout.groupBy({
            by: ['userId'],
            where: { completedAt: { gte: sevenAgo }, user: { ...userFilter } },
          }).then((r) => r.length),
        ]);

        return {
          plan,
          userCount,
          workouts30d,
          ai30d,
          activeLastWeek,
          avgWorkoutsPerUser: userCount > 0 ? Math.round((workouts30d / userCount) * 10) / 10 : 0,
          avgAiPerUser: userCount > 0 ? Math.round((ai30d / userCount) * 10) / 10 : 0,
          activeRate: userCount > 0 ? Math.round((activeLastWeek / userCount) * 100) : 0,
        };
      })
    );

    const payload = results.filter((r) => r.userCount > 0);
    adminStatsCache.set(SEGMENTS_CACHE_KEY, payload, SEGMENTS_CACHE_TTL_MS);
    res.json(payload);
  } catch (e) {
    logger.error('GET /admin/analytics/segments:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/** GET /admin/activity-feed — last N platform events across all activity types */
router.get('/activity-feed', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const limit = 10;
    const [recentWorkouts, recentSignups, recentAi, recentCardio] = await Promise.all([
      prisma.workout.findMany({
        where: { completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: limit,
        select: {
          id: true, name: true, completedAt: true, totalVolume: true, durationMinutes: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, firstName: true, lastName: true, createdAt: true, role: true },
      }),
      prisma.chatMessage.findMany({
        where: { role: 'user' },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, content: true, createdAt: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.cardioSession.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, type: true, durationMinutes: true, distanceKm: true, createdAt: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    type FeedEvent = {
      id: string;
      type: 'workout' | 'signup' | 'ai' | 'cardio';
      label: string;
      userId?: string;
      userName?: string;
      date: string;
    };

    const events: FeedEvent[] = [
      ...recentWorkouts.map((w) => ({
        id: 'w_' + w.id,
        type: 'workout' as const,
        label: `${w.user.firstName} завершил тренировку "${w.name}"${w.totalVolume ? ` · ${Math.round(w.totalVolume)} кг` : ''}`,
        userId: w.user.id,
        userName: `${w.user.firstName} ${w.user.lastName ?? ''}`.trim(),
        date: w.completedAt!.toISOString(),
      })),
      ...recentSignups.map((u) => ({
        id: 'u_' + u.id,
        type: 'signup' as const,
        label: `Новый пользователь: ${u.firstName} ${u.lastName ?? ''}`.trim(),
        userId: u.id,
        userName: `${u.firstName} ${u.lastName ?? ''}`.trim(),
        date: u.createdAt.toISOString(),
      })),
      ...recentAi.map((m) => ({
        id: 'ai_' + m.id,
        type: 'ai' as const,
        label: `${m.user.firstName}: "${m.content.slice(0, 60)}${m.content.length > 60 ? '…' : ''}"`,
        userId: m.user.id,
        userName: `${m.user.firstName} ${m.user.lastName ?? ''}`.trim(),
        date: m.createdAt.toISOString(),
      })),
      ...recentCardio.map((c) => ({
        id: 'c_' + c.id,
        type: 'cardio' as const,
        label: `${c.user.firstName}: кардио ${c.type} · ${c.durationMinutes} мин${c.distanceKm ? ` · ${c.distanceKm} км` : ''}`,
        userId: c.user.id,
        userName: `${c.user.firstName} ${c.user.lastName ?? ''}`.trim(),
        date: c.createdAt.toISOString(),
      })),
    ];

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(events.slice(0, 20));
  } catch (e) {
    logger.error('GET /admin/activity-feed:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/** GET /admin/moderation/search — search AI messages and support tickets for a keyword */
router.get('/moderation/search', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query as Record<string, string>;
    if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Запрос слишком короткий' });
    if (q.trim().length > 100) return res.status(400).json({ error: 'Запрос слишком длинный' });
    const keyword = q.trim().toLowerCase();

    const [aiMatches, ticketMatches] = await Promise.all([
      prisma.chatMessage.findMany({
        where: { role: 'user', content: { contains: keyword, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, content: true, createdAt: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.supportTicket.findMany({
        where: {
          OR: [
            { subject: { contains: keyword, mode: 'insensitive' } },
            { messages: { some: { content: { contains: keyword, mode: 'insensitive' }, isStaff: false } } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, subject: true, status: true, createdAt: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    res.json({
      keyword,
      ai: aiMatches.map((m) => ({
        id: m.id,
        snippet: m.content.slice(0, 200),
        createdAt: m.createdAt,
        user: m.user,
      })),
      tickets: ticketMatches,
    });
  } catch (e) {
    logger.error('GET /admin/moderation/search:', e);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

/** GET /admin/subscriptions — paginated list of paid subscriptions with filters */
router.get('/subscriptions', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { plan, status, expiringSoon, page = '1', limit = '30', sort = 'endDate', order = 'asc' } = req.query as Record<string, string>;
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * take;
    const now = new Date();

    const where: Record<string, unknown> = { plan: { not: 'free' } };
    if (plan) where.plan = plan;
    if (status) where.status = status;
    if (expiringSoon === 'true') {
      where.status = 'active';
      where.endDate = { gte: now, lte: new Date(now.getTime() + 14 * 86400 * 1000) };
    }

    const orderBy: Record<string, string> = {};
    if (sort === 'endDate') orderBy.endDate = order === 'desc' ? 'desc' : 'asc';
    else if (sort === 'createdAt') orderBy.createdAt = order === 'desc' ? 'desc' : 'asc';
    else if (sort === 'plan') orderBy.plan = order === 'desc' ? 'desc' : 'asc';
    else orderBy.endDate = 'asc';

    const [subs, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, isBanned: true } },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    res.json({ subscriptions: subs, total, page: parseInt(page, 10) || 1, pages: Math.ceil(total / take) });
  } catch (e) {
    logger.error('GET /admin/subscriptions:', e);
    res.status(500).json({ error: 'Ошибка получения подписок' });
  }
});

/** GET /admin/users/:id/security-events — user's security event log */
router.get('/users/:id/security-events', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const events = await prisma.securityEvent.findMany({
      where: { userId: req.params.id as string },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, action: true, ip: true, userAgent: true, details: true, createdAt: true },
    });
    res.json(events);
  } catch (e) {
    logger.error('GET /admin/users/:id/security-events:', e);
    res.status(500).json({ error: 'Ошибка загрузки событий безопасности' });
  }
});

/** POST /admin/users/:id/force-disable-2fa — disable 2FA for a user (for recovery purposes) */
router.post('/users/:id/force-disable-2fa', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
    const stepup = await requireAdminStepUp(req, res);
    if (stepup) return;
    await prisma.user.update({
      where: { id: req.params.id as string },
      data: { totpEnabled: false, totpSecret: null, totpBackupCodes: null },
    });
    await prisma.adminLog.create({
      data: { adminId: req.userId!, action: 'FORCE_DISABLE_2FA', targetId: req.params.id as string },
    });
    await prisma.securityEvent.create({
      data: { userId: req.params.id as string, action: 'TOTP_DISABLED', details: `admin_force by=${req.userId}` },
    });
    res.json({ ok: true });
  } catch (e) {
    if (isNotFound(e)) return res.status(404).json({ error: 'Пользователь не найден' });
    logger.error('POST /admin/users/:id/force-disable-2fa:', e);
    res.status(500).json({ error: 'Ошибка отключения 2FA' });
  }
});

/** GET /admin/users/:id/sessions — list active sessions for a user */
router.get('/users/:id/sessions', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.params.id as string, revoked: false, expiresAt: { gte: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ip: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(sessions);
  } catch (e) {
    logger.error('GET /admin/users/:id/sessions:', e);
    res.status(500).json({ error: 'Ошибка получения сессий' });
  }
});

/** POST /admin/users/:id/force-logout — revoke all refresh tokens for a user */
router.post('/users/:id/force-logout', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id as string }, select: { id: true } });
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    // Step-up re-auth (sec audit 2026-04: HIGH-11) — preventing mass-logout abuse
    const stepup = await requireAdminStepUp(req, res);
    if (stepup) return;
    const [{ count }, { count: deviceCount }] = await prisma.$transaction([
      prisma.refreshToken.updateMany({
        where: { userId: req.params.id as string, revoked: false },
        data: { revoked: true },
      }),
      prisma.trustedDevice.deleteMany({ where: { userId: req.params.id as string } }),
    ]);
    await prisma.adminLog.create({
      data: { adminId: req.userId!, action: 'FORCE_LOGOUT', targetId: req.params.id as string, details: `revoked ${count} sessions, ${deviceCount} trusted devices` },
    });
    await prisma.securityEvent.create({
      data: { userId: req.params.id as string, action: 'TOKEN_REVOKED', details: `admin_force_logout by=${req.userId}` },
    });
    res.json({ ok: true, revokedCount: count });
  } catch (e) {
    logger.error('POST /admin/users/:id/force-logout:', e);
    res.status(500).json({ error: 'Ошибка принудительного выхода' });
  }
});

export { router as adminRouter };
