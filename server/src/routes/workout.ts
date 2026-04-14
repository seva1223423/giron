import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

const createProgramSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.string().min(1),
  goal: z.string().min(1).optional(),
  level: z.string().min(1).optional(),
  daysPerWeek: z.number().int().min(1).max(7),
  durationWeeks: z.number().int().min(1).max(52).optional(),
});

const workoutSetUpdateSchema = z.object({
  id: z.string().min(1).max(100),
  reps: z.number().int().min(0).max(10000).optional().nullable(),
  weight: z.number().min(0).max(10000).optional().nullable(),
  completed: z.boolean().optional(),
  rpe: z.number().min(1).max(10).optional().nullable(),
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

const syncWorkoutSetSchema = z.object({
  type: z.string().max(50).optional(),
  reps: z.number().int().min(0).max(999).optional().nullable(),
  weight: z.number().min(0).max(2000).optional().nullable(),
  rpe: z.number().min(1).max(10).optional().nullable(),
  completed: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
});

const syncWorkoutExerciseSchema = z.object({
  exerciseId: z.string().min(1).max(100),
  restSeconds: z.number().int().min(0).max(600).optional(),
  supersetGroupId: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  sets: z.array(syncWorkoutSetSchema).max(30).optional(),
});

const syncWorkoutSchema = z.object({
  clientId: z.string().max(100).optional().nullable(),
  name: z.string().min(1).max(200),
  notes: z.string().max(2000).optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
  startedAt: z.string().datetime().optional().nullable(),
  durationMinutes: z.number().int().min(0).max(1440).optional(),
  totalVolume: z.number().min(0).max(1_000_000).optional(),
  exercises: z.array(syncWorkoutExerciseSchema).min(1).max(50),
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
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения программ' });
  }
});

// Create program
router.post('/programs', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createProgramSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const { name, description, type, goal, level, daysPerWeek, durationWeeks } = parsed.data;

    // Deactivate current active program and create new one atomically
    const program = await prisma.$transaction(async (tx) => {
      await tx.program.updateMany({
        where: { userId: req.userId, isActive: true },
        data: { isActive: false },
      });

      return tx.program.create({
        data: {
          name,
          description,
          type,
          goal: (goal ?? 'GENERAL_FITNESS') as any,
          level: (level ?? 'BEGINNER') as any,
          daysPerWeek,
          durationWeeks,
          isActive: true,
          createdBy: 'user',
          userId: req.userId!,
        },
      });
    });
    res.status(201).json(program);
  } catch (e) {
    logger.error(e);
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
    logger.error(e);
    res.status(500).json({ error: 'Ошибка старта тренировки' });
  }
});

