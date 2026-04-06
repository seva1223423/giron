import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

const mealItemSchema = z.object({
  name: z.string().min(1),
  calories: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  fats: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  weightGrams: z.number().min(0).max(10000).optional(),
});

const addMealSchema = z.object({
  type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  items: z.array(mealItemSchema).min(1).max(50),
  photoUrl: z.string().optional(),
});

// Add meal
router.post('/meals', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = addMealSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const { type, items, photoUrl } = parsed.data;

    const totalCalories = items.reduce((s, i) => s + i.calories, 0);
    const totalProtein = items.reduce((s, i) => s + i.protein, 0);
    const totalFats = items.reduce((s, i) => s + i.fats, 0);
    const totalCarbs = items.reduce((s, i) => s + i.carbs, 0);

    const meal = await prisma.meal.create({
      data: {
        type,
        photoUrl,
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
            weightGrams: item.weightGrams,
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

    const startOfDay = new Date(date as string);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date as string);
    endOfDay.setHours(23, 59, 59, 999);

    const meals = await prisma.meal.findMany({
      where: {
        userId: req.userId,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json(meals);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения приёмов пищи' });
  }
});

// Delete meal
router.delete('/meals/:id', authenticate, async (req: AuthRequest, res: Response) => {
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
