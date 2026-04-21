/**
 * Tests for the Routines slice of useWorkoutStore.
 *
 * Covers fetchRoutines, addRoutine, removeRoutine (with 404 tolerance and
 * rollback on non-404 errors), and startWorkoutFromRoutine (both the happy
 * path and the guard against starting when a workout is already active).
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
    patchWorkoutNotes: jest.fn(() => Promise.resolve()),
    updateProgram: jest.fn(() => Promise.resolve()),
    deleteProgram: jest.fn(() => Promise.resolve()),
    getRoutines: jest.fn(() => Promise.resolve([])),
    createRoutine: jest.fn(() => Promise.resolve()),
    updateRoutine: jest.fn(() => Promise.resolve()),
    deleteRoutine: jest.fn(() => Promise.resolve()),
    prepareRoutineWorkout: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../services/userService', () => ({
  userService: {
    saveWeekPlan: jest.fn(() => Promise.resolve()),
    getWeekPlan: jest.fn(() => Promise.resolve({})),
  },
}));

import { useWorkoutStore } from '../store/useWorkoutStore';
import type { Routine, RoutineStartPayload } from '../types';

const mockExercise = {
  id: 'ex-1',
  name: 'Bench press',
  type: 'strength' as const,
  category: 'chest',
  difficulty: 'beginner' as const,
  primaryMuscles: ['chest'] as any,
  secondaryMuscles: [] as any,
};

const makeRoutine = (id: string, name = 'Push A'): Routine => ({
  id,
  name,
  exercises: [
    {
      id: `re-${id}`,
      exerciseId: 'ex-1',
      exercise: mockExercise as any,
      order: 0,
      restSeconds: 90,
      sets: [{ setNumber: 1, type: 'normal', reps: 8, weight: 60 }],
    },
  ],
  createdAt: '2026-04-21T00:00:00Z',
  updatedAt: '2026-04-21T00:00:00Z',
});

const reset = () => {
  useWorkoutStore.setState({
    routines: [],
    isLoadingRoutines: false,
    activeWorkout: null,
  } as any);
};

describe('useWorkoutStore — Routines slice', () => {
  beforeEach(() => {
    reset();
    jest.clearAllMocks();
  });

  test('initial state has no routines and isLoadingRoutines=false', () => {
    expect(useWorkoutStore.getState().routines).toEqual([]);
    expect(useWorkoutStore.getState().isLoadingRoutines).toBe(false);
  });

  test('fetchRoutines populates the list on success', async () => {
    const { workoutService } = require('../services');
    workoutService.getRoutines.mockResolvedValueOnce([makeRoutine('r-1'), makeRoutine('r-2', 'Pull A')]);
    await useWorkoutStore.getState().fetchRoutines();
    const routines = useWorkoutStore.getState().routines;
    expect(routines).toHaveLength(2);
    expect(routines[0].name).toBe('Push A');
    expect(useWorkoutStore.getState().isLoadingRoutines).toBe(false);
  });

  test('fetchRoutines clears loading flag even when server errors', async () => {
    const { workoutService } = require('../services');
    workoutService.getRoutines.mockRejectedValueOnce(new Error('Network'));
    await useWorkoutStore.getState().fetchRoutines();
    expect(useWorkoutStore.getState().isLoadingRoutines).toBe(false);
    expect(useWorkoutStore.getState().routines).toEqual([]);
  });

  test('addRoutine prepends to the list', () => {
    useWorkoutStore.setState({ routines: [makeRoutine('old')] } as any);
    useWorkoutStore.getState().addRoutine(makeRoutine('new', 'Leg A'));
    const list = useWorkoutStore.getState().routines;
    expect(list[0].id).toBe('new');
    expect(list[1].id).toBe('old');
  });

  test('removeRoutine optimistically removes and confirms on server success', async () => {
    const r = makeRoutine('r-1');
    useWorkoutStore.setState({ routines: [r] } as any);
    const { workoutService } = require('../services');
    workoutService.deleteRoutine.mockResolvedValueOnce(undefined);
    await useWorkoutStore.getState().removeRoutine('r-1');
    // allow the fire-and-forget .catch() attachment to settle
    await Promise.resolve();
    expect(useWorkoutStore.getState().routines).toEqual([]);
  });

  test('removeRoutine rolls back on non-404 server error', async () => {
    const r = makeRoutine('r-1');
    useWorkoutStore.setState({ routines: [r] } as any);
    const { workoutService } = require('../services');
    const err: any = new Error('500');
    err.response = { status: 500 };
    workoutService.deleteRoutine.mockRejectedValueOnce(err);
    await useWorkoutStore.getState().removeRoutine('r-1');
    // wait for the queued rejection .catch handler
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useWorkoutStore.getState().routines).toHaveLength(1);
    expect(useWorkoutStore.getState().routines[0].id).toBe('r-1');
  });

  test('removeRoutine treats 404 as already-deleted (no rollback)', async () => {
    const r = makeRoutine('r-1');
    useWorkoutStore.setState({ routines: [r] } as any);
    const { workoutService } = require('../services');
    const err: any = new Error('Not found');
    err.response = { status: 404 };
    workoutService.deleteRoutine.mockRejectedValueOnce(err);
    await useWorkoutStore.getState().removeRoutine('r-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useWorkoutStore.getState().routines).toEqual([]);
  });

  test('startWorkoutFromRoutine returns null when a workout is already active', async () => {
    useWorkoutStore.setState({
      activeWorkout: {
        workout: { id: 'w-existing', name: 'Existing', exercises: [] },
        startTime: Date.now(),
        currentExerciseIndex: 0,
        isRestTimerActive: false,
        restTimeRemaining: 0,
      },
    } as any);
    const result = await useWorkoutStore.getState().startWorkoutFromRoutine('r-1');
    expect(result).toBeNull();
    // active workout must not have been replaced
    expect(useWorkoutStore.getState().activeWorkout?.workout.id).toBe('w-existing');
  });

  test('startWorkoutFromRoutine hydrates activeWorkout from server payload', async () => {
    const { workoutService } = require('../services');
    const payload: RoutineStartPayload = {
      routineId: 'r-1',
      name: 'Push A',
      exercises: [
        {
          exerciseId: 'ex-1',
          exercise: mockExercise as any,
          order: 0,
          restSeconds: 90,
          notes: null,
          progressionApplied: true,
          previousWeight: 60,
          sets: [{ setNumber: 1, type: 'normal', reps: 8, weight: 62.5, completed: false as const }],
        },
      ],
    };
    workoutService.prepareRoutineWorkout.mockResolvedValueOnce(payload);
    const result = await useWorkoutStore.getState().startWorkoutFromRoutine('r-1');
    expect(result).not.toBeNull();
    const active = useWorkoutStore.getState().activeWorkout;
    expect(active).not.toBeNull();
    expect(active!.workout.name).toBe('Push A');
    expect(active!.workout.exercises).toHaveLength(1);
    // progressed weight from the server must pass through to the active set
    expect(active!.workout.exercises[0].sets[0].weight).toBe(62.5);
    expect(active!.workout.exercises[0].sets[0].completed).toBe(false);
  });

  test('startWorkoutFromRoutine returns null and does not hydrate on server error', async () => {
    const { workoutService } = require('../services');
    workoutService.prepareRoutineWorkout.mockRejectedValueOnce(new Error('500'));
    const result = await useWorkoutStore.getState().startWorkoutFromRoutine('r-1');
    expect(result).toBeNull();
    expect(useWorkoutStore.getState().activeWorkout).toBeNull();
  });
});
