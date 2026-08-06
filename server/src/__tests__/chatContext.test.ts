/**
 * Tests for ai/chatContext.fetchPrimaryChatContext — the 16-query
 * Promise.all that loads everything `/chat` reads before calling the
 * LLM.
 *
 * Verifies:
 *   1. Cache miss: prisma.user.findUnique is called; result is cached.
 *   2. Cache hit: prisma.user.findUnique is NOT called; cached value returned.
 *   3. Cache hit doesn't reset TTL (post-fetch set() is skipped).
 *   4. Sleep skip: when sleepEntries provided, prisma.sleepEntry.findMany
 *      is NOT called.
 *   5. Empty week-plan IDs short-circuit the exercise lookup.
 *   6. Returns userFromCache flag + durationMs.
 *   7. All 16 queries are surfaced in the return object.
 */

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock prisma BEFORE importing the module under test so the module
// captures the mocked instance.
const mockUser = { findUnique: jest.fn() };
const mockChatMessage = { findMany: jest.fn() };
const mockProgram = { findFirst: jest.fn(), findMany: jest.fn() };
const mockWorkout = { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() };
const mockBodyWeight = { findMany: jest.fn() };
const mockWorkoutExercise = { findMany: jest.fn() };
const mockMeal = { findMany: jest.fn() };
const mockBodyMeasurement = { findMany: jest.fn() };
const mockSleepEntry = { findMany: jest.fn() };
const mockCardioSession = { findMany: jest.fn() };
const mockExercise = { findMany: jest.fn() };

jest.mock('../db', () => ({
  prisma: {
    user: mockUser,
    chatMessage: mockChatMessage,
    program: mockProgram,
    workout: mockWorkout,
    bodyWeight: mockBodyWeight,
    workoutExercise: mockWorkoutExercise,
    meal: mockMeal,
    bodyMeasurement: mockBodyMeasurement,
    sleepEntry: mockSleepEntry,
    cardioSession: mockCardioSession,
    exercise: mockExercise,
  },
}));

import { fetchPrimaryChatContext } from '../ai/chatContext';
import { aiUserContextCache } from '../utils/memCache';

function resetAllMocks() {
  for (const m of [
    mockUser.findUnique,
    mockChatMessage.findMany,
    mockProgram.findFirst,
    mockProgram.findMany,
    mockWorkout.findMany,
    mockWorkout.count,
    mockWorkout.findFirst,
    mockBodyWeight.findMany,
    mockWorkoutExercise.findMany,
    mockMeal.findMany,
    mockBodyMeasurement.findMany,
    mockSleepEntry.findMany,
    mockCardioSession.findMany,
    mockExercise.findMany,
  ]) {
    m.mockReset();
  }
  // Default: every mock returns an empty-ish result, so the Promise.all
  // resolves without throwing in tests that don't care about a specific
  // query.
  mockUser.findUnique.mockResolvedValue({ id: 'u1', firstName: 'Test', healthRestrictions: [] });
  mockChatMessage.findMany.mockResolvedValue([]);
  mockProgram.findFirst.mockResolvedValue(null);
  mockProgram.findMany.mockResolvedValue([]);
  mockWorkout.findMany.mockResolvedValue([]);
  mockWorkout.count.mockResolvedValue(0);
  mockWorkout.findFirst.mockResolvedValue(null);
  mockBodyWeight.findMany.mockResolvedValue([]);
  mockWorkoutExercise.findMany.mockResolvedValue([]);
  mockMeal.findMany.mockResolvedValue([]);
  mockBodyMeasurement.findMany.mockResolvedValue([]);
  mockSleepEntry.findMany.mockResolvedValue([]);
  mockCardioSession.findMany.mockResolvedValue([]);
  mockExercise.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  resetAllMocks();
  aiUserContextCache.clear();
});

describe('fetchPrimaryChatContext — user cache behaviour', () => {
  test('cache miss: queries user + writes to cache + reports userFromCache=false', async () => {
    const result = await fetchPrimaryChatContext({
      userId: 'u1',
      todayDate: '2026-05-22',
      allWeekPlanExerciseIds: [],
    });

    expect(mockUser.findUnique).toHaveBeenCalledTimes(1);
    expect(result.userFromCache).toBe(false);
    expect(result.user).not.toBeNull();
    expect(aiUserContextCache.get('u1')).toEqual(result.user);
  });

  test('cache hit: skips user query + reports userFromCache=true', async () => {
    aiUserContextCache.set('u1', { id: 'u1', firstName: 'Cached', healthRestrictions: [] }, 60_000);

    const result = await fetchPrimaryChatContext({
      userId: 'u1',
      todayDate: '2026-05-22',
      allWeekPlanExerciseIds: [],
    });

    expect(mockUser.findUnique).not.toHaveBeenCalled();
    expect(result.userFromCache).toBe(true);
    expect((result.user as { firstName: string }).firstName).toBe('Cached');
  });

  test('cache hit does NOT re-set the cache (TTL preserved)', async () => {
    // Pre-populate with a tiny TTL so we can verify it's the SAME entry
    // afterwards — if the post-fetch code re-set it, the TTL would
    // refresh and this test would see a younger entry.
    const pre = { id: 'u1', firstName: 'Pre', healthRestrictions: [] };
    aiUserContextCache.set('u1', pre, 60_000);
    const setSpy = jest.spyOn(aiUserContextCache, 'set');

    await fetchPrimaryChatContext({
      userId: 'u1',
      todayDate: '2026-05-22',
      allWeekPlanExerciseIds: [],
    });

    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });
});

