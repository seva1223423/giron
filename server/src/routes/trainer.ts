import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

// Middleware: check that user has trainer role or active trainer subscription
async function requireTrainerRole(req: AuthRequest, res: Response, next: Function) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true } });
    const sub = await prisma.subscription.findUnique({ where: { userId: req.userId! } });
    const isTrainer = user?.role === 'TRAINER' || (sub?.plan === 'trainer' && sub?.status === 'active');
    if (!isTrainer) {
      return res.status(403).json({ error: 'Доступ только для тренеров' });
    }
    next();
  } catch {
    return res.status(500).json({ error: 'Ошибка проверки прав' });
  }
}

const addClientSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  age: z.number().int().min(5).max(120).optional(),
  goal: z.string().max(50).optional(),
  level: z.string().max(50).optional(),
  assignedProgram: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  emoji: z.string().max(10).optional(),
});

const updateClientSchema = addClientSchema.partial().extend({
  totalWorkouts: z.number().int().min(0).optional(),
  lastVisit: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'lastVisit должен быть в формате YYYY-MM-DD').optional(),
});

// Get all clients for current trainer
router.get('/clients', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  try {
    const clients = await prisma.trainerClient.findMany({
      where: { trainerId: req.userId! },
      orderBy: { createdAt: 'desc' },
    });
    res.json(clients);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения клиентов' });
  }
});

// Add client
router.post('/clients', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = addClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const client = await prisma.trainerClient.create({
      data: {
        ...parsed.data,
        trainerId: req.userId!,
      },
    });
    res.status(201).json(client);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка добавления клиента' });
  }
});

// Update client
router.patch('/clients/:id', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const data: Record<string, any> = { ...parsed.data };
    if (data.lastVisit) data.lastVisit = new Date(data.lastVisit);

    const client = await prisma.trainerClient.updateMany({
      where: { id: req.params.id as string, trainerId: req.userId! } as any,
      data,
    });
    if (client.count === 0) return res.status(404).json({ error: 'Клиент не найден' });

    const updated = await prisma.trainerClient.findUnique({ where: { id: String(req.params.id) } });
    res.json(updated);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления клиента' });
  }
});

// Delete client
router.delete('/clients/:id', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await prisma.trainerClient.deleteMany({
      where: { id: req.params.id as string, trainerId: req.userId! } as any,
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Клиент не найден' });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления клиента' });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

const sessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(200),
  durationMinutes: z.number().int().min(1).max(600),
  volumeKg: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

/** GET /trainer/sessions/:clientId — list sessions for a client */
router.get('/sessions/:clientId', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  try {
    // Verify trainer owns this client
    const client = await prisma.trainerClient.findFirst({
      where: { id: req.params.clientId as string, trainerId: req.userId! },
    });
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });

    const sessions = await prisma.trainerSession.findMany({
      where: { clientId: req.params.clientId as string },
      orderBy: { date: 'desc' },
    });
    res.json(sessions);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения тренировок' });
  }
});

/** POST /trainer/sessions/:clientId — log a session */
router.post('/sessions/:clientId', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  try {
    const client = await prisma.trainerClient.findFirst({
      where: { id: req.params.clientId as string, trainerId: req.userId! },
    });
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });

    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const session = await prisma.trainerSession.create({
      data: { clientId: req.params.clientId as string, ...parsed.data },
    });

    // Update totalWorkouts counter and lastVisit on client
    await prisma.trainerClient.update({
      where: { id: req.params.clientId as string },
      data: {
        totalWorkouts: { increment: 1 },
        lastVisit: new Date(parsed.data.date),
      },
    });

    res.status(201).json(session);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка записи тренировки' });
  }
});

/** DELETE /trainer/sessions/:id — remove a session */
router.delete('/sessions/:id', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  try {
    // Find session and verify ownership via client
    const session = await prisma.trainerSession.findUnique({
      where: { id: req.params.id as string },
      include: { client: { select: { trainerId: true } } },
    });
    if (!session || session.client.trainerId !== req.userId) {
      return res.status(404).json({ error: 'Тренировка не найдена' });
    }

    await prisma.trainerSession.delete({ where: { id: req.params.id as string } });

    // Recount sessions from DB to keep totalWorkouts accurate (avoid going negative)
    const sessionCount = await prisma.trainerSession.count({ where: { clientId: session.clientId } });
    await prisma.trainerClient.update({
      where: { id: session.clientId },
      data: { totalWorkouts: sessionCount },
    });

    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления тренировки' });
  }
});

export { router as trainerRouter };
