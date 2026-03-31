import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all programs
router.get('/programs', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const programs = await prisma.program.findMany({
      where: { userId: req.userId },
      include: {
        workouts: {
          include: {
            exercises: {
              include: { exercise: true, sets: true },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(programs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения программ' });
  }
});

// Create program
router.post('/programs', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, type, goal, level, daysPerWeek, durationWeeks } = req.body;

    // Deactivate current active program
    await prisma.program.updateMany({
      where: { userId: req.userId, isActive: true },
      data: { isActive: false },
    });

    const program = await prisma.program.create({
      data: {
        name,
        description,
        type,
        goal,
        level,
        daysPerWeek,
        durationWeeks,
        isActive: true,
        createdBy: 'user',
        userId: req.userId!,
      },
    });
    res.status(201).json(program);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка создания программы' });
  }
});

// Start workout
router.post('/start', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, exercises } = req.body;

    const workout = await prisma.workout.create({
      data: {
        name,
        startedAt: new Date(),
        userId: req.userId!,
        exercises: {
          create: exercises.map((ex: any, index: number) => ({
            order: index,
            restSeconds: ex.restSeconds || 90,
            exerciseId: ex.exerciseId,
            sets: {
              create: ex.sets.map((set: any, setIndex: number) => ({
                setNumber: setIndex + 1,
                type: set.type || 'normal',
                reps: set.reps,
                weight: set.weight,
                completed: false,
              })),
            },
          })),
        },
      },
      include: {
        exercises: {
          include: { exercise: true, sets: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    res.status(201).json(workout);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка старта тренировки' });
  }
});

// Complete workout
router.post('/:id/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { sets } = req.body;

    // Update sets
    if (sets) {
      for (const set of sets) {
        await prisma.workoutSet.update({
          where: { id: set.id },
          data: {
            reps: set.reps,
            weight: set.weight,
            completed: set.completed,
            rpe: set.rpe,
          },
        });
      }
    }

    // Calculate total volume
    const workout = await prisma.workout.findUnique({
      where: { id },
      include: { exercises: { include: { sets: true } } },
    });

    const totalVolume = workout?.exercises.reduce(
      (total, ex) =>
        total + ex.sets.filter((s) => s.completed).reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0),
      0
    ) || 0;

    const startedAt = workout?.startedAt;
    const durationMinutes = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 60000) : 0;

    const updated = await prisma.workout.update({
      where: { id },
      data: {
        completedAt: new Date(),
        durationMinutes,
        totalVolume,
      },
      include: {
        exercises: {
          include: { exercise: true, sets: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка завершения тренировки' });
  }
});

// Get workout history
router.get('/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '50', offset = '0' } = req.query;
    const workouts = await prisma.workout.findMany({
      where: { userId: req.userId, completedAt: { not: null } },
      include: {
        exercises: {
          include: { exercise: true, sets: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { completedAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });
    res.json(workouts);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения истории' });
  }
});

// Get exercises database
router.get('/exercises', async (_req, res: Response) => {
  try {
    const exercises = await prisma.exercise.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(exercises);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения упражнений' });
  }
});

export { router as workoutRouter };
