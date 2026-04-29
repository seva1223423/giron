import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { MemCache } from '../utils/memCache';
import { getSubStatus } from '../utils/subscriptionCheck';

/** Free plan: max workout history entries returned */
const FREE_WORKOUT_HISTORY_LIMIT = 10;

/** Leaderboard cache — 15 minutes (expensive query, changes slowly) */
const leaderboardCache = new MemCache<unknown>(5);
/** Exercises cache — 1 hour (exercise library almost never changes) */
const exercisesCache = new MemCache<unknown>(2);

const router = Router();

/** CUID v1 format: starts with 'c', ~25 chars, alphanumeric */
const CUID_RE = /^c[a-z0-9]{20,30}$/;
const isValidId = (id: string | string[]) => CUID_RE.test(String(id));

const createProgramSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.string().min(1),
  goal: z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'STRENGTH', 'ENDURANCE', 'FLEXIBILITY', 'GENERAL_FITNESS']).optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).optional(),
  daysPerWeek: z.number().int().finite().min(1).max(7),
  durationWeeks: z.number().int().finite().min(1).max(52).optional(),
});

const workoutSetUpdateSchema = z.object({
  id: z.string().min(1).max(100),
  reps: z.number().int().finite().min(0).max(999).optional().nullable(),
  weight: z.number().finite().min(0).max(2000).optional().nullable(),
  completed: z.boolean().optional(),
  rpe: z.number().finite().min(1).max(10).optional().nullable(),
});

const startWorkoutSchema = z.object({
  name: z.string().min(1).max(200),
  exercises: z.array(z.object({
    exerciseId: z.string().min(1),
    restSeconds: z.number().int().finite().min(0).max(600).optional(),
    sets: z.array(z.object({
      type: z.string().optional(),
      reps: z.number().int().finite().min(0).max(999).optional(),
      weight: z.number().finite().min(0).max(2000).optional(),
    })).min(1).max(100),
  })).min(1).max(50),
});

const syncWorkoutSetSchema = z.object({
  type: z.string().max(50).optional(),
  reps: z.number().int().finite().min(0).max(999).optional().nullable(),
  weight: z.number().finite().min(0).max(2000).optional().nullable(),
  rpe: z.number().finite().min(1).max(10).optional().nullable(),
  completed: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
});

const syncWorkoutExerciseSchema = z.object({
  exerciseId: z.string().min(1).max(100),
  restSeconds: z.number().int().finite().min(0).max(600).optional(),
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
  durationMinutes: z.number().int().finite().min(0).max(1440).optional(),
  totalVolume: z.number().finite().min(0).max(1_000_000).optional(),
  routineId: z.string().max(100).optional().nullable(),
  exercises: z.array(syncWorkoutExerciseSchema).min(1).max(50),
});

// Exercise fields needed for list rendering. Heavy fields (description, instructions,
// videoUrl, imageUrl) are only used in ExerciseDetailScreen — fetched on demand there,
// not in program/history list responses.
const EXERCISE_LIST_SELECT = {
  id: true, name: true, type: true, category: true, difficulty: true,
  primaryMuscles: true, secondaryMuscles: true,
} as const;

// Get all programs
router.get('/programs', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const programs = await prisma.program.findMany({
      where: { userId: req.userId },
      include: {
        workouts: {
          include: {
            exercises: {
              include: { exercise: { select: EXERCISE_LIST_SELECT }, sets: true },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
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
          goal: goal ?? 'GENERAL_FITNESS',
          level: level ?? 'BEGINNER',
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

// Update program (rename, change goal/level, toggle active)
router.patch('/programs/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { id } = req.params as { id: string };
    const updateProgramSchema = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).optional().nullable(),
      isActive: z.boolean().optional(),
      goal: z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'STRENGTH', 'ENDURANCE', 'FLEXIBILITY', 'GENERAL_FITNESS']).optional(),
      level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).optional(),
      daysPerWeek: z.number().int().finite().min(1).max(7).optional(),
    });
    const parsed = updateProgramSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    // Verify ownership
    const existing = await prisma.program.findUnique({ where: { id }, select: { userId: true } });
    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'Программа не найдена' });
    }

    const program = await prisma.$transaction(async (tx) => {
      // If activating this program, deactivate all others first
      if (parsed.data.isActive === true) {
        await tx.program.updateMany({ where: { userId: req.userId, isActive: true }, data: { isActive: false } });
      }
      return tx.program.update({ where: { id, userId: req.userId! }, data: parsed.data });
    });

    res.json(program);
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Программа не найдена' });
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления программы' });
  }
});

