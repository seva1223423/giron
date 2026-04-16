import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

/** CUID v1 format: starts with 'c', ~25 chars, alphanumeric */
const CUID_RE = /^c[a-z0-9]{20,30}$/;
const isValidId = (id: string | string[]) => CUID_RE.test(String(id));

const mealItemSchema = z.object({
  name: z.string().min(1).max(200),
  calories: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  fats: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  weightGrams: z.number().min(0).max(10000).optional(),
});

const addMealSchema = z.object({
  type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  items: z.array(mealItemSchema).min(1).max(50),
  photoUrl: z.string().url('Некорректный URL').max(2048).refine((u) => u.startsWith('https://'), 'URL должен использовать HTTPS').optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD local date from client
});

// Add meal
router.post('/meals', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = addMealSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const { type, items, photoUrl, date } = parsed.data;

    const totalCalories = items.reduce((s, i) => s + i.calories, 0);
    const totalProtein = items.reduce((s, i) => s + i.protein, 0);
    const totalFats = items.reduce((s, i) => s + i.fats, 0);
    const totalCarbs = items.reduce((s, i) => s + i.carbs, 0);

    // Use client-supplied local date; fall back to server UTC date (acceptable for UTC users)
    const mealDate = date ?? new Date().toISOString().split('T')[0];

    const meal = await prisma.meal.create({
      data: {
        type,
        photoUrl,
        date: mealDate,
        totalCalories,
        totalProtein,
        totalFats,
        totalCarbs,
        userId: req.userId!,
        items: {
          create: items.map((item: any) => ({
            name: item.name,
            calories: item.calories,
            protein: item.protein,
            fats: item.fats,
            carbs: item.carbs,
            weightGrams: item.weightGrams ?? 0,
          })),
        },
      },
      include: { items: true },
    });

    res.status(201).json(meal);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка добавления приёма пищи' });
  }
});

// Get meals by date
router.get('/meals', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Укажите дату' });

    // Validate the date string looks like YYYY-MM-DD
    const dateStr = (date as string).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(Date.parse(dateStr))) {
      return res.status(400).json({ error: 'Некорректная дата. Формат: YYYY-MM-DD' });
    }

    const meals = await prisma.meal.findMany({
      where: {
        userId: req.userId,
        date: dateStr,
      },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
      take: 100, // hard cap — no user logs more than 100 meals per day
    });

    res.json(meals);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения приёмов пищи' });
  }
});

// Update meal items (recalculate totals)
router.patch('/meals/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const meal = await prisma.meal.findFirst({ where: { id: req.params.id as string, userId: req.userId! } });
    if (!meal) return res.status(404).json({ error: 'Приём пищи не найден' });

    const parsed = z.object({ items: z.array(mealItemSchema).min(1).max(50) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const { items } = parsed.data;
    const totalCalories = items.reduce((s, i) => s + i.calories, 0);
    const totalProtein = items.reduce((s, i) => s + i.protein, 0);
    const totalFats = items.reduce((s, i) => s + i.fats, 0);
    const totalCarbs = items.reduce((s, i) => s + i.carbs, 0);

    // Replace all items and update totals atomically in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      await tx.mealItem.deleteMany({ where: { mealId: meal.id } });
      return tx.meal.update({
        where: { id: meal.id },
        data: {
          totalCalories, totalProtein, totalFats, totalCarbs,
          items: { create: items.map((item) => ({ name: item.name, calories: item.calories, protein: item.protein, fats: item.fats, carbs: item.carbs, weightGrams: item.weightGrams ?? 0 })) },
        },
        include: { items: true },
      });
    });

    res.json(updated);
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Приём пищи не найден' });
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления приёма пищи' });
  }
});

// Delete meal
router.delete('/meals/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const deleted = await prisma.meal.deleteMany({
      where: { id: req.params.id as string, userId: req.userId },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Приём пищи не найден' });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

export { router as nutritionRouter };
