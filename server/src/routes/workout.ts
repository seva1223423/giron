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
  name: z.string().min(1).max(200),
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
  try {
    const parsed = syncWorkoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
    const { clientId, name, exercises, completedAt, startedAt, durationMinutes, totalVolume, notes } = parsed.data;

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
    // P2002 = unique constraint violation — clientId already taken globally (another user's workout)
    if (e?.code === 'P2002' && e?.meta?.target?.includes?.('clientId')) {
      return res.status(409).json({ error: 'Тренировка с данным clientId уже существует' });
    }
    // P2003 = foreign key constraint — one of the exerciseIds does not exist
    if (e?.code === 'P2003') {
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
    const durationMinutes = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 60000) : 0;

    // Atomic guard: only update if not yet completed (prevents double-completion race)
    const completionResult = await prisma.workout.updateMany({
      where: { id, userId: req.userId!, completedAt: null },
      data: { completedAt: new Date(), durationMinutes, totalVolume },
    });
    if (completionResult.count === 0) {
      return res.status(409).json({ error: 'Тренировка уже завершена' });
    }

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
    const offset = Math.max(parseInt(rawOffset as string, 10) || 0, 0);

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
            include: { exercise: true, sets: true },
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
    const exercises = await prisma.exercise.findMany({ orderBy: { name: 'asc' }, take: 500 });
    exercisesCache.set('exercises', exercises, 60 * 60 * 1000);
    res.setHeader('X-Cache', 'MISS');
    res.json(exercises);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения упражнений' });
  }
});

export { router as workoutRouter };
