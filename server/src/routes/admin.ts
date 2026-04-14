import { Router, Response } from 'express';
import os from 'os';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, requireAdmin, requireStaff, AuthRequest } from '../middleware/auth';
import { getActiveUsersCount, getTotalSeenCount, getActiveUserIds } from '../utils/activityTracker';
import { getAIMetrics } from '../utils/aiMetrics';
import { logger } from '../utils/logger';
import { adminStatsCache } from '../utils/memCache';

const router = Router();

// All admin routes require authentication first
router.use(authenticate);

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
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
    const prevWeekStart = new Date(now); prevWeekStart.setDate(now.getDate() - 14);
    const monthStart = new Date(now); monthStart.setDate(now.getDate() - 30);

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
      // Hourly pulse: individual records for today to bucket by hour
      prisma.workout.findMany({ where: { completedAt: { gte: todayStart } }, select: { completedAt: true } }),
      prisma.chatMessage.findMany({ where: { role: 'user', createdAt: { gte: todayStart } }, select: { createdAt: true } }),
    ]);

    // Build 24-hour activity pulse for today
    const hourlyPulse = new Array(24).fill(0);
    workoutsTodayRaw.forEach((w) => {
      if (w.completedAt) hourlyPulse[new Date(w.completedAt).getHours()]++;
    });
    aiTodayRaw.forEach((m) => {
      hourlyPulse[new Date(m.createdAt).getHours()]++;
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
        memoryUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
        memoryTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
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
        await Promise.all([
          // Normal tickets open > 8h with no staff reply → high
          prisma.supportTicket.updateMany({
            where: {
              status: { in: ['open', 'in_progress'] },
              priority: { in: ['low', 'normal'] },
              updatedAt: { lt: h8ago },
              messages: { none: { isStaff: true, isInternal: false } },
            },
            data: { priority: 'high' },
          }),
          // High tickets open > 24h with no staff reply → urgent
          prisma.supportTicket.updateMany({
            where: {
              status: { in: ['open', 'in_progress'] },
              priority: 'high',
              updatedAt: { lt: h24ago },
              messages: { none: { isStaff: true, isInternal: false } },
            },
            data: { priority: 'urgent' },
          }),
        ]);
      } catch { /* ignore, non-critical */ }
    });
  } catch (e) {
    logger.error('GET /admin/stats:', e);
    res.status(500).json({ error: 'Ошибка получения статистики' });
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
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
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
  try {
    const { role } = changeRoleSchema.parse(req.body);
    // Prevent admin from removing their own admin role
    if (req.params.id === req.userId && role !== 'ADMIN') {
      return res.status(400).json({ error: 'Нельзя убрать у себя роль администратора' });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { role },
      select: { id: true, email: true, firstName: true, role: true },
    });
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
    logger.error('PATCH /admin/users/:id/role:', e);
    res.status(500).json({ error: 'Ошибка изменения роли' });
  }
});

const changeSubSchema = z.object({
  plan: z.enum(['free', 'pro', 'trainer', 'club']),
  status: z.enum(['active', 'cancelled', 'expired']).optional(),
  endDate: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'Некорректная дата endDate').optional(),
});

