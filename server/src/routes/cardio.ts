import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

/** CUID v1 format: starts with 'c', ~25 chars, alphanumeric */
const CUID_RE = /^c[a-z0-9]{20,30}$/;
const isValidId = (id: string | string[]) => CUID_RE.test(String(id));

// ─── Get all cardio sessions ──────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const sessions = await prisma.cardioSession.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 365, // last year is sufficient; prevents unbounded response for heavy users
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

    const cardioSchema = z.object({
      type: z.enum(['running', 'cycling', 'swimming', 'walking', 'hiit', 'elliptical', 'rowing', 'other']),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате YYYY-MM-DD').refine((d) => {
        const parsed = new Date(d + 'T00:00:00Z');
        const minDate = new Date('2000-01-01T00:00:00Z');
        return !isNaN(parsed.getTime()) && parsed >= minDate && parsed <= new Date();
      }, 'Некорректная дата (должна быть между 01.01.2000 и сегодня)'),
      durationMinutes: z.number().int().min(1, 'Минимум 1 минута').max(1440, 'Максимум 24 часа'),
      distanceKm: z.number().min(0).max(500).optional().nullable(),
      caloriesBurned: z.number().int().min(0).max(50000).optional().nullable(),
      avgHeartRate: z.number().int().min(30).max(250).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    });

    const parsed = cardioSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
    }

    const { type, date, durationMinutes, distanceKm, caloriesBurned, avgHeartRate, notes } = parsed.data;

    const session = await prisma.cardioSession.create({
      data: {
        userId,
        type,
        date,
        durationMinutes,
        distanceKm: distanceKm ?? null,
        caloriesBurned: caloriesBurned ?? null,
        avgHeartRate: avgHeartRate ?? null,
        notes: notes ?? null,
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
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const deleted = await prisma.cardioSession.deleteMany({ where: { id: id as string, userId } });
    if (deleted.count === 0) return res.status(404).json({ error: 'Сессия не найдена' });
    res.json({ success: true });
  } catch (e) {
    logger.error('Delete cardio session error:', e);
    res.status(500).json({ error: 'Не удалось удалить кардио-сессию' });
  }
});

export { router as cardioRouter };
