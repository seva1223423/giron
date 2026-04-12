import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

const weightSchema = z.object({
  weightKg: z.number().min(20, 'Вес не может быть менее 20 кг').max(400, 'Вес не может быть более 400 кг'),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Некорректная дата'),
});

// Get profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { healthRestrictions: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const { passwordHash, ...profile } = user;
    res.json(profile);
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
      gender: z.string().max(20).optional(),
      heightCm: z.number().min(50).max(300).optional(),
      weightKg: z.number().min(20).max(400).optional(),
      goal: z.string().max(50).optional(),
      fitnessLevel: z.string().max(50).optional(),
      trainingExperienceYears: z.number().min(0).max(80).optional(),
      avatarUrl: z.string().url('Некорректный URL').max(2048).optional(),
    });

    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
    }

    const data: Record<string, any> = { ...parsed.data };

    if (data.dateOfBirth) {
      data.dateOfBirth = new Date(data.dateOfBirth);
    }
    // Normalize enum fields to uppercase for Prisma
    if (data.goal) data.goal = String(data.goal).toUpperCase();
    if (data.fitnessLevel) data.fitnessLevel = String(data.fitnessLevel).toUpperCase();
    if (data.gender) data.gender = String(data.gender).toUpperCase();

    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      include: { healthRestrictions: true },
    });

    const { passwordHash, ...profile } = user;
    res.json(profile);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления профиля' });
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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  chest: z.number().min(0).max(300).optional().nullable(),
  waist: z.number().min(0).max(300).optional().nullable(),
  hips: z.number().min(0).max(300).optional().nullable(),
  bicep: z.number().min(0).max(100).optional().nullable(),
  thigh: z.number().min(0).max(200).optional().nullable(),
  calf: z.number().min(0).max(100).optional().nullable(),
  neck: z.number().min(0).max(100).optional().nullable(),
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
    const records = await prisma.bodyMeasurement.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
      take: 60,
    });
    res.json(records);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения замеров' });
  }
});

// ── Sleep entries ─────────────────────────────────────────────────────────────

const sleepSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bedtime: z.string().regex(/^\d{2}:\d{2}$/),
  wakeTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationHours: z.number().min(0).max(24),
  quality: z.number().int().min(1).max(5).optional().nullable(),
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
    await prisma.sleepEntry.deleteMany({
      where: { userId: req.userId!, date: req.params.date as string },
    });
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

export { router as userRouter };
