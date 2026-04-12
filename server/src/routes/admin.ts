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
    const monthStart = new Date(now); monthStart.setDate(now.getDate() - 30);

    const [
      totalUsers,
      newToday,
      newThisWeek,
      newThisMonth,
      usersByRole,
      subscriptionCounts,
      workoutsToday,
      workoutsThisWeek,
      aiMessagesToday,
      aiMessagesThisWeek,
      openTickets,
      inProgressTickets,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.user.groupBy({ by: ['role'], _count: { id: true } }),
      prisma.subscription.groupBy({ by: ['plan', 'status'], _count: { id: true } }),
      prisma.workout.count({ where: { completedAt: { gte: todayStart } } }),
      prisma.workout.count({ where: { completedAt: { gte: weekStart } } }),
      prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: todayStart } } }),
      prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: weekStart } } }),
      prisma.supportTicket.count({ where: { status: 'open' } }),
      prisma.supportTicket.count({ where: { status: 'in_progress' } }),
    ]);

    // Server metrics
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uptime = process.uptime();

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
        byRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count.id])),
      },
      subscriptions: subscriptionCounts.map((s) => ({
        plan: s.plan,
        status: s.status,
        count: s._count.id,
      })),
      workouts: {
        completedToday: workoutsToday,
        completedThisWeek: workoutsThisWeek,
      },
      ai: {
        messagesToday: aiMessagesToday,
        messagesThisWeek: aiMessagesThisWeek,
        ...aiMetrics,
      },
      support: {
        openTickets,
        inProgressTickets,
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
      },
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
    const { search = '', role, page = '1', limit = '20', sort = 'createdAt' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where: any = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, firstName: true, lastName: true,
          role: true, createdAt: true,
          subscription: { select: { plan: true, status: true, endDate: true } },
          _count: { select: { workouts: true, chatMessages: true } },
        },
        orderBy: { [sort]: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (e) {
    logger.error('GET /admin/users:', e);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

/** GET /admin/users/:id — user detail */
router.get('/users/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
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
      },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const { passwordHash, ...safeUser } = user as any;
    res.json(safeUser);
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
      where: { id: req.params.id },
      data: { role },
      select: { id: true, email: true, firstName: true, role: true },
    });
    // Log action
    await prisma.adminLog.create({
      data: {
        adminId: req.userId!,
        action: 'CHANGE_ROLE',
        targetId: req.params.id,
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
      where: { userId: req.params.id },
      update: {
        plan: data.plan,
        status: data.status ?? 'active',
        endDate: data.endDate ? new Date(data.endDate) : null,
        updatedAt: new Date(),
      },
      create: {
        userId: req.params.id,
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
        targetId: req.params.id,
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

// ── ADMIN LOG ────────────────────────────────────────────────────────────────

/** GET /admin/logs — recent admin actions */
router.get('/logs', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '50' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const logs = await prisma.adminLog.findMany({
      include: { admin: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    });
    res.json(logs);
  } catch (e) {
    logger.error('GET /admin/logs:', e);
    res.status(500).json({ error: 'Ошибка получения логов' });
  }
});

// ── SUPPORT MANAGEMENT (staff — admin or support role) ───────────────────────

/** GET /admin/support — all tickets with filters */
router.get('/support', requireStaff, async (req: AuthRequest, res: Response) => {
  try {
    const { status, priority, assignedToMe, page = '1', limit = '20' } = req.query as Record<string, string>;
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedToMe === 'true') where.assignedToId = req.userId;

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
            include: { author: { select: { firstName: true, isStaff: false } } },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { status: 'asc' },
          { updatedAt: 'desc' },
        ],
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

export { router as adminRouter };
