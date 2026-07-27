/**
 * Primary chat-context fetch — the 16-query Promise.all that loads
 * every piece of user state the /chat handler needs before calling
 * the LLM.
 *
 * Originally inline at routes/ai.ts L5729-5859. Extracted 2026-05-22
 * (audit step 1 of the /chat split) so this block can be:
 *   - unit-tested with a mocked Prisma
 *   - profiled in isolation
 *   - reused by future endpoints (analyze-progress, weekly-summary)
 *     without copy-pasting the query list
 *
 * Semantics are byte-identical to the inline original. The user-row
 * caching (aiUserContextCache, 60s TTL) is preserved — cache hits
 * skip the heaviest single payload (user + healthRestrictions JOIN).
 *
 * What's NOT inside this function (kept in /chat route):
 *   - Rate-limit / subscription gating (must happen BEFORE this fetch)
 *   - SSE header setup (depends on route-only `res`)
 *   - Anything downstream of context (LLM call, persistence, streaming)
 *
 * The function is intentionally pure-ish: it reads from Prisma + the
 * cache, writes to the cache on miss, returns plain data. No `req`,
 * no `res`, no closures over the route.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { aiUserContextCache, AI_USER_CONTEXT_TTL_MS } from '../utils/memCache';

/** Typed shape of the cached/fresh user payload — same as what
 *  `prisma.user.findUnique({ include: { healthRestrictions: true } })`
 *  returns. Pinned via Prisma.UserGetPayload so a schema bump that drops
 *  a field surfaces here as a tsc error. */
export type CachedAiUser = Prisma.UserGetPayload<{ include: { healthRestrictions: true } }>;

/** Per-day sleep entry shape — matches what the existing inline code
 *  uses (client may supply, falling back to DB). */
export interface SleepEntryLite {
  date: string;
  durationHours: number;
  /** Optional — old client payloads omit this field. */
  quality?: number | null;
}

export interface PrimaryChatContextInput {
  userId: string;
  /** YYYY-MM-DD string used by the Meal date filter. Same value as the
   *  /chat handler's `todayDate` local. */
  todayDate: string;
  /** Exercise IDs from the request body's weekPlan, pre-filtered to look
   *  like CUIDs. Empty array short-circuits the exercise lookup. */
  allWeekPlanExerciseIds: string[];
  /** Optional client-supplied sleep entries. If non-empty, the DB sleep
   *  query is skipped (saves one round-trip). */
  sleepEntries?: SleepEntryLite[] | null;
}

/** Precise payload types for queries with `include` — using the bare
 *  `Awaited<ReturnType<typeof prisma.X.findMany>>` loses the include
 *  shape (TS doesn't infer it from the `findMany` call site at the
 *  type-system level). Pinning via `Prisma.XGetPayload<{include}>` keeps
 *  the join columns visible to downstream consumers. */
export type ActiveProgramPayload = Prisma.ProgramGetPayload<{
  include: { workouts: { include: { exercises: { include: { exercise: true; sets: true } } } } };
}> | null;
export type RecentWorkoutPayload = Prisma.WorkoutGetPayload<{
  include: { exercises: { include: { exercise: true; sets: true } } };
}>;
export type WeekWorkoutPayload = Prisma.WorkoutGetPayload<{
  include: { exercises: { include: { sets: true } } };
}>;
export type TodayMealPayload = Prisma.MealGetPayload<{ include: { items: true } }>;

export interface PrimaryChatContextResult {
  user: CachedAiUser | null;
  history: Awaited<ReturnType<typeof prisma.chatMessage.findMany>>;
  activeProgram: ActiveProgramPayload;
  recentWorkouts: RecentWorkoutPayload[];
  bodyWeightHistory: Awaited<ReturnType<typeof prisma.bodyWeight.findMany>>;
  allCompletedExerciseSets: Array<{
    exerciseId: string;
    exercise: { name: string };
    workout: { completedAt: Date | null };
    sets: Array<{ weight: number | null; reps: number | null; type: string }>;
  }>;
  todayMeals: TodayMealPayload[];
  recentMeasurements: Awaited<ReturnType<typeof prisma.bodyMeasurement.findMany>>;
  userPrograms: Array<{
    id: string;
    name: string;
    isActive: boolean;
    type: string;
    daysPerWeek: number;
    createdBy: string | null;
  }>;
  sleepFromDb: SleepEntryLite[];
  totalWorkoutsEver: number;
  firstWorkout: { completedAt: Date | null } | null;
  weekPlanExercisesRaw: Array<{ id: string; name: string }>;
  weekWorkouts: WeekWorkoutPayload[];
  prevWeekWorkouts: WeekWorkoutPayload[];
  weekMeals: Awaited<ReturnType<typeof prisma.meal.findMany>>;
  /** Whether the user payload came from cache (no DB hit for it). */
  userFromCache: boolean;
  /** Total wall-clock ms the Promise.all took. Useful for /admin
   *  perf dashboards and slow-query warnings. */
  durationMs: number;
}

