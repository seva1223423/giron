/**
 * Tests for useWorkoutStore — key workout logic
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

import type { MuscleGroup } from '../types';

const mockExercise = {
  id: 'ex-1', name: 'Bench Press',
  primaryMuscles: ['chest'] as MuscleGroup[],
  secondaryMuscles: ['triceps'] as MuscleGroup[],
  type: 'barbell' as const, category: 'strength' as const, difficulty: 'intermediate' as const,
  description: '', instructions: [],
};

const mockWorkout = (id: string, completedAt: string, exercises: any[] = []) => ({
  id,
  name: 'Test Workout',
  completedAt,
  startedAt: completedAt,
  exercises,
  durationMinutes: 45,
  totalVolume: 1000,
});

describe('useWorkoutStore', () => {
  beforeEach(() => {
    useWorkoutStore.setState({
      activeWorkout: null,
      workoutHistory: [],
      programs: [],
      weekPlan: Array(7).fill(null),
      savedTemplates: [],
      customExercises: [],
    });
  });

  describe('startWorkout', () => {
    test('creates active workout with correct structure', () => {
      const workout = {
        id: 'w-1',
        name: 'Push Day',
        exercises: [{
          id: 'we-1',
          exerciseId: 'ex-1',
          exercise: mockExercise,
          order: 0,
          restSeconds: 90,
          sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 10, weight: 60, completed: false }],
        }],
      };

      useWorkoutStore.getState().startWorkout(workout);

      const active = useWorkoutStore.getState().activeWorkout;
      expect(active).not.toBeNull();
      expect(active!.workout.name).toBe('Push Day');
      expect(active!.currentExerciseIndex).toBe(0);
      expect(active!.startTime).toBeGreaterThan(0);
    });

    test('second startWorkout is ignored when one is already active', () => {
      const workout = { id: 'w-1', name: 'A', exercises: [] };
      useWorkoutStore.getState().startWorkout(workout);
      useWorkoutStore.getState().startWorkout({ id: 'w-2', name: 'B', exercises: [] });

      // Guard prevents silently overwriting an in-progress workout
      expect(useWorkoutStore.getState().activeWorkout!.workout.name).toBe('A');
    });
  });

  describe('completeSet', () => {
    test('marks set as completed', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 0, weight: 0, completed: false }],
        }],
      });

      useWorkoutStore.getState().completeSet(0, 0, { reps: 10, weight: 80 });

      const set = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0];
      expect(set.completed).toBe(true);
      expect(set.weight).toBe(80);
      expect(set.reps).toBe(10);
    });

    test('detects PR on first ever set for exercise', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 0, weight: 0, completed: false }],
        }],
      });

      useWorkoutStore.getState().completeSet(0, 0, { reps: 10, weight: 80 });

      const set = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0];
      expect(set.isPR).toBe(true);
    });

    test('detects PR when beating history', () => {
      // Set history with previous best
      useWorkoutStore.setState({
        workoutHistory: [mockWorkout('old-1', '2026-04-01', [{
          id: 'we-old', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-old', setNumber: 1, type: 'normal', reps: 10, weight: 80, completed: true }],
        }])],
      });

      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 0, weight: 0, completed: false }],
        }],
      });

      // 100kg × 10 = 133 1RM > 80kg × 10 = 107 1RM → PR
      useWorkoutStore.getState().completeSet(0, 0, { reps: 10, weight: 100 });

      expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0].isPR).toBe(true);
    });

    test('does not flag PR for warmup sets', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-1', setNumber: 1, type: 'warmup' as const, reps: 0, weight: 0, completed: false }],
        }],
      });

      useWorkoutStore.getState().completeSet(0, 0, { reps: 10, weight: 80 });

      expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0].isPR).toBeUndefined();
    });
  });

  describe('finishWorkout', () => {
    test('adds workout to history and clears active', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 10, weight: 80, completed: true }],
        }],
      });

      const result = useWorkoutStore.getState().finishWorkout();

      expect(result).not.toBeNull();
      expect(result!.completedAt).toBeDefined();
      expect(result!.totalVolume).toBe(800); // 80 × 10
      expect(useWorkoutStore.getState().activeWorkout).toBeNull();
      expect(useWorkoutStore.getState().workoutHistory).toHaveLength(1);
    });

    test('calculates total volume correctly', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [
            { id: 's-1', setNumber: 1, type: 'normal' as const, reps: 10, weight: 80, completed: true },
            { id: 's-2', setNumber: 2, type: 'normal' as const, reps: 8, weight: 80, completed: true },
            { id: 's-3', setNumber: 3, type: 'normal' as const, reps: 6, weight: 80, completed: true },
            { id: 's-4', setNumber: 4, type: 'warmup' as const, reps: 10, weight: 40, completed: true },
          ],
        }],
      });

      const result = useWorkoutStore.getState().finishWorkout();

      // Warmup sets excluded: (10×80) + (8×80) + (6×80) = 800 + 640 + 480 = 1920
      expect(result!.totalVolume).toBe(1920);
    });

    test('returns null if no active workout', () => {
      expect(useWorkoutStore.getState().finishWorkout()).toBeNull();
    });
  });

  describe('navigation', () => {
    test('nextExercise increments index', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [
          { id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90, sets: [] },
          { id: 'we-2', exerciseId: 'ex-2', exercise: { ...mockExercise, id: 'ex-2' }, order: 1, restSeconds: 90, sets: [] },
        ],
      });

      useWorkoutStore.getState().nextExercise();
      expect(useWorkoutStore.getState().activeWorkout!.currentExerciseIndex).toBe(1);
    });

    test('prevExercise decrements index', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [
          { id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90, sets: [] },
          { id: 'we-2', exerciseId: 'ex-2', exercise: { ...mockExercise, id: 'ex-2' }, order: 1, restSeconds: 90, sets: [] },
        ],
      });

      useWorkoutStore.getState().nextExercise();
      useWorkoutStore.getState().prevExercise();
      expect(useWorkoutStore.getState().activeWorkout!.currentExerciseIndex).toBe(0);
    });

    test('nextExercise does not go beyond last', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [{ id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90, sets: [] }],
      });

      useWorkoutStore.getState().nextExercise();
      expect(useWorkoutStore.getState().activeWorkout!.currentExerciseIndex).toBe(0);
    });
  });

  describe('addSet / removeSet', () => {
    test('addSet adds a new set to exercise', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 10, weight: 0, completed: false }],
        }],
      });

      useWorkoutStore.getState().addSet(0);

      expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets).toHaveLength(2);
    });

    test('removeSet removes a set', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [
            { id: 's-1', setNumber: 1, type: 'normal' as const, reps: 10, weight: 0, completed: false },
            { id: 's-2', setNumber: 2, type: 'normal' as const, reps: 10, weight: 0, completed: false },
          ],
        }],
      });

      useWorkoutStore.getState().removeSet(0, 0);

      expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets).toHaveLength(1);
    });
  });

  // ─── Regression tests for bugs fixed in April 2026 audit ─────────────────────

  describe('removeSet — set number renumbering (regression)', () => {
    const threeSetWorkout = () => ({
      id: 'w-1', name: 'Test',
      exercises: [{
        id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
        sets: [
          { id: 's-1', setNumber: 1, type: 'normal' as const, reps: 10, weight: 100, completed: false },
          { id: 's-2', setNumber: 2, type: 'normal' as const, reps: 8, weight: 100, completed: false },
          { id: 's-3', setNumber: 3, type: 'normal' as const, reps: 6, weight: 100, completed: false },
        ],
      }],
    });

    test('removing first set renumbers remaining to 1, 2', () => {
      useWorkoutStore.getState().startWorkout(threeSetWorkout());
      useWorkoutStore.getState().removeSet(0, 0);
      const sets = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets;
      expect(sets).toHaveLength(2);
      expect(sets.map((s) => s.setNumber)).toEqual([1, 2]);
    });

    test('removing middle set renumbers remaining to 1, 2', () => {
      useWorkoutStore.getState().startWorkout(threeSetWorkout());
      useWorkoutStore.getState().removeSet(0, 1); // remove set #2
      const sets = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets;
      expect(sets).toHaveLength(2);
      expect(sets.map((s) => s.setNumber)).toEqual([1, 2]); // not [1, 3]
    });

    test('removing last set leaves set #1 renumbered', () => {
      useWorkoutStore.getState().startWorkout(threeSetWorkout());
      useWorkoutStore.getState().removeSet(0, 2);
      const sets = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets;
      expect(sets).toHaveLength(2);
      expect(sets.map((s) => s.setNumber)).toEqual([1, 2]);
    });
  });

  describe('generateWarmupSets — replaces existing warmups (regression)', () => {
    test('prepends 3 warmup sets and strips old ones', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1', name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [
            { id: 'w-old-1', setNumber: 1, type: 'warmup' as const, reps: 5, weight: 20, completed: false },
            { id: 'w-old-2', setNumber: 2, type: 'warmup' as const, reps: 5, weight: 30, completed: false },
            { id: 's-1', setNumber: 3, type: 'normal' as const, reps: 10, weight: 100, completed: false },
          ],
        }],
      });

      useWorkoutStore.getState().generateWarmupSets(0, 100);

      const sets = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets;
      // 3 new warmups + 1 working = 4, not 5 (old warmups removed)
      expect(sets).toHaveLength(4);
      expect(sets[0].type).toBe('warmup');
      expect(sets[1].type).toBe('warmup');
      expect(sets[2].type).toBe('warmup');
      expect(sets[3].type).toBe('normal');
      expect(sets[3].id).toBe('s-1'); // original working set preserved
    });

    test('set numbers are sequential after regeneration', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1', name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [
            { id: 's-1', setNumber: 1, type: 'normal' as const, reps: 10, weight: 80, completed: false },
            { id: 's-2', setNumber: 2, type: 'normal' as const, reps: 8, weight: 80, completed: false },
          ],
        }],
      });

      useWorkoutStore.getState().generateWarmupSets(0, 80);

      const sets = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets;
      expect(sets.map((s) => s.setNumber)).toEqual([1, 2, 3, 4, 5]); // 3 warmups + 2 working
    });

    test('warmup weights are 40/60/80% of working weight, rounded to 0.5', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1', name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 10, weight: 100, completed: false }],
        }],
      });

      useWorkoutStore.getState().generateWarmupSets(0, 100);

      const sets = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets;
      expect(sets[0].weight).toBe(40);   // 100 × 0.40
      expect(sets[1].weight).toBe(60);   // 100 × 0.60
      expect(sets[2].weight).toBe(80);   // 100 × 0.80
    });
  });

  describe('toggleSuperset (regression)', () => {
    const twoExerciseWorkout = () => ({
      id: 'w-1', name: 'Test',
      exercises: [
        { id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90, sets: [] },
        { id: 'we-2', exerciseId: 'ex-2', exercise: { ...mockExercise, id: 'ex-2' }, order: 1, restSeconds: 90, sets: [] },
        { id: 'we-3', exerciseId: 'ex-3', exercise: { ...mockExercise, id: 'ex-3' }, order: 2, restSeconds: 90, sets: [] },
      ],
    });

    test('creates superset between adjacent exercises', () => {
      useWorkoutStore.getState().startWorkout(twoExerciseWorkout());
      useWorkoutStore.getState().toggleSuperset(0);

      const exs = useWorkoutStore.getState().activeWorkout!.workout.exercises;
      const group = exs[0].supersetGroupId;
      expect(group).toBeDefined();
      expect(exs[1].supersetGroupId).toBe(group);
      expect(exs[2].supersetGroupId).toBeUndefined();
    });

    test('calling toggleSuperset again dissolves the superset', () => {
      useWorkoutStore.getState().startWorkout(twoExerciseWorkout());
      useWorkoutStore.getState().toggleSuperset(0);
      useWorkoutStore.getState().toggleSuperset(0); // toggle off

      const exs = useWorkoutStore.getState().activeWorkout!.workout.exercises;
      expect(exs[0].supersetGroupId).toBeUndefined();
      expect(exs[1].supersetGroupId).toBeUndefined();
    });

    test('toggleSuperset on last exercise is a no-op', () => {
      useWorkoutStore.getState().startWorkout(twoExerciseWorkout());
      const before = useWorkoutStore.getState().activeWorkout!.workout.exercises[2].supersetGroupId;
      useWorkoutStore.getState().toggleSuperset(2); // last exercise, no next
      const after = useWorkoutStore.getState().activeWorkout!.workout.exercises[2].supersetGroupId;
      expect(after).toBe(before); // unchanged
    });

    test('orphaned superset group is cleaned up when partner changes', () => {
      // Create superset A: exs[0] + exs[1]
      useWorkoutStore.getState().startWorkout(twoExerciseWorkout());
      useWorkoutStore.getState().toggleSuperset(0);

      const groupA = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].supersetGroupId;

      // Now create superset B: exs[1] + exs[2] — exs[1] leaves group A
      useWorkoutStore.getState().toggleSuperset(1);

      const exs = useWorkoutStore.getState().activeWorkout!.workout.exercises;
      // exs[0] was alone in groupA — should be cleared (only 1 member)
      expect(exs[0].supersetGroupId).toBeUndefined();
      // exs[1] + exs[2] should share a new group
      expect(exs[1].supersetGroupId).toBeDefined();
      expect(exs[2].supersetGroupId).toBe(exs[1].supersetGroupId);
      expect(exs[1].supersetGroupId).not.toBe(groupA);
    });
  });

  describe('PR detection — edge cases (regression)', () => {
    test('warmup sets never trigger PR even with high weight', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1', name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-1', setNumber: 1, type: 'warmup' as const, reps: 5, weight: 0, completed: false }],
        }],
      });

      useWorkoutStore.getState().completeSet(0, 0, { reps: 20, weight: 300 });

      expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0].isPR).toBeUndefined();
    });

    test('zero-weight set does not trigger PR', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1', name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 0, weight: 0, completed: false }],
        }],
      });

      useWorkoutStore.getState().completeSet(0, 0, { reps: 0, weight: 0 });

      expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0].isPR).toBeUndefined();
    });

    test('does not flag PR when 1RM is tied with best (no improvement)', () => {
      useWorkoutStore.setState({
        workoutHistory: [mockWorkout('old-1', '2026-04-01', [{
          id: 'we-old', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-old', setNumber: 1, type: 'normal', reps: 10, weight: 100, completed: true }],
        }])],
      });

      useWorkoutStore.getState().startWorkout({
        id: 'w-1', name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
          sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 0, weight: 0, completed: false }],
        }],
      });

      // Same weight/reps = same 1RM — should NOT be a PR
      useWorkoutStore.getState().completeSet(0, 0, { reps: 10, weight: 100 });

      expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0].isPR).toBe(false);
    });
  });

  describe('setWeekPlanDay — rollback (regression)', () => {
    test('rolls back to previous value on server error', async () => {
      const { userService } = require('../services/userService');

      // First two calls (Push, Pull) succeed; the third (Legs) fails
      userService.saveWeekPlan
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Network error'));

      useWorkoutStore.getState().setWeekPlanDay(0, { name: 'Push', emoji: '💪', exercises: ['ex-1'] });
      useWorkoutStore.getState().setWeekPlanDay(1, { name: 'Pull', emoji: '💪', exercises: ['ex-2'] });

      // Let Push/Pull server calls settle
      await new Promise((r) => setTimeout(r, 10));

      // Change day 0 — server will fail
      useWorkoutStore.getState().setWeekPlanDay(0, { name: 'Legs', emoji: '🦵', exercises: ['ex-3'] });

      // Optimistic update visible immediately
      expect(useWorkoutStore.getState().weekPlan[0]?.name).toBe('Legs');

      // Wait for server call and rollback
      await new Promise((r) => setTimeout(r, 10));

      // Day 0 rolled back to 'Push', day 1 untouched
      expect(useWorkoutStore.getState().weekPlan[0]?.name).toBe('Push');
      expect(useWorkoutStore.getState().weekPlan[1]?.name).toBe('Pull');
    });

    test('rejects invalid day of week numbers', () => {
      useWorkoutStore.getState().setWeekPlanDay(-1, { name: 'Push', emoji: '💪', exercises: [] });
      useWorkoutStore.getState().setWeekPlanDay(7, { name: 'Push', emoji: '💪', exercises: [] });
      useWorkoutStore.getState().setWeekPlanDay(0.5, { name: 'Push', emoji: '💪', exercises: [] });

      const plan = useWorkoutStore.getState().weekPlan;
      // weekPlan is a Record<number, …>, not an array — use Object.values
      expect(Object.values(plan).every((p) => p === null)).toBe(true);
    });
  });

  describe('updateSetData — input validation (regression)', () => {
    const withOneSet = () => ({
      id: 'w-1', name: 'Test',
      exercises: [{
        id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, restSeconds: 90,
        sets: [{ id: 's-1', setNumber: 1, type: 'normal' as const, reps: 10, weight: 80, completed: false }],
      }],
    });

    test('rejects negative weight', () => {
      useWorkoutStore.getState().startWorkout(withOneSet());
      useWorkoutStore.getState().updateSetData(0, 0, { weight: -50 });
      expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0].weight).toBe(80);
    });

    test('rejects negative reps', () => {
      useWorkoutStore.getState().startWorkout(withOneSet());
      useWorkoutStore.getState().updateSetData(0, 0, { reps: -5 });
      expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0].reps).toBe(10);
    });

    test('rejects non-finite weight (Infinity)', () => {
      useWorkoutStore.getState().startWorkout(withOneSet());
      useWorkoutStore.getState().updateSetData(0, 0, { weight: Infinity });
      expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0].weight).toBe(80);
    });

    test('accepts valid update', () => {
      useWorkoutStore.getState().startWorkout(withOneSet());
      useWorkoutStore.getState().updateSetData(0, 0, { weight: 90, reps: 8 });
      const set = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0];
      expect(set.weight).toBe(90);
      expect(set.reps).toBe(8);
    });
  });

  describe('weekPlan', () => {
    test('setWeekPlanDay sets a day entry', () => {
      useWorkoutStore.getState().setWeekPlanDay(0, { name: 'Push', emoji: '💪', exercises: ['ex-1'] });

      const plan = useWorkoutStore.getState().weekPlan;
      expect(plan[0]).not.toBeNull();
      expect(plan[0]!.name).toBe('Push');
    });

    test('setWeekPlanDay with null clears the day', () => {
      useWorkoutStore.getState().setWeekPlanDay(0, { name: 'Push', emoji: '💪', exercises: [] });
      useWorkoutStore.getState().setWeekPlanDay(0, null);

      expect(useWorkoutStore.getState().weekPlan[0]).toBeNull();
    });
  });
});
