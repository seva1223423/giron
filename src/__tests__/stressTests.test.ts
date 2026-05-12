/**
 * Stress tests and edge cases for giron stores and utilities.
 * Covers rapid bulk operations, boundary conditions, and concurrent usage patterns.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services', () => ({
  workoutService: {
    completeWorkout: jest.fn(() => Promise.resolve()),
    syncWorkout: jest.fn(() => Promise.resolve()),
    autosaveWorkout: jest.fn(() => Promise.resolve()),
    getHistory: jest.fn(() => Promise.resolve({ workouts: [], total: 0 })),
    getPrograms: jest.fn(() => Promise.resolve([])),
  },
  nutritionService: {
    addMeal: jest.fn(() => Promise.resolve({})),
    getMealsByDate: jest.fn(() => Promise.resolve([])),
    updateMeal: jest.fn(() => Promise.resolve({})),
    deleteMeal: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../services/userService', () => ({
  userService: {
    saveWeekPlan: jest.fn(() => Promise.resolve()),
    getWeekPlan: jest.fn(() => Promise.resolve({})),
    saveSleep: jest.fn(() => Promise.resolve()),
    deleteSleep: jest.fn(() => Promise.resolve()),
    getSleep: jest.fn(() => Promise.resolve([])),
  },
}));

import { useWorkoutStore } from '../store/useWorkoutStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { useSleepStore } from '../store/useSleepStore';
import { getMonday, formatNum } from '../utils/date';

const mockExercise = {
  id: 'ex-1',
  name: 'Bench Press',
  primaryMuscles: ['chest'] as any,
  secondaryMuscles: ['triceps'] as any,
  type: 'barbell' as const,
  category: 'strength' as const,
  difficulty: 'intermediate' as const,
  description: '',
  instructions: [],
};

beforeEach(() => {
  useWorkoutStore.setState({
    activeWorkout: null,
    workoutHistory: [],
    programs: [],
    weekPlan: {},
    savedTemplates: [],
    customExercises: [],
  });
  useNutritionStore.setState({
    dailyLog: {},
    defaultTargets: { calories: 2500, protein: 150, fats: 80, carbs: 300, waterTargetMl: 2500 },
    savedFoods: [],
  });
  useSleepStore.setState({ entries: [] });
});

// ==================== 1. RAPID ACTION STRESS TESTS ====================

describe('rapid action stress tests', () => {
  test('completing 100 sets rapidly does not lose data', () => {
    const sets = Array.from({ length: 100 }, (_, i) => ({
      id: `s-${i}`,
      setNumber: i + 1,
      type: 'normal' as const,
      reps: 0,
      weight: 0,
      completed: false,
    }));

    useWorkoutStore.getState().startWorkout({
      id: 'stress-1',
      name: 'Stress Test',
      exercises: [{
        id: 'we-1',
        exerciseId: 'ex-1',
        exercise: mockExercise,
        order: 0,
        sets,
        restSeconds: 0,
      }],
    });

    for (let i = 0; i < 100; i++) {
      useWorkoutStore.getState().completeSet(0, i, { reps: 10, weight: 50 + i });
    }

    const allSets = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets;
    const completed = allSets.filter((s) => s.completed);
    expect(completed.length).toBe(100);

    // Verify data integrity: each set has the correct weight
    for (let i = 0; i < 100; i++) {
      expect(allSets[i].weight).toBe(50 + i);
      expect(allSets[i].reps).toBe(10);
    }
  });

  test('adding water 50 times accumulates correctly', () => {
    for (let i = 0; i < 50; i++) {
      useNutritionStore.getState().addWater('2026-04-08', 100);
    }
    expect(useNutritionStore.getState().getDayLog('2026-04-08').waterMl).toBe(5000);
  });

  test('adding 365 sleep entries (one per day) works', () => {
    for (let i = 0; i < 365; i++) {
      const d = new Date(2026, 0, 1 + i);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      useSleepStore.getState().addEntry({ date, bedtime: '23:00', wakeTime: '07:00' });
    }
    expect(useSleepStore.getState().entries.length).toBe(365);
    expect(useSleepStore.getState().getLastEntries(7).length).toBe(7);
    expect(useSleepStore.getState().getAverageDuration(30)).toBe(8);
  });

  test('rapidly adding and removing sets 50 times keeps state consistent', () => {
    useWorkoutStore.getState().startWorkout({
      id: 'stress-2',
      name: 'Add/Remove Stress',
      exercises: [{
        id: 'we-1',
        exerciseId: 'ex-1',
        exercise: mockExercise,
        order: 0,
        sets: [{ id: 's-0', setNumber: 1, type: 'normal' as const, reps: 10, weight: 60, completed: false }],
        restSeconds: 0,
      }],
    });

    for (let i = 0; i < 50; i++) {
      useWorkoutStore.getState().addSet(0);
    }
    expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets.length).toBe(51);

    for (let i = 0; i < 50; i++) {
      useWorkoutStore.getState().removeSet(0, 1); // always remove the second set
    }
    expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets.length).toBe(1);
  });

  test('finishing workout with 100 completed sets calculates correct volume', () => {
    const sets = Array.from({ length: 100 }, (_, i) => ({
      id: `s-${i}`,
      setNumber: i + 1,
      type: 'normal' as const,
      reps: 10,
      weight: 100,
      completed: true,
    }));

    useWorkoutStore.getState().startWorkout({
      id: 'stress-3',
      name: 'Volume Stress',
      exercises: [{
        id: 'we-1',
        exerciseId: 'ex-1',
        exercise: mockExercise,
        order: 0,
        sets,
        restSeconds: 0,
      }],
    });

    const result = useWorkoutStore.getState().finishWorkout();
    // 100 sets x 10 reps x 100 kg = 100,000
    expect(result!.totalVolume).toBe(100000);
  });
});

// ==================== 2. EDGE CASES ====================

describe('edge cases', () => {
  test('empty workout finishes with 0 volume', () => {
    useWorkoutStore.getState().startWorkout({
      id: 'empty-1',
      name: 'Empty',
      exercises: [{
        id: 'we-1',
        exerciseId: 'ex-1',
        exercise: mockExercise,
        order: 0,
        sets: [],
        restSeconds: 0,
      }],
    });
    const result = useWorkoutStore.getState().finishWorkout();
    expect(result!.totalVolume).toBe(0);
  });

  test('workout with all warmup sets calculates correct volume', () => {
    useWorkoutStore.getState().startWorkout({
      id: 'warmup-1',
      name: 'Warmup Only',
      exercises: [{
        id: 'we-1',
        exerciseId: 'ex-1',
        exercise: mockExercise,
        order: 0,
        sets: [
          { id: 's-1', setNumber: 1, type: 'warmup' as const, reps: 10, weight: 20, completed: true },
          { id: 's-2', setNumber: 2, type: 'warmup' as const, reps: 10, weight: 30, completed: true },
        ],
        restSeconds: 0,
      }],
    });
    const result = useWorkoutStore.getState().finishWorkout();
    // Warmup sets excluded from volume — result is 0
    expect(result!.totalVolume).toBe(0);
  });

  test('workout with no exercises finishes cleanly', () => {
    useWorkoutStore.getState().startWorkout({
      id: 'no-ex-1',
      name: 'No Exercises',
      exercises: [],
    });
    const result = useWorkoutStore.getState().finishWorkout();
    expect(result).not.toBeNull();
    expect(result!.totalVolume).toBe(0);
    expect(result!.exercises).toHaveLength(0);
  });

  test('workout with uncompleted sets has 0 volume', () => {
    useWorkoutStore.getState().startWorkout({
      id: 'uncomp-1',
      name: 'Uncompleted',
      exercises: [{
        id: 'we-1',
        exerciseId: 'ex-1',
        exercise: mockExercise,
        order: 0,
        sets: [
          { id: 's-1', setNumber: 1, type: 'normal' as const, reps: 10, weight: 100, completed: false },
          { id: 's-2', setNumber: 2, type: 'normal' as const, reps: 8, weight: 100, completed: false },
        ],
        restSeconds: 0,
      }],
    });
    const result = useWorkoutStore.getState().finishWorkout();
    expect(result!.totalVolume).toBe(0);
  });

  test('completing set with 0 weight and 0 reps', () => {
    useWorkoutStore.getState().startWorkout({
      id: 'zero-1',
      name: 'Zero',
      exercises: [{
        id: 'we-1',
        exerciseId: 'ex-1',
        exercise: mockExercise,
        order: 0,
        sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 0, weight: 0, completed: false }],
        restSeconds: 0,
      }],
    });
    useWorkoutStore.getState().completeSet(0, 0, { reps: 0, weight: 0 });
    const set = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0];
    expect(set.completed).toBe(true);
    // No PR flagged for 0 weight/reps
    expect(set.isPR).toBeUndefined();
  });

  test('nutrition for date with only water shows correct', () => {
    useNutritionStore.getState().addWater('2026-04-08', 1000);
    const log = useNutritionStore.getState().getDayLog('2026-04-08');
    expect(log.meals.length).toBe(0);
    expect(log.waterMl).toBe(1000);
  });

  test('getDayLog for unknown date returns defaults', () => {
    const log = useNutritionStore.getState().getDayLog('2099-12-31');
    expect(log.meals).toEqual([]);
    expect(log.waterMl).toBe(0);
    expect(log.targetCalories).toBe(2500);
  });

  test('sleep entry at midnight boundary', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '00:00', wakeTime: '08:00' });
    expect(useSleepStore.getState().entries[0].durationHours).toBe(8);
  });

  test('sleep entry bedtime=wakeTime gives 24h', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '12:00', wakeTime: '12:00' });
    expect(useSleepStore.getState().entries[0].durationHours).toBe(24);
  });

  test('sleep entry overnight (23:00 to 07:00)', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
    expect(useSleepStore.getState().entries[0].durationHours).toBe(8);
  });

  test('sleep entry very short nap (14:00 to 14:30)', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '14:00', wakeTime: '14:30' });
    expect(useSleepStore.getState().entries[0].durationHours).toBe(0.5);
  });

  test('sleep getAverageDuration with 0 entries returns 0', () => {
    expect(useSleepStore.getState().getAverageDuration(30)).toBe(0);
  });

  test('sleep getLastEntries with 0 entries returns empty', () => {
    expect(useSleepStore.getState().getLastEntries(10)).toEqual([]);
  });

  test('sleep addEntry replaces existing entry for same date', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '22:00', wakeTime: '06:00' });
    expect(useSleepStore.getState().entries.length).toBe(1);
    expect(useSleepStore.getState().entries[0].bedtime).toBe('22:00');
    expect(useSleepStore.getState().entries[0].durationHours).toBe(8);
  });

  test('getMonday on Jan 1 2026 (Thursday)', () => {
    const jan1 = new Date(2026, 0, 1); // Jan 1 2026 is a Thursday
    const monday = getMonday(jan1);
    expect(monday.getDate()).toBe(29); // Dec 29 2025
    expect(monday.getMonth()).toBe(11); // December (0-indexed)
    expect(monday.getFullYear()).toBe(2025);
  });

  test('getMonday on a Monday returns same date', () => {
    // Jan 5 2026 is a Monday
    const mon = new Date(2026, 0, 5);
    const result = getMonday(mon);
    expect(result.getDate()).toBe(5);
    expect(result.getMonth()).toBe(0);
  });

  test('getMonday on a Sunday returns previous Monday', () => {
    // Jan 4 2026 is a Sunday
    const sun = new Date(2026, 0, 4);
    const result = getMonday(sun);
    expect(result.getDate()).toBe(29); // Dec 29 2025
    expect(result.getMonth()).toBe(11);
    expect(result.getFullYear()).toBe(2025);
  });

  test('formatNum with very large number', () => {
    expect(formatNum(123456.789, 2)).toBe('123456,79');
  });

  test('formatNum with 0 decimals', () => {
    expect(formatNum(42.7, 0)).toBe('43');
  });

  test('formatNum with default decimals (1)', () => {
    expect(formatNum(3.14)).toBe('3,1');
  });

  test('formatNum with 0 value', () => {
    expect(formatNum(0, 2)).toBe('0,00');
  });

  test('formatNum with negative number', () => {
    expect(formatNum(-5.5, 1)).toBe('-5,5');
  });

  test('completeSet on non-existent exercise index is safe', () => {
    useWorkoutStore.getState().startWorkout({
      id: 'safe-1',
      name: 'Safe',
      exercises: [{
        id: 'we-1',
        exerciseId: 'ex-1',
        exercise: mockExercise,
        order: 0,
        sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 0, weight: 0, completed: false }],
        restSeconds: 0,
      }],
    });
    // Out-of-bounds index is silently ignored — state must remain intact
    useWorkoutStore.getState().completeSet(5, 0, { reps: 10, weight: 50 });
    expect(useWorkoutStore.getState().activeWorkout).not.toBeNull();
    expect(useWorkoutStore.getState().activeWorkout!.workout.exercises).toHaveLength(1);
  });

  test('finishWorkout with no active workout returns null', () => {
    expect(useWorkoutStore.getState().finishWorkout()).toBeNull();
  });

  test('cancelWorkout clears active workout', () => {
    useWorkoutStore.getState().startWorkout({
      id: 'cancel-1',
      name: 'Cancel Me',
      exercises: [],
    });
    useWorkoutStore.getState().cancelWorkout();
    expect(useWorkoutStore.getState().activeWorkout).toBeNull();
    // Should not be added to history
    expect(useWorkoutStore.getState().workoutHistory).toHaveLength(0);
  });
});

// ==================== 3. CONCURRENT OPERATIONS ====================

describe('concurrent operations', () => {
  test('multiple addMeal on same date accumulates all meals', () => {
    for (let i = 0; i < 5; i++) {
      useNutritionStore.getState().addMeal('2026-04-08', {
        id: `meal-${i}`,
        type: 'snack',
        totalCalories: 100,
        totalProtein: 10,
        totalFats: 5,
        totalCarbs: 10,
        items: [{
          id: `item-${i}`,
          name: `Food ${i}`,
          calories: 100,
          protein: 10,
          fats: 5,
          carbs: 10,
          weightGrams: 100,
        }],
        createdAt: new Date().toISOString(),
      });
    }
    expect(useNutritionStore.getState().getDayLog('2026-04-08').meals.length).toBe(5);
  });

  test('second startWorkout is ignored when one is already active', () => {
    useWorkoutStore.getState().startWorkout({ id: 'w-1', name: 'First', exercises: [] });
    useWorkoutStore.getState().startWorkout({ id: 'w-2', name: 'Second', exercises: [] });
    // Guard prevents overwriting an in-progress workout
    expect(useWorkoutStore.getState().activeWorkout!.workout.id).toBe('w-1');
    expect(useWorkoutStore.getState().workoutHistory).toHaveLength(0);
  });

  test('adding meals to different dates simultaneously', () => {
    const dates = ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05'];
    dates.forEach((date, i) => {
      useNutritionStore.getState().addMeal(date, {
        id: `meal-${i}`,
        type: 'lunch',
        totalCalories: 500,
        totalProtein: 30,
        totalFats: 20,
        totalCarbs: 50,
        items: [{
          id: `item-${i}`,
          name: `Lunch ${i}`,
          calories: 500,
          protein: 30,
          fats: 20,
          carbs: 50,
          weightGrams: 300,
        }],
        createdAt: new Date().toISOString(),
      });
    });

    // Each date should have exactly one meal
    dates.forEach((date) => {
      expect(useNutritionStore.getState().getDayLog(date).meals.length).toBe(1);
    });
  });

  test('adding water and meals to same date does not interfere', () => {
    useNutritionStore.getState().addWater('2026-04-08', 500);
    useNutritionStore.getState().addMeal('2026-04-08', {
      id: 'meal-1',
      type: 'breakfast',
      totalCalories: 400,
      totalProtein: 25,
      totalFats: 15,
      totalCarbs: 40,
      items: [{
        id: 'item-1',
        name: 'Oats',
        calories: 400,
        protein: 25,
        fats: 15,
        carbs: 40,
        weightGrams: 200,
      }],
      createdAt: new Date().toISOString(),
    });
    useNutritionStore.getState().addWater('2026-04-08', 300);

    const log = useNutritionStore.getState().getDayLog('2026-04-08');
    expect(log.waterMl).toBe(800);
    expect(log.meals.length).toBe(1);
  });

  test('interleaving sleep add and remove operations', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-01', bedtime: '23:00', wakeTime: '07:00' });
    useSleepStore.getState().addEntry({ date: '2026-04-02', bedtime: '23:00', wakeTime: '07:00' });
    useSleepStore.getState().removeEntry('2026-04-01');
    useSleepStore.getState().addEntry({ date: '2026-04-03', bedtime: '22:00', wakeTime: '06:00' });

    expect(useSleepStore.getState().entries.length).toBe(2);
    const dates = useSleepStore.getState().entries.map((e) => e.date);
    expect(dates).toContain('2026-04-02');
    expect(dates).toContain('2026-04-03');
    expect(dates).not.toContain('2026-04-01');
  });

  test('multiple exercises with interleaved set completions', () => {
    useWorkoutStore.getState().startWorkout({
      id: 'multi-1',
      name: 'Multi Exercise',
      exercises: [
        {
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 0,
          sets: [
            { id: 's-1', setNumber: 1, type: 'normal' as const, reps: 0, weight: 0, completed: false },
            { id: 's-2', setNumber: 2, type: 'normal' as const, reps: 0, weight: 0, completed: false },
          ],
        },
        {
          id: 'we-2', exerciseId: 'ex-2', exercise: { ...mockExercise, id: 'ex-2', name: 'Squat' }, order: 1, restSeconds: 0,
          sets: [
            { id: 's-3', setNumber: 1, type: 'normal' as const, reps: 0, weight: 0, completed: false },
            { id: 's-4', setNumber: 2, type: 'normal' as const, reps: 0, weight: 0, completed: false },
          ],
        },
      ],
    });

    // Interleave completions between exercises
    useWorkoutStore.getState().completeSet(0, 0, { reps: 10, weight: 80 });
    useWorkoutStore.getState().completeSet(1, 0, { reps: 8, weight: 120 });
    useWorkoutStore.getState().completeSet(0, 1, { reps: 8, weight: 85 });
    useWorkoutStore.getState().completeSet(1, 1, { reps: 6, weight: 130 });

    const exercises = useWorkoutStore.getState().activeWorkout!.workout.exercises;
    expect(exercises[0].sets[0].weight).toBe(80);
    expect(exercises[0].sets[1].weight).toBe(85);
    expect(exercises[1].sets[0].weight).toBe(120);
    expect(exercises[1].sets[1].weight).toBe(130);

    const result = useWorkoutStore.getState().finishWorkout();
    // (10*80) + (8*85) + (8*120) + (6*130) = 800 + 680 + 960 + 780 = 3220
    expect(result!.totalVolume).toBe(3220);
  });
});