/** PATCH /admin/users/:id/subscription — override subscription */
router.patch('/users/:id/subscription', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = changeSubSchema.parse(req.body);
    const sub = await prisma.subscription.upsert({
      where: { userId: req.params.id as string },
      update: {
        plan: data.plan,
        status: data.status ?? 'active',
        endDate: data.endDate ? new Date(data.endDate) : null,
        updatedAt: new Date(),
      },
      create: {
        userId: req.params.id as string,
        plan: data.plan,
        status: data.status ?? 'active',
        startDate: new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'CHANGE_SUBSCRIPTION',
        targetId: req.params.id as string,
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
  try {
    const { reason } = banSchema.parse(req.body);
    if (req.params.id === req.userId) {
      return res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { isBanned: true, bannedAt: new Date(), banReason: reason },
      select: { id: true, email: true, firstName: true, isBanned: true },
    });
    // Revoke all sessions immediately so banned user can't stay logged in
    await Promise.all([
      prisma.refreshToken.updateMany({ where: { userId: req.params.id as string, revoked: false }, data: { revoked: true } }),
      prisma.trustedDevice.deleteMany({ where: { userId: req.params.id as string } }),
    ]);
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
    logger.error('POST /admin/users/:id/ban:', e);
    res.status(500).json({ error: 'Ошибка блокировки пользователя' });
  }
});

/** POST /admin/users/:id/unban — unban user */
router.post('/users/:id/unban', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { isBanned: false, bannedAt: null, banReason: null },
      select: { id: true, email: true, firstName: true, isBanned: true },
    });
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
    logger.error('POST /admin/users/:id/unban:', e);
    res.status(500).json({ error: 'Ошибка разблокировки пользователя' });
  }
});

/** POST /admin/users/:id/force-verify-email — mark user email as verified */
router.post('/users/:id/force-verify-email', requireAdmin, async (req: AuthRequest, res: Response) => {
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
    logger.error('POST /admin/users/:id/force-verify-email:', e);
    res.status(500).json({ error: 'Ошибка верификации email' });
  }
});

/** POST /admin/users/:id/unlock — clear login lockout */
router.post('/users/:id/unlock', requireAdmin, async (req: AuthRequest, res: Response) => {
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
    logger.error('POST /admin/users/:id/unlock:', e);
    res.status(500).json({ error: 'Ошибка снятия блокировки' });
  }
});

const noteSchema = z.object({
  note: z.string().max(1000),
});

/** PATCH /admin/users/:id/note — set admin note */
router.patch('/users/:id/note', requireAdmin, async (req: AuthRequest, res: Response) => {
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
    logger.error('DELETE /admin/users/:id:', e);
    res.status(500).json({ error: 'Ошибка удаления пользователя' });
  }
});

/** POST /admin/users/:id/message — create a support ticket and send message to user from admin */
router.post('/users/:id/message', requireAdmin, async (req: AuthRequest, res: Response) => {
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
      userIds: z.array(z.string()).min(1).max(100),
      subject: z.string().min(1).max(200),
      message: z.string().min(1).max(2000),
    }).parse(req.body);

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, isBanned: false },
      select: { id: true },
    });

    const results = await Promise.allSettled(
      users.map((u) =>
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
        })
      )
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
    const subWhere: Record<string, unknown> = { plan, status: 'active' };
    if (expiringSoonOnly) {
      subWhere.endDate = { gte: now, lte: new Date(now.getTime() + 14 * 86400 * 1000) };
    }

    const users = await prisma.user.findMany({
      where: { isBanned: false, subscription: subWhere },
      select: { id: true },
    });

    if (users.length === 0) return res.json({ sent: 0, failed: 0, total: 0 });

    const results = await Promise.allSettled(
      users.map((u) =>
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
        })
      )
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