// Delete program
router.delete('/programs/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { id } = req.params as { id: string };
    const deleted = await prisma.program.deleteMany({ where: { id, userId: req.userId! } });
    if (deleted.count === 0) return res.status(404).json({ error: 'Программа не найдена' });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления программы' });
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
  } catch (e: any) {
    // P2003 = foreign key constraint — one of the exerciseIds does not exist
    if (e?.code === 'P2003') {
      return res.status(400).json({ error: 'Одно или несколько упражнений не найдены' });
    }
    logger.error(e);
    res.status(500).json({ error: 'Ошибка старта тренировки' });
  }
});

// Sync a locally-completed workout to the server (offline-first pattern)
// Uses clientId as idempotency key — if the workout was already synced, returns the existing record
router.post('/sync', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = syncWorkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
  try {
    const { clientId, name, exercises, completedAt, startedAt, durationMinutes, totalVolume, notes, routineId } = parsed.data;

    // If clientId provided, check if this workout was already synced (idempotency).
    // Scope lookup to the current user so clientId uniqueness is per-user and no
    // information about other users' workouts is leaked.
    if (clientId) {
      const existing = await prisma.workout.findFirst({ where: { clientId, userId: req.userId! } });
      if (existing) {
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
        routineId: routineId || null,
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
  } catch (e: any) {
    // P2002 = unique constraint violation — concurrent sync with same clientId+userId
    if (e?.code === 'P2002' && e?.meta?.target?.includes?.('clientId')) {
      // Race condition: another request already created it — return existing record
      if (parsed.success && parsed.data.clientId) {
        const existing = await prisma.workout.findFirst({ where: { clientId: parsed.data.clientId, userId: req.userId! } }).catch(() => null);
        if (existing) return res.status(200).json(existing);
      }
      return res.status(409).json({ error: 'Тренировка с данным clientId уже существует' });
    }
    // P2003 = foreign key constraint — either an exerciseId or routineId doesn't exist.
    // For routineId, degrade gracefully (routine was deleted after /start was called).
    if (e?.code === 'P2003') {
      const field: string = e?.meta?.field_name ?? '';
      if (field.toLowerCase().includes('routine') && parsed.data.routineId) {
        try {
          const activeProgram = await prisma.program.findFirst({ where: { userId: req.userId, isActive: true } });
          const fallback = await prisma.workout.create({
            data: {
              clientId: parsed.data.clientId || null,
              name: parsed.data.name,
              notes: parsed.data.notes || null,
              startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : new Date(),
              completedAt: parsed.data.completedAt ? new Date(parsed.data.completedAt) : new Date(),
              durationMinutes: parsed.data.durationMinutes || 0,
              totalVolume: parsed.data.totalVolume || 0,
              userId: req.userId!,
              programId: activeProgram?.id || null,
              routineId: null,
              exercises: {
                create: parsed.data.exercises.map((ex: any, i: number) => ({
                  order: i, exerciseId: ex.exerciseId, restSeconds: ex.restSeconds || 90,
                  supersetGroupId: ex.supersetGroupId || null, notes: ex.notes || null,
                  sets: { create: (ex.sets || []).map((s: any, j: number) => ({
                    setNumber: j + 1, type: s.type || 'normal', reps: s.reps || null,
                    weight: s.weight || null, rpe: s.rpe || null, completed: s.completed || false, notes: s.notes || null,
                  })) },
                })),
              },
            },
            include: { exercises: { include: { exercise: true, sets: true }, orderBy: { order: 'asc' } } },
          });
          return res.status(201).json(fallback);
        } catch (e2: any) {
          if (e2?.code === 'P2003') return res.status(400).json({ error: 'Одно или несколько упражнений не найдены' });
          logger.error('Workout sync fallback error:', e2);
          return res.status(500).json({ error: 'Ошибка синхронизации тренировки' });
        }
      }
      return res.status(400).json({ error: 'Одно или несколько упражнений не найдены' });
    }
    logger.error('Workout sync error:', e);
    res.status(500).json({ error: 'Ошибка синхронизации тренировки' });
  }
});

// Complete workout
router.post('/:id/complete', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
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

    // Update sets in a single transaction (only sets belonging to this workout)
    const validSetIds = new Set(workout.exercises.flatMap((ex: any) => ex.sets.map((s: any) => s.id)));
    if (sets) {
      const validSets = sets.filter((set: any) => validSetIds.has(set.id));
      if (validSets.length > 0) {
        await prisma.$transaction(
          validSets.map((set: any) =>
            prisma.workoutSet.updateMany({
              where: { id: set.id },
              data: { reps: set.reps, weight: set.weight, completed: set.completed, rpe: set.rpe },
            })
          )
        );
      }
    }

    // Refetch sets after update
    const refreshed = await prisma.workout.findUnique({
      where: { id },
      include: { exercises: { include: { sets: true } } },
    });
    const totalVolume = (refreshed?.exercises ?? [])
      .reduce(
        (total: number, ex: any) =>
          total + ex.sets.filter((s: any) => s.completed && s.type !== 'warmup').reduce((sum: number, s: any) => sum + (s.weight || 0) * (s.reps || 0), 0),
        0
      );

    const startedAt = refreshed?.startedAt;
    const rawDuration = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 60000) : 0;
    const durationMinutes = Math.min(Math.max(rawDuration, 0), 1440);

    // Atomic guard: only update if not yet completed (prevents double-completion race)
    const completionResult = await prisma.workout.updateMany({
      where: { id, userId: req.userId!, completedAt: null },
      data: { completedAt: new Date(), durationMinutes, totalVolume },
    });
    if (completionResult.count === 0) {
      return res.status(409).json({ error: 'Тренировка уже завершена' });
    }

    // Retention bookkeeping (RETENTION-01) lives in the auth middleware
    // now (1h-throttled lastActiveAt sync on every authenticated request),
    // so completing a workout already keeps the 7/14/30d reactivation
    // cohorts accurate via the same ride-along write. Day-granularity
    // cohorts don't care about <1h staleness; the duplicate update we
    // used to fire here was just extra DB churn without a defensive
    // thenable guard, fragile under tests that didn't mock user.update.

    const updated = await prisma.workout.findUnique({
      where: { id },
      include: {
        exercises: {
          include: { exercise: true, sets: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    res.json(updated);
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Тренировка не найдена' });
    logger.error(e);
    res.status(500).json({ error: 'Ошибка завершения тренировки' });
  }
});

// Autosave workout progress (mid-workout, fire-and-forget from client)
router.post('/:id/autosave', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
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

    // Only update sets belonging to this workout, in a single transaction
    const validSetIds = new Set(workout.exercises.flatMap((ex: any) => ex.sets.map((s: any) => s.id)));
    const validSets = sets.filter((set: any) => validSetIds.has(set.id));
    if (validSets.length > 0) {
      await prisma.$transaction(
        validSets.map((set: any) =>
          prisma.workoutSet.updateMany({
            where: { id: set.id },
            data: { reps: set.reps, weight: set.weight, completed: set.completed, rpe: set.rpe },
          })
        )
      ).catch(() => {}); // autosave is fire-and-forget; ignore transaction errors
    }

    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка автосохранения' });
  }
});

// Patch workout notes/rating (post-session fields the client may update after sync)
router.patch('/client/:clientId/notes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params;
    const parsed = z.object({
      notes: z.string().max(2000).nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные' });

    const workout = await prisma.workout.findFirst({ where: { clientId: String(clientId), userId: req.userId! } });
    if (!workout) return res.status(404).json({ error: 'Тренировка не найдена' });

    const updated = await prisma.workout.updateMany({
      where: { id: workout.id, userId: req.userId! },
      data: { notes: parsed.data.notes ?? null },
    });
    if (updated.count === 0) return res.status(404).json({ error: 'Тренировка не найдена' });
    res.json({ id: workout.id, notes: parsed.data.notes ?? null });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления заметки' });
  }
});

// Get workout history
router.get('/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { limit: rawLimit = '50', offset: rawOffset = '0' } = req.query;
    const requestedLimit = Math.min(Math.max(parseInt(rawLimit as string, 10) || 50, 1), 200);
    const offset = Math.min(Math.max(parseInt(rawOffset as string, 10) || 0, 0), 10000);

    // Free plan: cap at FREE_WORKOUT_HISTORY_LIMIT regardless of requested limit/offset.
    // This prevents paywall bypass via direct API calls.
    const { isPaid } = await getSubStatus(req.userId!);
    const effectiveLimit = isPaid ? requestedLimit : Math.min(requestedLimit, FREE_WORKOUT_HISTORY_LIMIT);
    const effectiveOffset = isPaid ? offset : 0; // free users always start from beginning (most recent)

    const where = { userId: req.userId, completedAt: { not: null } };
    const [workouts, total] = await Promise.all([
      prisma.workout.findMany({
        where,
        include: {
          exercises: {
            include: { exercise: { select: EXERCISE_LIST_SELECT }, sets: true },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { completedAt: 'desc' },
        take: effectiveLimit,
        skip: effectiveOffset,
      }),
      prisma.workout.count({ where }),
    ]);
    res.json({ workouts, total: isPaid ? total : Math.min(total, FREE_WORKOUT_HISTORY_LIMIT), limit: effectiveLimit, offset: effectiveOffset });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения истории' });
  }
});

// Club leaderboard — top lifts per exercise across all users (cached 15 minutes)
router.get('/leaderboard', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Require active paid subscription — prevent paywall bypass via direct API calls
    const { isPaid } = await getSubStatus(req.userId!);
    if (!isPaid) {
      return res.status(402).json({ error: 'Клубный лидерборд доступен только для платных подписчиков', code: 'SUBSCRIPTION_REQUIRED' });
    }

    const cached = leaderboardCache.get('leaderboard');
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Single SQL query replaces 2 Prisma round-trips + JS aggregation over up to 5000 rows.
    // active_users CTE: users with ≥10 completed workouts active within 90 days.
    // session_counts CTE: distinct workout sessions per (userId, exerciseId) for verified flag.
    // ROW_NUMBER() picks the best 1RM set per (userId, exerciseId) without fetching all sets.
    // The @@index([userId, completedAt]) on Workout covers the JOIN filter in all three CTEs.
    type LeaderboardRow = {
      exerciseName: string;
      userName: string;
      weightKg: number;
      reps: number;
      estimated1RM: number;
      date: string | null;
      verified: boolean;
    };

    const rows = await prisma.$queryRaw<LeaderboardRow[]>`
      WITH active_users AS (
        SELECT "userId"
        FROM   "Workout"
        WHERE  "completedAt" IS NOT NULL
        GROUP  BY "userId"
        HAVING COUNT(*) >= 10
           AND MAX("completedAt") >= ${ninetyDaysAgo}
      ),
      session_counts AS (
        SELECT w."userId", we."exerciseId", COUNT(DISTINCT w.id) AS sessions
        FROM   "WorkoutExercise" we
        JOIN   "Workout" w ON w.id = we."workoutId"
        WHERE  w."completedAt" IS NOT NULL
          AND  w."userId" IN (SELECT "userId" FROM active_users)
        GROUP  BY w."userId", we."exerciseId"
      ),
      ranked_sets AS (
        SELECT
          e.name                                          AS "exerciseName",
          u."firstName"                                   AS "userName",
          ws.weight                                       AS "weightKg",
          ws.reps,
          ROUND(ws.weight * (1 + ws.reps / 30.0))::int   AS "estimated1RM",
          w."completedAt"::text                           AS date,
          (sc.sessions >= 3)                              AS verified,
          ROW_NUMBER() OVER (
            PARTITION BY w."userId", we."exerciseId"
            ORDER BY ws.weight * (1 + ws.reps / 30.0) DESC
          ) AS rn
        FROM  "WorkoutSet"      ws
        JOIN  "WorkoutExercise" we ON we.id  = ws."workoutExerciseId"
        JOIN  "Workout"          w ON w.id   = we."workoutId"
        JOIN  "Exercise"         e ON e.id   = we."exerciseId"
        JOIN  "User"             u ON u.id   = w."userId"
        JOIN  session_counts    sc ON sc."userId" = w."userId"
                                  AND sc."exerciseId" = we."exerciseId"
        WHERE ws.completed = true
          AND ws.weight > 0
          AND ws.reps   > 0
          AND w."completedAt" IS NOT NULL
          AND w."userId" IN (SELECT "userId" FROM active_users)
      )
      SELECT "exerciseName", "userName", "weightKg", reps,
             "estimated1RM", date, verified
      FROM   ranked_sets
      WHERE  rn = 1
      ORDER  BY "estimated1RM" DESC
      LIMIT  100
    `;

    const leaderboard = rows
      .map((row, i) => {
        const est1RM = Number(row.estimated1RM);
        if (!Number.isFinite(est1RM) || est1RM <= 0) return null;
        return {
          rank: i + 1,
          exerciseName: row.exerciseName,
          userName: row.userName,
          weightKg: Number(row.weightKg),
          reps: Number(row.reps),
          estimated1RM: est1RM,
          date: row.date,
          verified: Boolean(row.verified),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const payload = { leaderboard };
    leaderboardCache.set('leaderboard', payload, 15 * 60 * 1000);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения лидерборда' });
  }
});

// Get exercises database (cached 1 hour — library changes rarely)
router.get('/exercises', authenticate, async (_req, res: Response) => {
  try {
    const cached = exercisesCache.get('exercises');
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
    const exercises = await prisma.exercise.findMany({ orderBy: { name: 'asc' }, take: 500, select: EXERCISE_LIST_SELECT });
    exercisesCache.set('exercises', exercises, 60 * 60 * 1000);
    res.setHeader('X-Cache', 'MISS');
    res.json(exercises);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения упражнений' });
  }
});

// ==================== ROUTINES ====================

const createRoutineSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  exercises: z.array(z.object({
    exerciseId: z.string().min(1).max(100),
    order: z.number().int().min(0).max(49),
    restSeconds: z.number().int().min(0).max(600).optional(),
    notes: z.string().max(500).optional(),
    sets: z.array(z.object({
      setNumber: z.number().int().min(1).max(30),
      type: z.string().max(50).optional(),
      reps: z.number().int().min(0).max(999).optional(),
      weight: z.number().min(0).max(2000).optional(),
      rpe: z.number().min(1).max(10).optional(),
    })).min(1).max(30),
  })).min(1).max(30),
});