describe('fetchPrimaryChatContext — short-circuit branches', () => {
  test('non-empty sleepEntries skips the sleepEntry DB query', async () => {
    const result = await fetchPrimaryChatContext({
      userId: 'u1',
      todayDate: '2026-05-22',
      allWeekPlanExerciseIds: [],
      sleepEntries: [{ date: '2026-05-21', durationHours: 8, quality: 9 }],
    });

    expect(mockSleepEntry.findMany).not.toHaveBeenCalled();
    expect(result.sleepFromDb).toEqual([]);
  });

  test('empty sleepEntries → DB sleepEntry query runs', async () => {
    await fetchPrimaryChatContext({
      userId: 'u1',
      todayDate: '2026-05-22',
      allWeekPlanExerciseIds: [],
      sleepEntries: [],
    });

    expect(mockSleepEntry.findMany).toHaveBeenCalledTimes(1);
  });

  test('empty allWeekPlanExerciseIds skips the exercise lookup query', async () => {
    await fetchPrimaryChatContext({
      userId: 'u1',
      todayDate: '2026-05-22',
      allWeekPlanExerciseIds: [],
    });

    expect(mockExercise.findMany).not.toHaveBeenCalled();
  });

  test('non-empty allWeekPlanExerciseIds → exercise lookup runs', async () => {
    await fetchPrimaryChatContext({
      userId: 'u1',
      todayDate: '2026-05-22',
      allWeekPlanExerciseIds: ['ex123abcdef0123456789'],
    });

    expect(mockExercise.findMany).toHaveBeenCalledTimes(1);
    const call = mockExercise.findMany.mock.calls[0][0];
    expect(call.where.id.in).toEqual(['ex123abcdef0123456789']);
  });
});

describe('fetchPrimaryChatContext — return shape', () => {
  test('returns all 18 named fields + cache flag + durationMs', async () => {
    const result = await fetchPrimaryChatContext({
      userId: 'u1',
      todayDate: '2026-05-22',
      allWeekPlanExerciseIds: [],
    });

    const expectedKeys = [
      'user',
      'history',
      'activeProgram',
      'recentWorkouts',
      'liveWorkout',
      'bodyWeightHistory',
      'allCompletedExerciseSets',
      'todayMeals',
      'recentMeasurements',
      'userPrograms',
      'sleepFromDb',
      'recentCardio',
      'totalWorkoutsEver',
      'firstWorkout',
      'weekPlanExercisesRaw',
      'weekWorkouts',
      'prevWeekWorkouts',
      'weekMeals',
      'userFromCache',
      'durationMs',
    ];
    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
  });

  test('durationMs is a non-negative number', async () => {
    const result = await fetchPrimaryChatContext({
      userId: 'u1',
      todayDate: '2026-05-22',
      allWeekPlanExerciseIds: [],
    });
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('fetchPrimaryChatContext — query parameter pass-through', () => {
  test('today\'s meals query uses the provided todayDate', async () => {
    await fetchPrimaryChatContext({
      userId: 'u1',
      todayDate: '2026-05-22',
      allWeekPlanExerciseIds: [],
    });

    const todayMealsCall = mockMeal.findMany.mock.calls.find(
      (c: unknown[]) => (c[0] as { where?: { date?: string } }).where?.date === '2026-05-22',
    );
    expect(todayMealsCall).toBeDefined();
  });

  test('weekWorkouts window is gte (now - 7d)', async () => {
    const t0 = Date.now();
    await fetchPrimaryChatContext({
      userId: 'u1',
      todayDate: '2026-05-22',
      allWeekPlanExerciseIds: [],
    });
    // Find the call that has completedAt: { gte: ... } only (no lt → week)
    const weekCall = mockWorkout.findMany.mock.calls.find((c: unknown[]) => {
      const where = (c[0] as { where: { completedAt?: { gte?: Date; lt?: Date } } }).where;
      return where.completedAt?.gte && !where.completedAt.lt;
    });
    expect(weekCall).toBeDefined();
    const gte = (weekCall![0] as { where: { completedAt: { gte: Date } } }).where.completedAt.gte;
    // Should be roughly 7 days ago. The tolerance is wall-clock slack between
    // capturing t0 and the code computing its own window — on a loaded machine
    // that gap easily exceeds 100ms, which used to fail the build for no
    // reason (audit R45). 30s still pins "7 days, not 6 or 8".
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const SLACK_MS = 30_000;
    expect(gte.getTime()).toBeGreaterThan(t0 - sevenDaysMs - SLACK_MS);
    expect(gte.getTime()).toBeLessThan(t0 - sevenDaysMs + SLACK_MS);
  });
});
