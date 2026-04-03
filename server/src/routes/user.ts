import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

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
    console.error(e);
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

    const data: Record<string, any> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    }

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
    console.error(e);
    res.status(500).json({ error: 'Ошибка обновления профиля' });
  }
});

// Add body weight
router.post('/weight', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { weightKg, date } = req.body;
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
    console.error(e);
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
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения веса' });
  }
});

export { router as userRouter };