// List user routines
router.get('/routines', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const routines = await prisma.routine.findMany({
      where: { userId: req.userId },
      include: {
        exercises: {
          include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(routines);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения рутин' });
  }
});

// Create routine
router.post('/routines', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = createRoutineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
  try {
    const { name, description, exercises } = parsed.data;
    const routine = await prisma.routine.create({
      data: {
        name,
        description,
        userId: req.userId!,
        exercises: {
          create: exercises.map((ex) => ({
            order: ex.order,
            restSeconds: ex.restSeconds ?? 90,
            notes: ex.notes,
            exerciseId: ex.exerciseId,
            sets: {
              create: ex.sets.map((s) => ({
                setNumber: s.setNumber,
                type: s.type ?? 'normal',
                reps: s.reps,
                weight: s.weight,
                rpe: s.rpe,
              })),
            },
          })),
        },
      },
      include: {
        exercises: {
          include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { order: 'asc' },
        },
      },
    });
    res.status(201).json(routine);
  } catch (e: any) {
    if (e?.code === 'P2003') return res.status(400).json({ error: 'Одно или несколько упражнений не найдены' });
    logger.error(e);
    res.status(500).json({ error: 'Ошибка создания рутины' });
  }
});

// Get single routine
router.get('/routines/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { id } = req.params as { id: string };
    const routine = await prisma.routine.findUnique({
      where: { id },
      include: {
        exercises: {
          include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!routine || routine.userId !== req.userId) return res.status(404).json({ error: 'Рутина не найдена' });
    res.json(routine);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения рутины' });
  }
});

// Replace routine exercises (full update)
router.put('/routines/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  const parsed = createRoutineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.routine.findUnique({ where: { id }, select: { userId: true } });
    if (!existing || existing.userId !== req.userId) return res.status(404).json({ error: 'Рутина не найдена' });

    const { name, description, exercises } = parsed.data;
    const routine = await prisma.$transaction(async (tx) => {
      await tx.routineExercise.deleteMany({ where: { routineId: id } });
      return tx.routine.update({
        where: { id },
        data: {
          name,
          description,
          exercises: {
            create: exercises.map((ex) => ({
              order: ex.order,
              restSeconds: ex.restSeconds ?? 90,
              notes: ex.notes,
              exerciseId: ex.exerciseId,
              sets: {
                create: ex.sets.map((s) => ({
                  setNumber: s.setNumber,
                  type: s.type ?? 'normal',
                  reps: s.reps,
                  weight: s.weight,
                  rpe: s.rpe,
                })),
              },
            })),
          },
        },
        include: {
          exercises: {
            include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
            orderBy: { order: 'asc' },
          },
        },
      });
    });
    res.json(routine);
  } catch (e: any) {
    if (e?.code === 'P2003') return res.status(400).json({ error: 'Одно или несколько упражнений не найдены' });
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления рутины' });
  }
});

