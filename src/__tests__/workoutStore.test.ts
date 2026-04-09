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
    getHistory: jest.fn(() => Promise.resolve([])),
    getPrograms: jest.fn(() => Promise.resolve([])),
  },
}));

import { useWorkoutStore } from '../store/useWorkoutStore';

const mockExercise = {
  id: 'ex-1', name: 'Bench Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'],
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

    test('starting new workout replaces active', () => {
      const workout = { id: 'w-1', name: 'A', exercises: [] };
      useWorkoutStore.getState().startWorkout(workout);
      useWorkoutStore.getState().startWorkout({ id: 'w-2', name: 'B', exercises: [] });

      // Store allows replacing — this is the actual behavior
      expect(useWorkoutStore.getState().activeWorkout!.workout.name).toBe('B');
    });
  });

  describe('completeSet', () => {
    test('marks set as completed', () => {
      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
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
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
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
          id: 'we-old', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
          sets: [{ id: 's-old', setNumber: 1, type: 'normal', reps: 10, weight: 80, completed: true }],
        }])],
      });

      useWorkoutStore.getState().startWorkout({
        id: 'w-1',
        name: 'Test',
        exercises: [{
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
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
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
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
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
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
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
          sets: [
            { id: 's-1', setNumber: 1, type: 'normal' as const, reps: 10, weight: 80, completed: true },
            { id: 's-2', setNumber: 2, type: 'normal' as const, reps: 8, weight: 80, completed: true },
            { id: 's-3', setNumber: 3, type: 'normal' as const, reps: 6, weight: 80, completed: true },
            { id: 's-4', setNumber: 4, type: 'warmup' as const, reps: 10, weight: 40, completed: true },
          ],
        }],
      });

      const result = useWorkoutStore.getState().finishWorkout();

      // (10×80) + (8×80) + (6×80) + (10×40) = 800 + 640 + 480 + 400 = 2320
      expect(result!.totalVolume).toBe(2320);
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
          { id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, sets: [] },
          { id: 'we-2', exerciseId: 'ex-2', exercise: { ...mockExercise, id: 'ex-2' }, order: 1, sets: [] },
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
          { id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, sets: [] },
          { id: 'we-2', exerciseId: 'ex-2', exercise: { ...mockExercise, id: 'ex-2' }, order: 1, sets: [] },
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
        exercises: [{ id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0, sets: [] }],
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
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
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
          id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
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
