import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Add meal
router.post('/meals', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { type, items, photoUrl } = req.body;

    const totalCalories = items.reduce((s: number, i: any) => s + i.calories, 0);
    const totalProtein = items.reduce((s: number, i: any) => s + i.protein, 0);
    const totalFats = items.reduce((s: number, i: any) => s + i.fats, 0);
    const totalCarbs = items.reduce((s: number, i: any) => s + i.carbs, 0);

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
    console.error(e);
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
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения приёмов пищи' });
  }
});

// Delete meal
router.delete('/meals/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.meal.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

export { router as nutritionRouter };