// Duplicate routine — creates an identical copy with "(копия)" suffix
router.post('/routines/:id/duplicate', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { id } = req.params as { id: string };
    const source = await prisma.routine.findUnique({
      where: { id },
      include: { exercises: { include: { sets: { orderBy: { setNumber: 'asc' } } }, orderBy: { order: 'asc' } } },
    });
    if (!source || source.userId !== req.userId) return res.status(404).json({ error: 'Рутина не найдена' });

    const copy = await prisma.routine.create({
      data: {
        name: `${source.name} (копия)`,
        description: source.description,
        userId: req.userId!,
        exercises: {
          create: source.exercises.map((ex) => ({
            order: ex.order,
            restSeconds: ex.restSeconds,
            notes: ex.notes,
            exerciseId: ex.exerciseId,
            sets: { create: ex.sets.map((s) => ({ setNumber: s.setNumber, type: s.type, reps: s.reps, weight: s.weight, rpe: s.rpe })) },
          })),
        },
      },
      include: { exercises: { include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } }, orderBy: { order: 'asc' } } },
    });
    res.status(201).json(copy);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка дублирования рутины' });
  }
});

// Rename / patch routine (name + description only — use PUT for full exercise replacement)
router.patch('/routines/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  const parsed = z.object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
  if (!parsed.data.name && parsed.data.description === undefined) {
    return res.status(400).json({ error: 'Нет полей для обновления' });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.routine.findUnique({ where: { id }, select: { userId: true } });
    if (!existing || existing.userId !== req.userId) return res.status(404).json({ error: 'Рутина не найдена' });
    const routine = await prisma.routine.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      },
      include: {
        exercises: {
          include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { order: 'asc' },
        },
      },
    });
    res.json(routine);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления рутины' });
  }
});