const SLOW_FETCH_WARN_THRESHOLD_MS = 2000;

/** One-shot fetch for everything `/chat` reads up-front. Mirrors the
 *  inline 16-query Promise.all that used to live in routes/ai.ts. */
export async function fetchPrimaryChatContext(
  input: PrimaryChatContextInput,
): Promise<PrimaryChatContextResult> {
  const { userId, todayDate, allWeekPlanExerciseIds, sleepEntries } = input;
  const t0 = Date.now();

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const cachedUser = aiUserContextCache.get(userId) as CachedAiUser | undefined;
  const userFetch: Promise<CachedAiUser | null> = cachedUser
    ? Promise.resolve(cachedUser)
    : prisma.user.findUnique({
        where: { id: userId },
        include: { healthRestrictions: true },
      });

  const [
    user,
    history,
    activeProgram,
    recentWorkouts,
    bodyWeightHistory,
    allCompletedExerciseSets,
    todayMeals,
    recentMeasurements,
    userPrograms,
    sleepFromDb,
    totalWorkoutsEver,
    firstWorkout,
    weekPlanExercisesRaw,
    weekWorkouts,
    prevWeekWorkouts,
    weekMeals,
  ] = await Promise.all([
    userFetch,
    prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.program.findFirst({
      where: { userId, isActive: true },
      include: {
        // Day templates only. Completed sessions also carry the active
        // program's id, so this used to hand the model the whole training
        // history disguised as "your program" — duplicating the recent-workout
        // block fetched right below and inflating the prompt (audit R26).
        workouts: {
          where: { completedAt: null },
          orderBy: { createdAt: 'asc' },
          take: 50,
          include: { exercises: { include: { exercise: true, sets: true } } },
        },
      },
    }),
    prisma.workout.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 5,
      include: { exercises: { include: { exercise: true, sets: true } } },
    }),
    prisma.bodyWeight.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 10,
    }),
    prisma.workoutExercise.findMany({
      where: { workout: { userId, completedAt: { not: null } } },
      select: {
        exerciseId: true,
        exercise: { select: { name: true } },
        workout: { select: { completedAt: true } },
        sets: {
          where: { completed: true },
          select: { weight: true, reps: true, type: true },
        },
      },
      orderBy: { workout: { completedAt: 'desc' } },
      take: 1000,
    }),
    prisma.meal.findMany({
      where: { userId, date: todayDate },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    prisma.bodyMeasurement.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 3,
    }),
    prisma.program.findMany({
      where: { userId },
      select: { id: true, name: true, isActive: true, type: true, daysPerWeek: true, createdBy: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    // Sleep: skip DB query if client already sent entries (avoids redundant fetch)
    (sleepEntries && sleepEntries.length > 0)
      ? Promise.resolve([] as SleepEntryLite[])
      : prisma.sleepEntry.findMany({
          where: { userId },
          orderBy: { date: 'desc' },
          take: 14,
          select: { date: true, durationHours: true, quality: true },
        }),
    prisma.workout.count({ where: { userId, completedAt: { not: null } } }),
    prisma.workout.findFirst({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: 'asc' },
      select: { completedAt: true },
    }),
    allWeekPlanExerciseIds.length > 0
      ? prisma.exercise.findMany({ where: { id: { in: allWeekPlanExerciseIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    prisma.workout.findMany({
      where: { userId, completedAt: { gte: oneWeekAgo } },
      include: { exercises: { include: { sets: true } } },
      take: 50,
    }),
    prisma.workout.findMany({
      where: { userId, completedAt: { gte: twoWeeksAgo, lt: oneWeekAgo } },
      include: { exercises: { include: { sets: true } } },
      take: 50,
    }),
    prisma.meal.findMany({
      where: { userId, createdAt: { gte: oneWeekAgo } },
      take: 200,
    }),
  ]);

  const durationMs = Date.now() - t0;
  if (durationMs > SLOW_FETCH_WARN_THRESHOLD_MS) {
    logger.warn(`[AI] Primary context fetch slow: ${durationMs}ms (userId: ${userId})`);
  }

  // Cache fresh user on cache miss; never re-set on hit (would reset TTL
  // and the entry would never expire).
  if (!cachedUser && user) {
    aiUserContextCache.set(userId, user, AI_USER_CONTEXT_TTL_MS);
  }

  return {
    user,
    history,
    activeProgram,
    recentWorkouts,
    bodyWeightHistory,
    allCompletedExerciseSets,
    todayMeals,
    recentMeasurements,
    userPrograms,
    sleepFromDb,
    totalWorkoutsEver,
    firstWorkout,
    weekPlanExercisesRaw,
    weekWorkouts,
    prevWeekWorkouts,
    weekMeals,
    userFromCache: Boolean(cachedUser),
    durationMs,
  };
}
