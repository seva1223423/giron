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

  // Expanded gym achievements (post-r254)

  test('bench 100kg also unlocks bench_60 and bench_80 ladder', () => {
    const w = mockWorkout('w1', '2026-01-15T10:00:00Z', {
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
    const a = computeAchievements({ ...emptyData, workoutHistory: [w] });
    expect(a.find((x) => x.id === 'bench_60')?.unlocked).toBe(true);
    expect(a.find((x) => x.id === 'bench_80')?.unlocked).toBe(true);
    expect(a.find((x) => x.id === 'bench_140')?.unlocked).toBe(false);
  });

  test('streak 14 unlocks streak_3, streak_7, streak_14 but not streak_30', () => {
    const a = computeAchievements({ ...emptyData, currentStreak: 14 });
    expect(a.find((x) => x.id === 'streak_3')?.unlocked).toBe(true);
    expect(a.find((x) => x.id === 'streak_7')?.unlocked).toBe(true);
    expect(a.find((x) => x.id === 'streak_14')?.unlocked).toBe(true);
    expect(a.find((x) => x.id === 'streak_30')?.unlocked).toBe(false);
  });

  test('20 weekend workouts unlocks weekend_warrior', () => {
    // 2026-01-03 is Saturday; alternate Sat/Sun for 20 weekend days
    const workouts: Workout[] = [];
    let cursor = new Date('2026-01-03T10:00:00Z');
    for (let i = 0; i < 20; i++) {
      workouts.push(mockWorkout(`w${i}`, cursor.toISOString()));
      cursor = new Date(cursor.getTime() + (cursor.getUTCDay() === 6 ? 1 : 6) * 24 * 3600 * 1000);
    }
    const a = computeAchievements({ ...emptyData, workoutHistory: workouts });
    expect(a.find((x) => x.id === 'weekend_warrior')?.unlocked).toBe(true);
  });

  test('2-hour workout unlocks workout_2h but not workout_3h', () => {
    const w = mockWorkout('w1', '2026-01-15T10:00:00Z', { durationMinutes: 120 });
    const a = computeAchievements({ ...emptyData, workoutHistory: [w] });
    expect(a.find((x) => x.id === 'workout_2h')?.unlocked).toBe(true);
    expect(a.find((x) => x.id === 'workout_3h')?.unlocked).toBe(false);
  });

  test('5000kg single-workout volume unlocks single_workout_5k', () => {
    // 5 sets × 100 kg × 10 reps = 5000 kg
    const sets = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      setNumber: i + 1,
      type: 'normal' as const,
      weight: 100,
      reps: 10,
      completed: true,
    }));
    const w = mockWorkout('w1', '2026-01-15T10:00:00Z', {
      exercises: [
        {
          id: 'e1',
          exerciseId: 'bench-press',
          exercise: { id: 'bench-press', name: 'Bench Press' } as any,
          order: 0,
          sets,
          restSeconds: 90,
        },
      ],
    });
    const a = computeAchievements({ ...emptyData, workoutHistory: [w] });
    expect(a.find((x) => x.id === 'single_workout_5k')?.unlocked).toBe(true);
    expect(a.find((x) => x.id === 'single_workout_10k')?.unlocked).toBe(false);
  });

  test('500 completed sets unlocks sets_500', () => {
    // 50 workouts × 10 sets each = 500 completed sets
    const workouts = Array.from({ length: 50 }, (_, wi) =>
      mockWorkout(`w${wi}`, `2026-01-${String((wi % 28) + 1).padStart(2, '0')}T10:00:00Z`, {
        exercises: [
          {
            id: `e${wi}`,
            exerciseId: 'squat',
            exercise: { id: 'squat', name: 'Squat' } as any,
            order: 0,
            sets: Array.from({ length: 10 }, (_, si) => ({
              id: `s${wi}-${si}`,
              setNumber: si + 1,
              type: 'normal' as const,
              weight: 60,
              reps: 5,
              completed: true,
            })),
            restSeconds: 90,
          },
        ],
      }),
    );
    const a = computeAchievements({ ...emptyData, workoutHistory: workouts });
    expect(a.find((x) => x.id === 'sets_500')?.unlocked).toBe(true);
    expect(a.find((x) => x.id === 'sets_2000')?.unlocked).toBe(false);
  });

  test('big3_300 unlocks at moderate 1RM sum, big3_500 still locked', () => {
    // Bench 80×5 (1RM ≈ 93), Squat 100×5 (≈ 117), Deadlift 100×5 (≈ 117). Sum ≈ 327.
    const w = mockWorkout('w1', '2026-01-15T10:00:00Z', {
      exercises: [
        { id: 'e1', exerciseId: 'bench-press', exercise: { id: 'bench-press', name: 'B' } as any, order: 0, restSeconds: 90,
          sets: [{ id: 's1', setNumber: 1, type: 'normal' as const, weight: 80, reps: 5, completed: true }] },
        { id: 'e2', exerciseId: 'squat', exercise: { id: 'squat', name: 'S' } as any, order: 1, restSeconds: 90,
          sets: [{ id: 's2', setNumber: 1, type: 'normal' as const, weight: 100, reps: 5, completed: true }] },
        { id: 'e3', exerciseId: 'deadlift', exercise: { id: 'deadlift', name: 'D' } as any, order: 2, restSeconds: 90,
          sets: [{ id: 's3', setNumber: 1, type: 'normal' as const, weight: 100, reps: 5, completed: true }] },
      ],
    });
    const a = computeAchievements({ ...emptyData, workoutHistory: [w] });
    expect(a.find((x) => x.id === 'big3_300')?.unlocked).toBe(true);
    expect(a.find((x) => x.id === 'big3_500')?.unlocked).toBe(false);
  });

  test('every achievement has a unique id (no duplicates after expansion)', () => {
    const ids = ACHIEVEMENT_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('expansion grew the catalogue to 50+ achievements', () => {
    expect(ACHIEVEMENT_DEFINITIONS.length).toBeGreaterThanOrEqual(50);
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

// ─── R240 recovery / smartwatch achievements ──────────────────────────────────
// These read optional watch signals (sleepEntries, watchCardioCount,
// latestVo2Max). They must degrade gracefully to "locked, no crash" when no
// watch is paired (all fields undefined) and unlock on the documented
// thresholds. useAchievementCheck feeds these from the sleep store + health
// summary; the checks themselves are pinned here.
describe('recovery achievements', () => {
  const sleepEntry = (date: string, durationHours: number, quality?: number) => ({ date, durationHours, quality });

  test('all recovery achievements stay locked + do not crash with no watch data', () => {
    const achievements = computeAchievements(emptyData);
    const recovery = achievements.filter((a) => a.category === 'recovery');
    expect(recovery.length).toBe(6);
    recovery.forEach((a) => expect(a.unlocked).toBe(false));
  });

  test('sleep_7days_streak unlocks on 7 consecutive 7h+ nights, breaks on a short night', () => {
    const seven = Array.from({ length: 7 }, (_, i) => sleepEntry(`2026-02-0${i + 1}`, 7.5));
    const unlocked = computeAchievements({ ...emptyData, sleepEntries: seven })
      .find((a) => a.id === 'sleep_7days_streak');
    expect(unlocked?.unlocked).toBe(true);

    // A 6h night at the most-recent position breaks the streak (walk from today).
    const broken = [sleepEntry('2026-02-08', 6), ...seven];
    const brokenRes = computeAchievements({ ...emptyData, sleepEntries: broken })
      .find((a) => a.id === 'sleep_7days_streak');
    expect(brokenRes?.unlocked).toBe(false);
  });

  test('sleep_30nights counts total recorded nights', () => {
    const entries = Array.from({ length: 30 }, (_, i) => sleepEntry(`2026-03-${String(i + 1).padStart(2, '0')}`, 6));
    const res = computeAchievements({ ...emptyData, sleepEntries: entries })
      .find((a) => a.id === 'sleep_30nights');
    expect(res?.unlocked).toBe(true);
  });

  test('sleep_quality_avg4 needs ≥7 rated nights and avg ≥4', () => {
    const good = Array.from({ length: 10 }, (_, i) => sleepEntry(`2026-04-${String(i + 1).padStart(2, '0')}`, 8, 5));
    const goodRes = computeAchievements({ ...emptyData, sleepEntries: good })
      .find((a) => a.id === 'sleep_quality_avg4');
    expect(goodRes?.unlocked).toBe(true);

    // Only 5 rated nights → not enough data, stays locked.
    const sparse = Array.from({ length: 5 }, (_, i) => sleepEntry(`2026-04-${String(i + 1).padStart(2, '0')}`, 8, 5));
    const sparseRes = computeAchievements({ ...emptyData, sleepEntries: sparse })
      .find((a) => a.id === 'sleep_quality_avg4');
    expect(sparseRes?.unlocked).toBe(false);
  });

  test('watch_synced_first / watch_synced_10 unlock on watch cardio count', () => {
    const one = computeAchievements({ ...emptyData, watchCardioCount: 1 });
    expect(one.find((a) => a.id === 'watch_synced_first')?.unlocked).toBe(true);
    expect(one.find((a) => a.id === 'watch_synced_10')?.unlocked).toBe(false);

    const ten = computeAchievements({ ...emptyData, watchCardioCount: 10 });
    expect(ten.find((a) => a.id === 'watch_synced_10')?.unlocked).toBe(true);
  });

  test('vo2max_40 unlocks at 40+ and shows "нет данных" label when absent', () => {
    const fit = computeAchievements({ ...emptyData, latestVo2Max: 42 })
      .find((a) => a.id === 'vo2max_40');
    expect(fit?.unlocked).toBe(true);

    const none = computeAchievements({ ...emptyData, latestVo2Max: null })
      .find((a) => a.id === 'vo2max_40');
    expect(none?.unlocked).toBe(false);
    expect(none?.progressLabel).toBe('нет данных');
  });
});
