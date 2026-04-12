import { Router, Response } from 'express';
import os from 'os';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, requireAdmin, requireStaff, AuthRequest } from '../middleware/auth';
import { getActiveUsersCount, getTotalSeenCount } from '../utils/activityTracker';
import { getAIMetrics } from '../utils/aiMetrics';
import { logger } from '../utils/logger';

const router = Router();

// All admin routes require authentication first
router.use(authenticate);

// ── DASHBOARD STATS ─────────────────────────────────────────────────────────

/** GET /admin/stats — main dashboard data */
router.get('/stats', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
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

    // Top active users this week (by workout count) + top AI users + demographics + recent signups
    const [topUsers, topAiUsers, dauWorkout, dauAi, goalCounts, levelCounts, genderCounts, recentSignups] = await Promise.all([
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
    ]);

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

    res.json({
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
      recentSignups,
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
    });

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
    const { search = '', role, plan, banned, dormant, subExpiringSoon, page = '1', limit = '20', sort = 'createdAt', order = 'desc' } = req.query as Record<string, string>;
    const ALLOWED_SORT = ['createdAt', 'email', 'firstName', 'lastName'] as const;
    const safeSort = ALLOWED_SORT.includes(sort as any) ? sort : 'createdAt';
    const safeOrder = order === 'asc' ? 'asc' : 'desc';
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    const where: any = {};
    if (role) where.role = role.toUpperCase();
    if (banned === 'true') where.isBanned = true;
    if (plan) {
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
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, firstName: true, lastName: true,
          role: true, createdAt: true, isBanned: true, banReason: true,
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
router.get('/users/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
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
    const { passwordHash, ...safeUser } = user as any;
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
  endDate: z.string().optional(),
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
router.delete('/users/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
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

/** GET /admin/users/export — CSV export of user list */
router.get('/users/export', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { role, plan, banned } = req.query as Record<string, string>;
    const where: any = {};
    if (role) where.role = role.toUpperCase();
    if (banned === 'true') where.isBanned = true;
    if (plan) where.subscription = { plan, status: 'active' };

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
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));

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
      where.OR = [
        { details: { contains: search, mode: 'insensitive' } },
        { admin: { email: { contains: search, mode: 'insensitive' } } },
        { admin: { firstName: { contains: search, mode: 'insensitive' } } },
        { admin: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
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

// ── SUPPORT MANAGEMENT (staff — admin or support role) ───────────────────────

/** GET /admin/support — all tickets with filters */
router.get('/support', requireStaff, async (req: AuthRequest, res: Response) => {
  try {
    const { status, priority, assignedToMe, search, sort = 'priority', page = '1', limit = '20' } = req.query as Record<string, string>;
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedToMe === 'true') where.assignedToId = req.userId;
    if (search) {
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

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
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
        take: parseInt(limit),
      }),
      prisma.supportTicket.count({ where }),
    ]);
    res.json({ tickets, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
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
    const escape = (s: string | null | undefined) => `"${(s ?? '').replace(/"/g, '""')}"`;
    const header = 'ID,Subject,Category,Status,Priority,User Email,User Name,Assigned To,Messages,Created,Updated';
    const rows = tickets.map((t) => [
      escape(t.id), escape(t.subject), escape(t.category), escape(t.status), escape(t.priority),
      escape(t.user?.email), escape(`${t.user?.firstName} ${t.user?.lastName ?? ''}`.trim()),
      escape(t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName ?? ''}`.trim() : ''),
      t.messages.length,
      escape(t.createdAt.toISOString()), escape(t.updatedAt.toISOString()),
    ].join(','));
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
  endsAt: z.string().optional(),
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

export { router as adminRouter };