// Delete routine
router.delete('/routines/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { id } = req.params as { id: string };
    const deleted = await prisma.routine.deleteMany({ where: { id, userId: req.userId! } });
    if (deleted.count === 0) return res.status(404).json({ error: 'Рутина не найдена' });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления рутины' });
  }
});

// Prepare workout from routine — returns workout shape with progressive overload applied.
// Does NOT create a workout record; client calls startWorkout() locally then syncs on finish.
router.post('/routines/:id/start', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { id } = req.params as { id: string };
    const routine = await prisma.routine.findUnique({
      where: { id },
      include: {
        exercises: {
          include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!routine || routine.userId !== req.userId) return res.status(404).json({ error: 'Рутина не найдена' });

    // Find the last workout that was started from this routine
    const lastRoutineWorkout = await prisma.workout.findFirst({
      where: { routineId: routine.id, userId: req.userId!, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    });

    // Build workout exercises with progressive overload
    const exercises = await Promise.all(
      routine.exercises.map(async (re) => {
        // Find the last completed workout session that used this exercise
        const lastWorkout = await prisma.workout.findFirst({
          where: {
            userId: req.userId!,
            completedAt: { not: null },
            exercises: { some: { exerciseId: re.exerciseId } },
          },
          orderBy: { completedAt: 'desc' },
          include: {
            exercises: {
              where: { exerciseId: re.exerciseId },
              include: { sets: { where: { type: { not: 'warmup' } } } },
            },
          },
        });

        const lastSets = lastWorkout?.exercises[0]?.sets ?? [];
        const completedSets = lastSets.filter((s) => s.completed);
        const lastWeight = completedSets.length > 0
          ? Math.max(...completedSets.map((s) => s.weight ?? 0))
          : 0;
        const targetReps = re.sets[re.sets.length - 1]?.reps;
        const lastReps = completedSets.length > 0
          ? completedSets[completedSets.length - 1].reps
          : null;
        const allCompleted = lastSets.length > 0 && lastSets.every((s) => s.completed);
        const shouldProgress = allCompleted && lastReps !== null && targetReps !== null
          && lastReps !== undefined && targetReps !== undefined && lastReps >= targetReps;

        const progressedWeight = lastWeight > 0
          ? (shouldProgress ? Math.round((lastWeight + 2.5) * 4) / 4 : lastWeight)
          : 0;

        return {
          exerciseId: re.exerciseId,
          exercise: re.exercise,
          order: re.order,
          restSeconds: re.restSeconds,
          notes: re.notes,
          sets: re.sets.map((s) => ({
            setNumber: s.setNumber,
            type: s.type,
            reps: s.reps,
            weight: progressedWeight > 0 ? progressedWeight : (s.weight ?? 0),
            completed: false as const,
          })),
          progressionApplied: shouldProgress && progressedWeight > 0,
          previousWeight: lastWeight > 0 ? lastWeight : null,
        };
      })
    );

    res.json({
      routineId: routine.id,
      name: routine.name,
      lastUsedAt: lastRoutineWorkout?.completedAt?.toISOString() ?? null,
      exercises,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка подготовки тренировки' });
  }
});

// Progression history for a routine — last N completed workouts started from this routine,
// with per-exercise max weight so client can render a trend chart
router.get('/routines/:id/history', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { id } = req.params as { id: string };
    const routine = await prisma.routine.findUnique({
      where: { id },
      select: { userId: true, exercises: { select: { exerciseId: true, exercise: { select: { id: true, name: true } } }, orderBy: { order: 'asc' } } },
    });
    if (!routine || routine.userId !== req.userId) return res.status(404).json({ error: 'Рутина не найдена' });

    const workouts = await prisma.workout.findMany({
      where: { routineId: id, userId: req.userId!, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        completedAt: true,
        durationMinutes: true,
        exercises: {
          select: {
            exerciseId: true,
            sets: { where: { completed: true, type: { not: 'warmup' } }, select: { weight: true, reps: true } },
          },
        },
      },
    });

    // For each workout, compute max weight per exercise
    const history = workouts.map((w) => ({
      id: w.id,
      completedAt: w.completedAt!.toISOString(),
      durationMinutes: w.durationMinutes,
      exercises: routine.exercises.map((re) => {
        const we = w.exercises.find((e) => e.exerciseId === re.exerciseId);
        const maxWeight = we && we.sets.length > 0
          ? Math.max(...we.sets.map((s) => s.weight ?? 0))
          : null;
        const totalReps = we ? we.sets.reduce((s, set) => s + (set.reps ?? 0), 0) : 0;
        return { exerciseId: re.exerciseId, name: re.exercise.name, maxWeight, totalReps };
      }),
    }));

    res.json({ routineId: id, history });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения истории рутины' });
  }
});

export { router as workoutRouter };
