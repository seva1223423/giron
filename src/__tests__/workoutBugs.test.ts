/**
 * Regression tests for bugs found in useWorkoutStore
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

const mockExercise = {
  id: 'ex-bench', name: 'Bench Press', primaryMuscles: ['chest'] as any, secondaryMuscles: ['triceps'] as any,
  type: 'barbell' as const, category: 'strength' as const, difficulty: 'intermediate' as const,
  description: '', instructions: [],
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
});

describe('PR detection bugs', () => {
  test('BUG FIX: first workout for exercise IS a PR (was blocked by historyBest > 0)', () => {
    // Previously: completedSet.isPR = newRM > historyBest && historyBest > 0
    // historyBest was 0 for first workout -> isPR always false
    // Fix: removed && historyBest > 0
    // Setup: no history, start fresh workout
    useWorkoutStore.setState({ workoutHistory: [], activeWorkout: null });
    useWorkoutStore.getState().startWorkout({
      id: 'w-1', name: 'Test',
      exercises: [{
        id: 'we-1', exerciseId: 'ex-bench', exercise: mockExercise, order: 0,
        sets: [{ id: 's-1', setNumber: 1, type: 'normal', reps: 0, weight: 0, completed: false }],
        restSeconds: 0,
      }],
    });
    useWorkoutStore.getState().completeSet(0, 0, { reps: 10, weight: 80 });
    const set = useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0];
    expect(set.isPR).toBe(true); // THIS was false before the fix
  });

  test('warmup sets should NOT be marked as PR', () => {
    useWorkoutStore.setState({ workoutHistory: [], activeWorkout: null });
    useWorkoutStore.getState().startWorkout({
      id: 'w-1', name: 'Test',
      exercises: [{
        id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
        sets: [{ id: 's-1', setNumber: 1, type: 'warmup', reps: 0, weight: 0, completed: false }],
        restSeconds: 0,
      }],
    });
    useWorkoutStore.getState().completeSet(0, 0, { reps: 10, weight: 40 });
    expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0].isPR).toBeUndefined();
  });

  test('PR detection compares against history using Epley 1RM', () => {
    // Set up history with a known best
    const historyWorkout = {
      id: 'hist-1', name: 'Past Workout',
      completedAt: '2026-04-01T10:00:00Z',
      startedAt: '2026-04-01T09:00:00Z',
      exercises: [{
        id: 'we-hist', exerciseId: 'ex-bench', exercise: mockExercise, order: 0,
        sets: [{ id: 's-hist', setNumber: 1, type: 'normal' as const, reps: 10, weight: 80, completed: true }],
        restSeconds: 0,
      }],
      durationMinutes: 60,
      totalVolume: 800,
    };
    useWorkoutStore.setState({ workoutHistory: [historyWorkout] as any });

    useWorkoutStore.getState().startWorkout({
      id: 'w-2', name: 'Test',
      exercises: [{
        id: 'we-2', exerciseId: 'ex-bench', exercise: mockExercise, order: 0,
        sets: [{ id: 's-2', setNumber: 1, type: 'normal', reps: 10, weight: 85, completed: false }],
        restSeconds: 0,
      }],
    });
    useWorkoutStore.getState().completeSet(0, 0, { reps: 10, weight: 85 });
    // 85*(1+10/30) = 113.33 vs 80*(1+10/30) = 106.67 => isPR
    expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0].isPR).toBe(true);
  });

  test('set with lower 1RM than history is NOT a PR', () => {
    const historyWorkout = {
      id: 'hist-1', name: 'Past Workout',
      completedAt: '2026-04-01T10:00:00Z',
      startedAt: '2026-04-01T09:00:00Z',
      exercises: [{
        id: 'we-hist', exerciseId: 'ex-bench', exercise: mockExercise, order: 0,
        sets: [{ id: 's-hist', setNumber: 1, type: 'normal' as const, reps: 10, weight: 100, completed: true }],
        restSeconds: 0,
      }],
      durationMinutes: 60,
      totalVolume: 1000,
    };
    useWorkoutStore.setState({ workoutHistory: [historyWorkout] as any });

    useWorkoutStore.getState().startWorkout({
      id: 'w-2', name: 'Test',
      exercises: [{
        id: 'we-2', exerciseId: 'ex-bench', exercise: mockExercise, order: 0,
        sets: [{ id: 's-2', setNumber: 1, type: 'normal', reps: 10, weight: 80, completed: false }],
        restSeconds: 0,
      }],
    });
    useWorkoutStore.getState().completeSet(0, 0, { reps: 10, weight: 80 });
    expect(useWorkoutStore.getState().activeWorkout!.workout.exercises[0].sets[0].isPR).toBeFalsy();
  });
});

describe('fetchHistory merge bug', () => {
  test('BUG FIX: fetchHistory merges server data with local-only workouts (was replacing)', async () => {
    // Previously: set({ workoutHistory: history }) -- replaced entirely
    // Fix: merge by keeping local workouts not in server set
    const localWorkout = {
      id: 'local-w-1', name: 'Local Workout',
      completedAt: '2026-04-08T10:00:00Z', startedAt: '2026-04-08T09:00:00Z',
      exercises: [], durationMinutes: 60, totalVolume: 1000,
    };
    useWorkoutStore.setState({ workoutHistory: [localWorkout] as any });

    const serverWorkout = {
      id: 'server-w-1', name: 'Server Workout',
      completedAt: '2026-04-07T10:00:00Z', startedAt: '2026-04-07T09:00:00Z',
      exercises: [], durationMinutes: 45, totalVolume: 800,
    };
    const { workoutService } = require('../services');
    workoutService.getHistory.mockResolvedValueOnce({ workouts: [serverWorkout], total: 1 });

    await useWorkoutStore.getState().fetchHistory();

    const history = useWorkoutStore.getState().workoutHistory;
    expect(history.length).toBe(2); // Both local AND server
    expect(history.find((w: any) => w.id === 'local-w-1')).toBeDefined();
    expect(history.find((w: any) => w.id === 'server-w-1')).toBeDefined();
  });

  test('fetchHistory with empty server response keeps local data', async () => {
    const localWorkout = {
      id: 'local-w-2', name: 'Local Only',
      completedAt: '2026-04-08T10:00:00Z', startedAt: '2026-04-08T09:00:00Z',
      exercises: [], durationMinutes: 30, totalVolume: 500,
    };
    useWorkoutStore.setState({ workoutHistory: [localWorkout] as any });

    const { workoutService } = require('../services');
    workoutService.getHistory.mockResolvedValueOnce({ workouts: [], total: 0 });

    await useWorkoutStore.getState().fetchHistory();

    // Empty server response should NOT clear local history
    const history = useWorkoutStore.getState().workoutHistory;
    expect(history.length).toBe(1);
    expect(history[0].id).toBe('local-w-2');
  });
});

describe('fetchHistory — clientId deduplication', () => {
  test('BUG FIX: does not duplicate workout when server already has it via clientId match', async () => {
    // Scenario: user completes a workout offline → it's saved locally as 'wo-local-1'
    // Later the sync succeeds → server stores it with a CUID and clientId: 'wo-local-1'
    // On next fetchHistory: the server returns the workout with clientId reference.
    // The merge MUST exclude the local copy to avoid a duplicate entry.

    const localWorkout = {
      id: 'wo-local-1', name: 'Push Day',
      completedAt: '2026-04-10T10:00:00Z', startedAt: '2026-04-10T09:00:00Z',
      exercises: [], durationMinutes: 60, totalVolume: 1200,
    };
    useWorkoutStore.setState({ workoutHistory: [localWorkout] as any, pendingSync: [] });

    // Server returns the same workout with a server-generated CUID + clientId back-reference
    const serverWorkout = {
      id: 'cserverpushday000000001', // server-generated CUID
      clientId: 'wo-local-1',        // back-reference to original local ID
      name: 'Push Day',
      completedAt: '2026-04-10T10:00:00Z', startedAt: '2026-04-10T09:00:00Z',
      exercises: [], durationMinutes: 60, totalVolume: 1200,
    };
    const { workoutService } = require('../services');
    workoutService.getHistory.mockResolvedValueOnce({ workouts: [serverWorkout], total: 1 });

    await useWorkoutStore.getState().fetchHistory();

    const history = useWorkoutStore.getState().workoutHistory;
    // Must have exactly 1 entry — the server version; local copy was excluded via clientId match
    expect(history.length).toBe(1);
    expect(history[0].id).toBe('cserverpushday000000001');
  });

  test('workouts with no clientId overlap are both kept in merge', async () => {
    const localWorkout = {
      id: 'wo-truly-local', name: 'Local Only Workout',
      completedAt: '2026-04-11T10:00:00Z', startedAt: '2026-04-11T09:00:00Z',
      exercises: [], durationMinutes: 45, totalVolume: 900,
    };
    useWorkoutStore.setState({ workoutHistory: [localWorkout] as any, pendingSync: [] });

    const serverWorkout = {
      id: 'cserverdifferent000001',
      name: 'Server Workout',
      completedAt: '2026-04-09T10:00:00Z', startedAt: '2026-04-09T09:00:00Z',
      exercises: [], durationMinutes: 50, totalVolume: 1000,
      // no clientId → no match with local
    };
    const { workoutService } = require('../services');
    workoutService.getHistory.mockResolvedValueOnce({ workouts: [serverWorkout], total: 1 });

    await useWorkoutStore.getState().fetchHistory();

    const history = useWorkoutStore.getState().workoutHistory;
    expect(history.length).toBe(2);
    expect(history.find((w: any) => w.id === 'wo-truly-local')).toBeDefined();
    expect(history.find((w: any) => w.id === 'cserverdifferent000001')).toBeDefined();
  });
});

describe('fetchHistory — pendingSync FIFO order', () => {
  test('flushes pending syncs in insertion (FIFO) order', async () => {
    // When the store retries failed syncs on fetchHistory, syncWorkout must be called
    // in the same order the workouts were added to pendingSync (oldest → newest).
    // Out-of-order submission could confuse server-side progressive overload logic.

    const pending = [
      { id: 'wo-pending-a', name: 'Monday', completedAt: '2026-04-07T10:00:00Z', exercises: [] },
      { id: 'wo-pending-b', name: 'Wednesday', completedAt: '2026-04-09T10:00:00Z', exercises: [] },
      { id: 'wo-pending-c', name: 'Friday', completedAt: '2026-04-11T10:00:00Z', exercises: [] },
    ];
    useWorkoutStore.setState({ pendingSync: pending as any, workoutHistory: [] });

    const { workoutService } = require('../services');
    workoutService.syncWorkout.mockResolvedValue(undefined);
    workoutService.getHistory.mockResolvedValueOnce({ workouts: [], total: 0 });

    await useWorkoutStore.getState().fetchHistory();

    const calls = (workoutService.syncWorkout as jest.Mock).mock.calls;
    expect(calls.length).toBe(3);
    // Calls must be in insertion order
    expect(calls[0][0].id).toBe('wo-pending-a');
    expect(calls[1][0].id).toBe('wo-pending-b');
    expect(calls[2][0].id).toBe('wo-pending-c');
  });

  test('successful pending syncs are removed from queue; failed ones stay', async () => {
    const pending = [
      { id: 'wo-ok', name: 'Success Workout', completedAt: '2026-04-07T10:00:00Z', exercises: [] },
      { id: 'wo-fail', name: 'Failed Workout', completedAt: '2026-04-08T10:00:00Z', exercises: [] },
    ];
    useWorkoutStore.setState({ pendingSync: pending as any, workoutHistory: [] });

    const { workoutService } = require('../services');
    // First call succeeds, second fails
    workoutService.syncWorkout
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Network error'));
    workoutService.getHistory.mockResolvedValueOnce({ workouts: [], total: 0 });

    await useWorkoutStore.getState().fetchHistory();

    const remaining = useWorkoutStore.getState().pendingSync;
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('wo-fail');
  });
});

describe('finishWorkout', () => {
  test('calculates totalVolume correctly including all set types', () => {
    useWorkoutStore.setState({ workoutHistory: [], activeWorkout: null });
    useWorkoutStore.getState().startWorkout({
      id: 'w-1', name: 'Test',
      exercises: [{
        id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
        sets: [
          { id: 's-1', setNumber: 1, type: 'normal', reps: 10, weight: 100, completed: true },
          { id: 's-2', setNumber: 2, type: 'normal', reps: 8, weight: 100, completed: true },
          { id: 's-3', setNumber: 3, type: 'normal', reps: 6, weight: 100, completed: true },
          { id: 's-4', setNumber: 4, type: 'normal', reps: 0, weight: 0, completed: false }, // not completed
        ],
        restSeconds: 0,
      }],
    });
    const result = useWorkoutStore.getState().finishWorkout();
    // Only completed sets: 10*100 + 8*100 + 6*100 = 2400
    expect(result!.totalVolume).toBe(2400);
  });

  test('returns null when no active workout', () => {
    useWorkoutStore.setState({ activeWorkout: null });
    expect(useWorkoutStore.getState().finishWorkout()).toBeNull();
  });

  test('finishWorkout clears activeWorkout and adds to history', () => {
    useWorkoutStore.getState().startWorkout({
      id: 'w-1', name: 'Test',
      exercises: [{
        id: 'we-1', exerciseId: 'ex-1', exercise: mockExercise, order: 0,
        sets: [{ id: 's-1', setNumber: 1, type: 'normal', reps: 5, weight: 60, completed: true }],
        restSeconds: 0,
      }],
    });
    expect(useWorkoutStore.getState().activeWorkout).not.toBeNull();

    const result = useWorkoutStore.getState().finishWorkout();
    expect(useWorkoutStore.getState().activeWorkout).toBeNull();
    expect(useWorkoutStore.getState().workoutHistory.length).toBe(1);
    expect(result!.completedAt).toBeDefined();
  });
});
