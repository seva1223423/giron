/**
 * The coach adding a warm-up to the session that is running.
 *
 * `generate_warmup` was a tool that did nothing. It returned a sentence
 * telling the person to go press a button, so the coach announced a warm-up
 * and nothing appeared on the screen — the exact failure the action handler
 * exists to prevent.
 *
 * The store already builds warm-ups (covered in workoutStore.test.ts); what
 * is pinned here is the layer above it — which exercise the coach meant,
 * which weight the percentages are taken from, and saying so plainly when
 * there is nothing to do.
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
}));

jest.mock('../services/userService', () => ({
  userService: {
    saveWeekPlan: jest.fn(() => Promise.resolve()),
    getWeekPlan: jest.fn(() => Promise.resolve({})),
  },
}));

import { useWorkoutStore } from '../store/useWorkoutStore';
import { applyCoachWarmup } from '../utils/coachActions';

const ex = (id: string, name: string) => ({
  id, name,
  primaryMuscles: [] as any[], secondaryMuscles: [] as any[],
  type: 'barbell' as const, category: 'strength' as const,
  difficulty: 'intermediate' as const, description: '', instructions: [],
});

/** One exercise, one working set at `weight`. */
const withExercises = (
  list: Array<{ id: string; name: string; weight: number }>,
) => {
  useWorkoutStore.getState().startWorkout({
    id: 'w-1', name: 'Тест',
    exercises: list.map((e, i) => ({
      id: `we-${i}`, exerciseId: e.id, exercise: ex(e.id, e.name),
      order: i, restSeconds: 90,
      sets: [{ id: `s-${i}`, setNumber: 1, type: 'normal' as const, reps: 8, weight: e.weight, completed: false }],
    })),
  } as any);
};

const setsOf = (i: number) =>
  useWorkoutStore.getState().activeWorkout!.workout.exercises[i].sets;

beforeEach(() => {
  useWorkoutStore.setState({ activeWorkout: null } as any);
});

describe('applyCoachWarmup', () => {
  test('adds a warm-up to the current exercise when none is named', () => {
    withExercises([{ id: 'ex-1', name: 'Жим лёжа', weight: 100 }]);

    expect(applyCoachWarmup({})).toBeNull();

    const sets = setsOf(0);
    expect(sets).toHaveLength(4); // 3 warm-up + the working set
    expect(sets.slice(0, 3).map((s) => s.weight)).toEqual([40, 60, 80]);
    expect(sets[3].weight).toBe(100);
  });

  test('finds the exercise from the name as the person said it', () => {
    withExercises([
      { id: 'ex-1', name: 'Приседания', weight: 120 },
      { id: 'ex-2', name: 'Жим лёжа', weight: 100 },
    ]);

    // "жим", not "Жим лёжа" — nobody says the catalogue name out loud.
    expect(applyCoachWarmup({ exerciseName: 'жим' })).toBeNull();

    expect(setsOf(1)).toHaveLength(4);
    expect(setsOf(0)).toHaveLength(1); // the squat was left alone
  });

  test('asking twice does not shrink the warm-up', () => {
    // The trap: the first call prepends a 40% set, so a naive "first set with
    // a weight" would then read 40 as the working weight and generate 16/24/32.
    withExercises([{ id: 'ex-1', name: 'Жим лёжа', weight: 100 }]);

    applyCoachWarmup({});
    applyCoachWarmup({});

    const sets = setsOf(0);
    expect(sets).toHaveLength(4);
    expect(sets.slice(0, 3).map((s) => s.weight)).toEqual([40, 60, 80]);
  });

  test('says the workout is not running instead of failing silently', () => {
    const problem = applyCoachWarmup({});
    expect(problem).toMatch(/тренировка не идёт/i);
  });

  test('names the exercise it could not find', () => {
    withExercises([{ id: 'ex-1', name: 'Жим лёжа', weight: 100 }]);

    const problem = applyCoachWarmup({ exerciseName: 'Становая тяга' });
    expect(problem).toContain('Становая тяга');
    expect(setsOf(0)).toHaveLength(1); // nothing was touched
  });

  test('refuses to invent a warm-up when there is no working weight', () => {
    // Percentages of zero are zero. Pull-ups get no warm-up from this tool.
    withExercises([{ id: 'ex-1', name: 'Подтягивания', weight: 0 }]);

    const problem = applyCoachWarmup({});
    expect(problem).toMatch(/рабочий вес/i);
    expect(setsOf(0)).toHaveLength(1);
  });
});