/** GET /admin/analytics — growth, retention, activity trends */
router.get('/analytics', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { days = '30' } = req.query as Record<string, string>;
    const numDays = Math.min(90, Math.max(7, parseInt(days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - numDays);
    since.setHours(0, 0, 0, 0);

    // Previous period window for comparison
    const prevSince = new Date(since);
    prevSince.setDate(prevSince.getDate() - numDays);

    const [signupsRaw, workoutsRaw, aiRaw, cardioRaw, prevSignups, prevWorkouts, prevAi, prevCardio] = await Promise.all([
      // Current period
      prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
      prisma.workout.findMany({ where: { completedAt: { gte: since, not: null } }, select: { completedAt: true }, orderBy: { completedAt: 'asc' } }),
      prisma.chatMessage.findMany({ where: { role: 'user', createdAt: { gte: since } }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
      prisma.cardioSession.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
      // Previous period counts
      prisma.user.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
      prisma.workout.count({ where: { completedAt: { gte: prevSince, lt: since, not: null } } }),
      prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: prevSince, lt: since } } }),
      prisma.cardioSession.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
    ]);

    // Build day-by-day buckets
    const buckets: Record<string, { signups: number; workouts: number; ai: number; cardio: number }> = {};
    for (let i = 0; i < numDays; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      buckets[key] = { signups: 0, workouts: 0, ai: 0, cardio: 0 };
    }

    const toKey = (d: Date | null) => d ? new Date(d).toISOString().split('T')[0] : null;
    signupsRaw.forEach((u) => { const k = toKey(u.createdAt); if (k && buckets[k]) buckets[k].signups++; });
    workoutsRaw.forEach((w) => { const k = toKey(w.completedAt); if (k && buckets[k]) buckets[k].workouts++; });
    aiRaw.forEach((m) => { const k = toKey(m.createdAt); if (k && buckets[k]) buckets[k].ai++; });
    cardioRaw.forEach((c) => { const k = toKey(c.createdAt); if (k && buckets[k]) buckets[k].cardio++; });

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

    res.json({
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
    });
  } catch (e) {
    logger.error('GET /admin/analytics:', e);
    res.status(500).json({ error: 'Ошибка получения аналитики' });
  }
});

