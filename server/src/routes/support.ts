import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, requireStaff, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

const createTicketSchema = z.object({
  subject: z.string().min(5, 'Тема минимум 5 символов').max(120),
  category: z.enum(['billing', 'technical', 'feature_request', 'account', 'bug', 'other']),
  message: z.string().min(10, 'Сообщение минимум 10 символов').max(2000),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
});

// ── USER ENDPOINTS ──────────────────────────────────────────────────────────

/** GET /support/tickets — my tickets */
router.get('/tickets', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.userId! },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    res.json(tickets);
  } catch (e) {
    logger.error('GET /support/tickets:', e);
    res.status(500).json({ error: 'Ошибка получения тикетов' });
  }
});

/** GET /support/tickets/:id — ticket with all messages */
router.get('/tickets/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id as string },
      include: {
        messages: {
          include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        assignedTo: { select: { firstName: true, lastName: true, role: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
    // Regular users can only see their own tickets
    const isStaff = ['ADMIN', 'SUPPORT'].includes(
      (await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true } }))?.role ?? ''
    );
    if (!isStaff && ticket.userId !== req.userId) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    res.json(ticket);
  } catch (e) {
    logger.error('GET /support/tickets/:id:', e);
    res.status(500).json({ error: 'Ошибка получения тикета' });
  }
});

/** POST /support/tickets — create new ticket */
router.post('/tickets', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = createTicketSchema.parse(req.body);
    const ticket = await prisma.supportTicket.create({
      data: {
        subject: data.subject,
        category: data.category,
        userId: req.userId!,
        messages: {
          create: {
            content: data.message,
            authorId: req.userId!,
            isStaff: false,
          },
        },
      },
      include: {
        messages: {
          include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
      },
    });
    res.status(201).json(ticket);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /support/tickets:', e);
    res.status(500).json({ error: 'Ошибка создания тикета' });
  }
});

/** POST /support/tickets/:id/messages — send a message */
router.post('/tickets/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = sendMessageSchema.parse(req.body);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id as string } });
    if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });

    const userRecord = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true } });
    const isStaff = ['ADMIN', 'SUPPORT'].includes(userRecord?.role ?? '');

    if (!isStaff && ticket.userId !== req.userId) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    if (ticket.status === 'closed') {
      return res.status(400).json({ error: 'Тикет закрыт. Создайте новый.' });
    }

    // Build ticket update payload before the transaction
    const ticketUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (!isStaff && ticket.status === 'resolved') {
      ticketUpdate.status = 'open';
    } else if (isStaff) {
      if (!ticket.assignedToId) ticketUpdate.assignedToId = req.userId!;
      if (ticket.status === 'open') ticketUpdate.status = 'in_progress';
    }

    // Atomic: message creation + ticket status update in one transaction
    const [message] = await prisma.$transaction([
      prisma.supportMessage.create({
        data: {
          content: data.content,
          ticketId: req.params.id as string,
          authorId: req.userId!,
          isStaff,
        },
        include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
      }),
      prisma.supportTicket.update({
        where: { id: req.params.id as string },
        data: ticketUpdate,
      }),
    ]);

    res.status(201).json(message);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /support/tickets/:id/messages:', e);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

/** PATCH /support/tickets/:id/close — user closes their own ticket */
router.patch('/tickets/:id/close', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id as string } });
    if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
    if (ticket.userId !== req.userId) return res.status(403).json({ error: 'Нет доступа' });
    const updated = await prisma.supportTicket.update({
      where: { id: req.params.id as string },
      data: { status: 'closed', updatedAt: new Date() },
    });
    res.json(updated);
  } catch (e) {
    logger.error('PATCH /support/tickets/:id/close:', e);
    res.status(500).json({ error: 'Ошибка закрытия тикета' });
  }
});

// ── STAFF ENDPOINTS (ADMIN + SUPPORT) ───────────────────────────────────────

/** GET /support/all — all tickets (staff) */
router.get('/all', authenticate, requireStaff, async (req: AuthRequest, res: Response) => {
  try {
    const { status, priority, page = '1', limit = '20' } = req.query as Record<string, string>;
    const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
    const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
    const where: any = {};
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    if (priority && VALID_PRIORITIES.includes(priority)) where.priority = priority;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: limitNum,
      }),
      prisma.supportTicket.count({ where }),
    ]);
    res.json({ tickets, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (e) {
    logger.error('GET /support/all:', e);
    res.status(500).json({ error: 'Ошибка получения тикетов' });
  }
});

const ticketStatusUpdateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
}).refine((d) => d.status !== undefined || d.priority !== undefined, {
  message: 'Укажите status или priority',
});

/** PATCH /support/tickets/:id/status — update status (staff) */
router.patch('/tickets/:id/status', authenticate, requireStaff, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = ticketStatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const data: any = { updatedAt: new Date() };
    if (parsed.data.status) data.status = parsed.data.status;
    if (parsed.data.priority) data.priority = parsed.data.priority;
    const ticket = await prisma.supportTicket.update({ where: { id: req.params.id as string }, data });
    res.json(ticket);
  } catch (e) {
    logger.error('PATCH /support/tickets/:id/status:', e);
    res.status(500).json({ error: 'Ошибка обновления тикета' });
  }
});

/** PATCH /support/tickets/:id/assign — assign to staff member */
router.patch('/tickets/:id/assign', authenticate, requireStaff, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({
      assignedToId: z.string().cuid().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректный assignedToId' });

    const { assignedToId } = parsed.data;
    const ticket = await prisma.supportTicket.update({
      where: { id: req.params.id as string },
      data: {
        assignedToId: assignedToId ?? null,
        status: assignedToId ? 'in_progress' : 'open',
        updatedAt: new Date(),
      },
    });
    res.json(ticket);
  } catch (e) {
    logger.error('PATCH /support/tickets/:id/assign:', e);
    res.status(500).json({ error: 'Ошибка назначения тикета' });
  }
});

export { router as supportRouter };
