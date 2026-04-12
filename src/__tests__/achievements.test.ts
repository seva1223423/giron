import { computeAchievements, getNewlyUnlocked, ACHIEVEMENT_DEFINITIONS } from '../utils/achievements';
import { Workout } from '../types';

const mockWorkout = (id: string, completedAt: string, overrides: Partial<Workout> = {}): Workout => ({
  id,
  name: 'Test Workout',
  completedAt,
  startedAt: completedAt,
  exercises: [],
  durationMinutes: 45,
  totalVolume: 1000,
  ...overrides,
});

const emptyData = {
  workoutHistory: [] as Workout[],
  nutritionDaysLogged: 0,
  currentStreak: 0,
};

describe('computeAchievements', () => {
  test('with empty data returns all achievements as not unlocked', () => {
    const achievements = computeAchievements(emptyData);
    expect(achievements).toHaveLength(ACHIEVEMENT_DEFINITIONS.length);
    achievements.forEach((a) => {
      expect(a.unlocked).toBe(false);
    });
  });

  test('with 1 workout unlocks first_workout', () => {
    const achievements = computeAchievements({
      ...emptyData,
      workoutHistory: [mockWorkout('w1', '2026-01-15T10:00:00Z')],
    });
    const firstWorkout = achievements.find((a) => a.id === 'first_workout');
    expect(firstWorkout?.unlocked).toBe(true);
    expect(firstWorkout?.progress).toBe(1);
  });

  test('with 5 workouts unlocks workouts_5', () => {
    const workouts = Array.from({ length: 5 }, (_, i) =>
      mockWorkout(`w${i}`, `2026-01-${15 + i}T10:00:00Z`),
    );
    const achievements = computeAchievements({
      ...emptyData,
      workoutHistory: workouts,
    });
    const w5 = achievements.find((a) => a.id === 'workouts_5');
    expect(w5?.unlocked).toBe(true);
  });

  test('with 25 workouts unlocks workouts_25', () => {
    const workouts = Array.from({ length: 25 }, (_, i) =>
      mockWorkout(`w${i}`, `2026-01-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z`),
    );
    const achievements = computeAchievements({
      ...emptyData,
      workoutHistory: workouts,
    });
    const w25 = achievements.find((a) => a.id === 'workouts_25');
    expect(w25?.unlocked).toBe(true);
  });

  test('streak 7 unlocks streak_7', () => {
    const achievements = computeAchievements({
      ...emptyData,
      currentStreak: 7,
    });
    const streak7 = achievements.find((a) => a.id === 'streak_7');
    expect(streak7?.unlocked).toBe(true);
    expect(streak7?.progress).toBe(1);
  });

  test('streak 5 does not unlock streak_7 but shows progress', () => {
    const achievements = computeAchievements({
      ...emptyData,
      currentStreak: 5,
    });
    const streak7 = achievements.find((a) => a.id === 'streak_7');
    expect(streak7?.unlocked).toBe(false);
    expect(streak7?.progress).toBeCloseTo(5 / 7);
  });

  test('streak 30 unlocks streak_30', () => {
    const achievements = computeAchievements({
      ...emptyData,
      currentStreak: 30,
    });
    const streak30 = achievements.find((a) => a.id === 'streak_30');
    expect(streak30?.unlocked).toBe(true);
  });

  test('nutrition 7 days unlocks nutrition_7', () => {
    const achievements = computeAchievements({
      ...emptyData,
      nutritionDaysLogged: 7,
    });
    const nutr = achievements.find((a) => a.id === 'nutrition_7');
    expect(nutr?.unlocked).toBe(true);
  });

  test('bench 100kg unlocks bench_100', () => {
    const workout = mockWorkout('w1', '2026-01-15T10:00:00Z', {
      exercises: [
        {
          id: 'e1',
          exerciseId: 'bench-press',
          exercise: { id: 'bench-press', name: 'Bench Press' } as any,
          order: 0,
          sets: [{ id: 's1', setNumber: 1, type: 'normal' as const, weight: 100, reps: 5, completed: true }],
          restSeconds: 120,
        },
      ],
    });
    const achievements = computeAchievements({
      ...emptyData,
      workoutHistory: [workout],
    });
    const bench = achievements.find((a) => a.id === 'bench_100');
    expect(bench?.unlocked).toBe(true);
  });
});

describe('getNewlyUnlocked', () => {
  test('identifies new unlocks vs already-unlocked', () => {
    const current = computeAchievements({
      ...emptyData,
      workoutHistory: [mockWorkout('w1', '2026-01-15T10:00:00Z')],
    });
    // Previously nothing was unlocked
    const newlyUnlocked = getNewlyUnlocked([], current);
    const newIds = newlyUnlocked.map((a) => a.id);
    expect(newIds).toContain('first_workout');
  });

  test('returns empty when all were previously unlocked', () => {
    const current = computeAchievements({
      ...emptyData,
      workoutHistory: [mockWorkout('w1', '2026-01-15T10:00:00Z')],
    });
    const unlockedIds = current.filter((a) => a.unlocked).map((a) => a.id);
    const newlyUnlocked = getNewlyUnlocked(unlockedIds, current);
    expect(newlyUnlocked).toHaveLength(0);
  });

  test('returns only the delta between prev and current', () => {
    const workouts5 = Array.from({ length: 5 }, (_, i) =>
      mockWorkout(`w${i}`, `2026-01-${15 + i}T10:00:00Z`),
    );
    const current = computeAchievements({
      ...emptyData,
      workoutHistory: workouts5,
    });
    // Assume first_workout was already unlocked
    const prev = ['first_workout'];
    const newlyUnlocked = getNewlyUnlocked(prev, current);
    const newIds = newlyUnlocked.map((a) => a.id);
    expect(newIds).not.toContain('first_workout');
    expect(newIds).toContain('workouts_5');
  });
});