/** GET /admin/analytics/cohorts — weekly cohort retention: % of each signup week still active */
router.get('/analytics/cohorts', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const weeks = 8; // last 8 weeks
    const cohorts: Array<{ week: string; signups: number; activeThisWeek: number; retentionPct: number }> = [];

    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - (i + 1) * 7 * 86400 * 1000);
      const weekEnd = new Date(now.getTime() - i * 7 * 86400 * 1000);
      const activeStart = new Date(now.getTime() - 7 * 86400 * 1000); // last 7 days

      const [signupIds, activeIds] = await Promise.all([
        prisma.user.findMany({
          where: { createdAt: { gte: weekStart, lt: weekEnd } },
          select: { id: true },
        }),
        prisma.workout.groupBy({
          by: ['userId'],
          where: { completedAt: { gte: activeStart } },
        }),
      ]);

      const signupSet = new Set(signupIds.map((u) => u.id));
      const activeSet = new Set(activeIds.map((w) => w.userId));
      const cohortActive = [...signupSet].filter((id) => activeSet.has(id)).length;

      cohorts.push({
        week: weekStart.toISOString().split('T')[0],
        signups: signupSet.size,
        activeThisWeek: cohortActive,
        retentionPct: signupSet.size > 0 ? Math.round((cohortActive / signupSet.size) * 100) : 0,
      });
    }

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
    const numDays = Math.min(90, Math.max(7, parseInt(days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - numDays);
    since.setHours(0, 0, 0, 0);

    const subs = await prisma.subscription.findMany({
      where: { plan: { not: 'free' }, createdAt: { gte: since } },
      select: { plan: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Build daily buckets per plan
    const buckets: Record<string, { pro: number; trainer: number; club: number; total: number }> = {};
    for (let i = 0; i < numDays; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      buckets[d.toISOString().split('T')[0]] = { pro: 0, trainer: 0, club: 0, total: 0 };
    }
    for (const s of subs) {
      const key = s.createdAt.toISOString().split('T')[0];
      if (buckets[key]) {
        buckets[key].total++;
        if (s.plan === 'pro') buckets[key].pro++;
        else if (s.plan === 'trainer') buckets[key].trainer++;
        else if (s.plan === 'club') buckets[key].club++;
      }
    }

    const timeline = Object.entries(buckets).map(([date, v]) => ({ date, ...v }));
    const totalNew = subs.length;
    res.json({ timeline, totalNew, period: numDays });
  } catch (e) {
    logger.error('GET /admin/analytics/subscriptions:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/** GET /admin/analytics/export — CSV export of daily timeline data */
router.get('/analytics/export', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { days = '30' } = req.query as Record<string, string>;
    const numDays = Math.min(365, Math.max(1, parseInt(days) || 30));
    const now = new Date();
    const start = new Date(now.getTime() - numDays * 86400 * 1000);

    const [signups, workouts, aiMessages, cardio] = await Promise.all([
      prisma.user.groupBy({ by: ['createdAt'], where: { createdAt: { gte: start } }, _count: { id: true } }),
      prisma.workout.groupBy({ by: ['completedAt'], where: { completedAt: { gte: start } }, _count: { id: true } }),
      prisma.chatMessage.groupBy({ by: ['createdAt'], where: { role: 'user', createdAt: { gte: start } }, _count: { id: true } }),
      prisma.cardioSession.groupBy({ by: ['createdAt'], where: { createdAt: { gte: start } }, _count: { id: true } }),
    ]);

    const buckets: Record<string, { signups: number; workouts: number; ai: number; cardio: number }> = {};
    for (let i = 0; i < numDays; i++) {
      const d = new Date(start.getTime() + i * 86400 * 1000);
      buckets[d.toISOString().split('T')[0]] = { signups: 0, workouts: 0, ai: 0, cardio: 0 };
    }
    signups.forEach((r) => { const d = new Date(r.createdAt).toISOString().split('T')[0]; if (buckets[d]) buckets[d].signups += r._count.id; });
    workouts.forEach((r) => { if (r.completedAt) { const d = new Date(r.completedAt).toISOString().split('T')[0]; if (buckets[d]) buckets[d].workouts += r._count.id; } });
    aiMessages.forEach((r) => { const d = new Date(r.createdAt).toISOString().split('T')[0]; if (buckets[d]) buckets[d].ai += r._count.id; });
    cardio.forEach((r) => { const d = new Date(r.createdAt).toISOString().split('T')[0]; if (buckets[d]) buckets[d].cardio += r._count.id; });

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
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
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
        l.admin.email,
        `${l.admin.firstName} ${l.admin.lastName ?? ''}`.trim(),
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

    const pageNum2 = Math.max(1, parseInt(page) || 1);
    const limitNum2 = Math.min(100, Math.max(1, parseInt(limit) || 20));
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
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(Date.now() - 7 * 86400 * 1000);

    const [resolvedToday, openCount, unassigned, categoryCounts, ticketsWithFirstReply, staffAssignedCounts] = await Promise.all([
      prisma.supportTicket.count({ where: { status: { in: ['resolved', 'closed'] }, updatedAt: { gte: todayStart } } }),
      prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] } } }),
      prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] }, assignedToId: null } }),
      prisma.supportTicket.groupBy({ by: ['category'], _count: { id: true } }),
      // Get first staff message time for tickets created this week to compute avg response time
      prisma.supportTicket.findMany({
        where: { createdAt: { gte: weekStart } },
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
router.patch('/support/:id/assign', requireStaff, async (req: AuthRequest, res: Response) => {
  try {
    const { assignedToId } = z.object({ assignedToId: z.string().nullable() }).parse(req.body);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id as string } });
    if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
    // Validate assignee is staff if not null
    if (assignedToId) {
      const assignee = await prisma.user.findUnique({ where: { id: assignedToId }, select: { role: true } });
      if (!assignee || !['SUPPORT', 'ADMIN'].includes(assignee.role)) {
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
    const userSub = await prisma.subscription.findFirst({ where: { userId: req.userId! }, select: { plan: true, status: true } });
    const userPlan = userSub?.status === 'active' ? userSub.plan : 'free';
    const list = await prisma.announcement.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          { OR: [{ targetRole: null }, { targetRole: userPlan }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, body: true, type: true, createdAt: true },
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
        where.subscription = { plan: targetRole, status: 'active' };
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
  try {
    const data = announcementSchema.partial().parse(req.body);
    const ann = await prisma.announcement.update({
      where: { id: req.params.id as string },
      data: {
        ...data,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
      },
    });
    res.json(ann);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('PATCH /admin/announcements/:id:', e);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

/** POST /admin/announcements/:id/duplicate — create a copy with "(копия)" suffix */
router.post('/announcements/:id/duplicate', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const original = await prisma.announcement.findUnique({ where: { id: req.params.id as string } });
    if (!original) return res.status(404).json({ error: 'Объявление не найдено' });
    const copy = await prisma.announcement.create({
      data: {
        title: `${original.title} (копия)`,
        body: original.body,
        type: original.type,
        isActive: false, // start inactive
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
  try {
    await prisma.announcement.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  } catch (e) {
    logger.error('DELETE /admin/announcements/:id:', e);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

/** GET /admin/report/daily — generate text summary for a given date (defaults to today) */
router.get('/report/daily', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query as Record<string, string>;
    const parsedReportDate = date ? new Date(date) : null;
    if (parsedReportDate && isNaN(parsedReportDate.getTime())) {
      return res.status(400).json({ error: 'Некорректная дата' });
    }
    const reportDate = parsedReportDate ?? new Date();
    reportDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(reportDate.getTime() + 86400 * 1000);
    const weekAgo = new Date(reportDate.getTime() - 7 * 86400 * 1000);

    const PLAN_PRICE: Record<string, number> = { pro: 9.99, trainer: 19.99, club: 29.99 };

    const [signups, workouts, aiMessages, cardio, meals, activeSubscriptions, newSubscriptions, openTickets] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: reportDate, lt: nextDay } } }),
      prisma.workout.count({ where: { completedAt: { gte: reportDate, lt: nextDay } } }),
      prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: reportDate, lt: nextDay } } }),
      prisma.cardioSession.count({ where: { createdAt: { gte: reportDate, lt: nextDay } } }),
      prisma.meal.count({ where: { createdAt: { gte: reportDate, lt: nextDay } } }),
      prisma.subscription.findMany({ where: { status: 'active', plan: { not: 'free' } }, select: { plan: true } }),
      prisma.subscription.count({ where: { plan: { not: 'free' }, createdAt: { gte: reportDate, lt: nextDay } } }),
      prisma.supportTicket.count({ where: { status: 'open' } }),
    ]);

    const mrr = activeSubscriptions.reduce((sum, s) => sum + (PLAN_PRICE[s.plan] ?? 0), 0);
    const dateStr = reportDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });

    const report = [
      `📊 Iron Gym — Отчёт за ${dateStr}`,
      ``,
      `👤 Новых пользователей: ${signups}`,
      `💪 Тренировок завершено: ${workouts}`,
      `🤖 ИИ-запросов: ${aiMessages}`,
      `🏃 Кардио-сессий: ${cardio}`,
      `🥗 Приёмов пищи: ${meals}`,
      ``,
      `💳 Активных подписок: ${activeSubscriptions.length}`,
      `💚 Новых подписок сегодня: ${newSubscriptions}`,
      `💰 Оценка MRR: $${mrr.toFixed(0)}/мес`,
      ``,
      `🎫 Открытых тикетов: ${openTickets}`,
      ``,
      `Сформировано: ${new Date().toLocaleString('ru-RU')}`,
    ].join('\n');

    res.json({ report, date: reportDate.toISOString().split('T')[0], metrics: { signups, workouts, aiMessages, cardio, meals, mrr: Math.round(mrr), newSubscriptions, openTickets } });
  } catch (e) {
    logger.error('GET /admin/report/daily:', e);
    res.status(500).json({ error: 'Ошибка' });
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
    const forecast: Array<{ weekStart: string; weekEnd: string; count: number; revenue: number }> = [];
    const PLAN_PRICE: Record<string, number> = { pro: 9.99, trainer: 19.99, club: 29.99 };

    for (let i = 0; i < weeks; i++) {
      const start = new Date(now.getTime() + i * 7 * 86400 * 1000);
      const end = new Date(start.getTime() + 7 * 86400 * 1000);
      const expiring = await prisma.subscription.findMany({
        where: { status: 'active', plan: { not: 'free' }, endDate: { gte: start, lt: end } },
        select: { plan: true },
      });
      const revenue = expiring.reduce((sum, s) => sum + (PLAN_PRICE[s.plan] ?? 0), 0);
      forecast.push({
        weekStart: start.toISOString().split('T')[0],
        weekEnd: end.toISOString().split('T')[0],
        count: expiring.length,
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
router.get('/analytics/segments', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
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

    res.json(results.filter((r) => r.userCount > 0));
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
    const take = Math.min(100, Math.max(1, parseInt(limit) || 30));
    const skip = (Math.max(1, parseInt(page) || 1) - 1) * take;
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

    res.json({ subscriptions: subs, total, page: parseInt(page) || 1, pages: Math.ceil(total / take) });
  } catch (e) {
    logger.error('GET /admin/subscriptions:', e);
    res.status(500).json({ error: 'Ошибка получения подписок' });
  }
});

/** GET /admin/report/daily — generates a text summary report for a given date */
router.get('/report/daily', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query as Record<string, string>;
    const targetDate = date ? new Date(date) : new Date();
    if (isNaN(targetDate.getTime())) return res.status(400).json({ error: 'Неверная дата' });

    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);
    const prevDayStart = new Date(dayStart); prevDayStart.setDate(prevDayStart.getDate() - 1);
    const prevDayEnd = new Date(dayEnd); prevDayEnd.setDate(prevDayEnd.getDate() - 1);
    const monthStart = new Date(dayStart); monthStart.setDate(monthStart.getDate() - 30);

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
      prisma.subscription.findMany({ where: { status: 'active', plan: { not: 'free' } }, select: { plan: true } }),
    ]);

    const mrr = activeSubs.reduce((sum, s) => sum + (PLAN_PRICE[s.plan] ?? 0), 0);

    function delta(now: number, prev: number): string {
      if (prev === 0) return now > 0 ? ` (+${now})` : '';
      const d = now - prev;
      if (d === 0) return ' (=)';
      return d > 0 ? ` (+${d})` : ` (${d})`;
    }

    const dateStr = dayStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const lines = [
      `📊 Iron Gym — Отчёт за ${dateStr}`,
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
    ];

    const metrics: Record<string, number> = {
      signups, workouts, aiMessages, cardio, meals,
      mrr: Math.round(mrr), newSubscriptions: newSubs, openTickets,
    };

    res.json({ report: lines.join('\n'), date: dayStart.toISOString().split('T')[0], metrics });
  } catch (e) {
    logger.error('GET /admin/report/daily:', e);
    res.status(500).json({ error: 'Ошибка генерации отчёта' });
  }
});

/** GET /admin/users/:id/security-events — user's security event log */
router.get('/users/:id/security-events', requireAdmin, async (req: AuthRequest, res: Response) => {
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
    logger.error('POST /admin/users/:id/force-disable-2fa:', e);
    res.status(500).json({ error: 'Ошибка отключения 2FA' });
  }
});

/** GET /admin/users/:id/sessions — list active sessions for a user */
router.get('/users/:id/sessions', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.params.id as string, revoked: false, expiresAt: { gte: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ip: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(sessions);
  } catch (e) {
    logger.error('GET /admin/users/:id/sessions:', e);
    res.status(500).json({ error: 'Ошибка получения сессий' });
  }
});

/** POST /admin/users/:id/force-logout — revoke all refresh tokens for a user */
router.post('/users/:id/force-logout', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const [{ count }, { count: deviceCount }] = await Promise.all([
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
