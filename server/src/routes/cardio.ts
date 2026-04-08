import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

// ─── Get all cardio sessions ──────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const sessions = await prisma.cardioSession.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    });
    res.json(sessions);
  } catch (e) {
    logger.error('Get cardio sessions error:', e);
    res.status(500).json({ error: 'Не удалось получить сессии кардио' });
  }
});

// ─── Create cardio session ────────────────────────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { type, date, durationMinutes, distanceKm, caloriesBurned, avgHeartRate, notes } = req.body;

    if (!type || !date || !durationMinutes) {
      return res.status(400).json({ error: 'type, date и durationMinutes обязательны' });
    }

    const session = await prisma.cardioSession.create({
      data: {
        userId,
        type,
        date,
        durationMinutes: Number(durationMinutes),
        distanceKm: distanceKm ? Number(distanceKm) : null,
        caloriesBurned: caloriesBurned ? Number(caloriesBurned) : null,
        avgHeartRate: avgHeartRate ? Number(avgHeartRate) : null,
        notes: notes || null,
      },
    });

    res.status(201).json(session);
  } catch (e) {
    logger.error('Create cardio session error:', e);
    res.status(500).json({ error: 'Не удалось сохранить кардио-сессию' });
  }
});

// ─── Delete cardio session ────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const session = await prisma.cardioSession.findFirst({ where: { id: id as string, userId } });
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });

    await prisma.cardioSession.delete({ where: { id: id as string } });
    res.json({ success: true });
  } catch (e) {
    logger.error('Delete cardio session error:', e);
    res.status(500).json({ error: 'Не удалось удалить кардио-сессию' });
  }
});

export { router as cardioRouter };
