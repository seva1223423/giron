import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';

const router = Router();

const createProgramSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.string().min(1),
  goal: z.string().min(1),
  level: z.string().min(1),
  daysPerWeek: z.number().int().min(1).max(7),
  durationWeeks: z.number().int().min(1).max(52).optional(),
});

const startWorkoutSchema = z.object({
  name: z.string().min(1).max(200),
  exercises: z.array(z.object({
    exerciseId: z.string().min(1),
    restSeconds: z.number().int().min(0).max(600).optional(),
    sets: z.array(z.object({
      type: z.string().optional(),
      reps: z.number().int().min(0).max(999).optional(),
      weight: z.number().min(0).max(2000).optional(),
    })).min(1),
  })).min(1),
});

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
    const parsed = createProgramSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const { name, description, type, goal, level, daysPerWeek, durationWeeks } = parsed.data;

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
    const parsed = startWorkoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const { name, exercises } = parsed.data;

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
    const id = req.params.id as string;
    const { sets } = req.body;

    // Update sets in parallel
    if (sets) {
      await Promise.all(
        sets.map((set: any) =>
          prisma.workoutSet.update({
            where: { id: set.id },
            data: { reps: set.reps, weight: set.weight, completed: set.completed, rpe: set.rpe },
          })
        )
      );
    }

    // Calculate total volume
    const workout = await prisma.workout.findUnique({
      where: { id },
      include: { exercises: { include: { sets: true } } },
    });

    const totalVolume = workout?.exercises
      .reduce(
        (total: number, ex: any) =>
          total + ex.sets.filter((s: any) => s.completed).reduce((sum: number, s: any) => sum + (s.weight || 0) * (s.reps || 0), 0),
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

// Club leaderboard — top lifts per exercise across all users
router.get('/leaderboard', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    // Fetch completed sets with user and exercise info
    const sets = await prisma.workoutSet.findMany({
      where: { completed: true, weight: { gt: 0 }, reps: { gt: 0 } },
      select: {
        weight: true,
        reps: true,
        workoutExercise: {
          select: {
            exercise: { select: { id: true, name: true } },
            workout: {
              select: {
                completedAt: true,
                user: { select: { id: true, firstName: true } },
              },
            },
          },
        },
      },
      take: 5000,
    });

    // Aggregate: best estimated 1RM per (userId, exerciseId)
    const bestMap: Map<string, {
      exerciseName: string;
      userName: string;
      weightKg: number;
      reps: number;
      estimated1RM: number;
      date: string | null;
    }> = new Map();

    sets.forEach((s) => {
      const ex = s.workoutExercise?.exercise;
      const workout = s.workoutExercise?.workout;
      const user = workout?.user;
      if (!ex || !user || !s.weight || !s.reps) return;

      const est1rm = Math.round(s.weight * (1 + s.reps / 30));
      const key = `${user.id}::${ex.id}`;
      const existing = bestMap.get(key);

      if (!existing || est1rm > existing.estimated1RM) {
        bestMap.set(key, {
          exerciseName: ex.name,
          userName: user.firstName,
          weightKg: s.weight,
          reps: s.reps,
          estimated1RM: est1rm,
          date: workout?.completedAt?.toISOString() ?? null,
        });
      }
    });

    // Sort by 1RM desc, take top 100
    const leaderboard = Array.from(bestMap.values())
      .sort((a, b) => b.estimated1RM - a.estimated1RM)
      .slice(0, 100)
      .map((entry, i) => ({ rank: i + 1, ...entry }));

    res.json({ leaderboard });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения лидерборда' });
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