// Sync a locally-completed workout to the server (offline-first pattern)
// Uses clientId as idempotency key — if the workout was already synced, returns the existing record
router.post('/sync', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = syncWorkoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
    const { clientId, name, exercises, completedAt, startedAt, durationMinutes, totalVolume, notes } = parsed.data;

    // If clientId provided, check if this workout was already synced (idempotency)
    // IMPORTANT: verify ownership to prevent cross-user data exposure
    if (clientId) {
      const existing = await prisma.workout.findUnique({ where: { clientId } });
      if (existing) {
        if (existing.userId !== req.userId) {
          return res.status(403).json({ error: 'Доступ запрещён' });
        }
        return res.status(200).json(existing);
      }
    }

    // Find or get active program
    const activeProgram = await prisma.program.findFirst({
      where: { userId: req.userId, isActive: true },
    });

    const workout = await prisma.workout.create({
      data: {
        clientId: clientId || null,
        name,
        notes: notes || null,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        completedAt: completedAt ? new Date(completedAt) : new Date(),
        durationMinutes: durationMinutes || 0,
        totalVolume: totalVolume || 0,
        userId: req.userId!,
        programId: activeProgram?.id || null,
        exercises: {
          create: exercises.map((ex: any, i: number) => ({
            order: i,
            exerciseId: ex.exerciseId,
            restSeconds: ex.restSeconds || 90,
            supersetGroupId: ex.supersetGroupId || null,
            notes: ex.notes || null,
            sets: {
              create: (ex.sets || []).map((s: any, j: number) => ({
                setNumber: j + 1,
                type: s.type || 'normal',
                reps: s.reps || null,
                weight: s.weight || null,
                rpe: s.rpe || null,
                completed: s.completed || false,
                notes: s.notes || null,
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
    logger.error('Workout sync error:', e);
    res.status(500).json({ error: 'Ошибка синхронизации тренировки' });
  }
});

// Complete workout
router.post('/:id/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const setsParsed = z.object({
      sets: z.array(workoutSetUpdateSchema).max(500).optional(),
    }).safeParse(req.body);
    if (!setsParsed.success) return res.status(400).json({ error: 'Некорректные данные сетов' });
    const { sets } = setsParsed.data;

    // Verify ownership
    const workout = await prisma.workout.findUnique({
      where: { id },
      include: { exercises: { include: { sets: true } } },
    });
    if (!workout || workout.userId !== req.userId) {
      return res.status(404).json({ error: 'Тренировка не найдена' });
    }

    // Update sets in parallel (only sets belonging to this workout)
    const validSetIds = new Set(workout.exercises.flatMap((ex: any) => ex.sets.map((s: any) => s.id)));
    if (sets) {
      await Promise.all(
        sets.filter((set: any) => validSetIds.has(set.id)).map((set: any) =>
          prisma.workoutSet.update({
            where: { id: set.id },
            data: { reps: set.reps, weight: set.weight, completed: set.completed, rpe: set.rpe },
          })
        )
      );
    }

    // Refetch sets after update
    const refreshed = await prisma.workout.findUnique({
      where: { id },
      include: { exercises: { include: { sets: true } } },
    });
    const totalVolume = refreshed?.exercises
      .reduce(
        (total: number, ex: any) =>
          total + ex.sets.filter((s: any) => s.completed).reduce((sum: number, s: any) => sum + (s.weight || 0) * (s.reps || 0), 0),
        0
      ) || 0;

    const startedAt = refreshed?.startedAt;
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
    logger.error(e);
    res.status(500).json({ error: 'Ошибка завершения тренировки' });
  }
});

// Autosave workout progress (mid-workout, fire-and-forget from client)
router.post('/:id/autosave', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const setsParsed = z.object({
      sets: z.array(workoutSetUpdateSchema).min(1).max(500),
    }).safeParse(req.body);
    if (!setsParsed.success) return res.status(400).json({ error: 'Некорректные данные сетов' });
    const { sets } = setsParsed.data;

    // Verify ownership
    const workout = await prisma.workout.findUnique({
      where: { id },
      select: { userId: true, exercises: { select: { sets: { select: { id: true } } } } },
    });
    if (!workout || workout.userId !== req.userId) {
      return res.status(404).json({ error: 'Тренировка не найдена' });
    }

    // Only update sets belonging to this workout
    const validSetIds = new Set(workout.exercises.flatMap((ex: any) => ex.sets.map((s: any) => s.id)));
    await Promise.all(
      sets.filter((set: any) => validSetIds.has(set.id)).map((set: any) =>
        prisma.workoutSet.update({
          where: { id: set.id },
          data: { reps: set.reps, weight: set.weight, completed: set.completed, rpe: set.rpe },
        }).catch(() => {})
      )
    );

    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка автосохранения' });
  }
});

// Get workout history
router.get('/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { limit: rawLimit = '50', offset: rawOffset = '0' } = req.query;
    const limit = Math.min(Math.max(parseInt(rawLimit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(rawOffset as string) || 0, 0);
    const workouts = await prisma.workout.findMany({
      where: { userId: req.userId, completedAt: { not: null } },
      include: {
        exercises: {
          include: { exercise: true, sets: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
      skip: offset,
    });
    res.json(workouts);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения истории' });
  }
});

// Club leaderboard — top lifts per exercise across all users
router.get('/leaderboard', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Find users who have at least 10 completed workouts and were active in the last 90 days
    const activeUsers = await prisma.workout.groupBy({
      by: ['userId'],
      where: { completedAt: { not: null } },
      _count: { id: true },
      _max: { completedAt: true },
      having: { id: { _count: { gte: 10 } } },
    });

    const verifiedUserIds = new Set(
      activeUsers
        .filter((u) => u._max.completedAt && u._max.completedAt >= ninetyDaysAgo)
        .map((u) => u.userId)
    );

    if (verifiedUserIds.size === 0) {
      return res.json({ leaderboard: [] });
    }

    // Fetch completed sets with user and exercise info, only for verified users
    const sets = await prisma.workoutSet.findMany({
      where: {
        completed: true,
        weight: { gt: 0 },
        reps: { gt: 0 },
        workoutExercise: { workout: { userId: { in: Array.from(verifiedUserIds) }, completedAt: { not: null } } },
      },
      select: {
        weight: true,
        reps: true,
        workoutExercise: {
          select: {
            exercise: { select: { id: true, name: true } },
            workout: {
              select: {
                id: true,
                completedAt: true,
                user: { select: { id: true, firstName: true } },
              },
            },
          },
        },
      },
      take: 5000,
    });

    // Count how many distinct workouts each user has done per exercise
    const exerciseWorkoutCount: Map<string, Set<string>> = new Map();
    sets.forEach((s) => {
      const ex = s.workoutExercise?.exercise;
      const workout = s.workoutExercise?.workout;
      const user = workout?.user;
      if (!ex || !user || !workout) return;
      const key = `${user.id}::${ex.id}`;
      if (!exerciseWorkoutCount.has(key)) exerciseWorkoutCount.set(key, new Set());
      exerciseWorkoutCount.get(key)!.add(workout.id);
    });

    // Aggregate: best estimated 1RM per (userId, exerciseId)
    const bestMap: Map<string, {
      exerciseName: string;
      userName: string;
      weightKg: number;
      reps: number;
      estimated1RM: number;
      date: string | null;
      verified: boolean;
    }> = new Map();

    sets.forEach((s) => {
      const ex = s.workoutExercise?.exercise;
      const workout = s.workoutExercise?.workout;
      const user = workout?.user;
      if (!ex || !user || !s.weight || !s.reps) return;

      const est1rm = Math.round(s.weight * (1 + s.reps / 30));
      const key = `${user.id}::${ex.id}`;
      const existing = bestMap.get(key);

      // Entry is verified if the user did this exercise in 3+ separate workouts
      const exerciseSessions = exerciseWorkoutCount.get(key)?.size ?? 0;
      const verified = exerciseSessions >= 3;

      if (!existing || est1rm > existing.estimated1RM) {
        bestMap.set(key, {
          exerciseName: ex.name,
          userName: user.firstName,
          weightKg: s.weight,
          reps: s.reps,
          estimated1RM: est1rm,
          date: workout?.completedAt?.toISOString() ?? null,
          verified,
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
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения лидерборда' });
  }
});

// Get exercises database
router.get('/exercises', authenticate, async (_req, res: Response) => {
  try {
    const exercises = await prisma.exercise.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(exercises);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения упражнений' });
  }
});

export { router as workoutRouter };
