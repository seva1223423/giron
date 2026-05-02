/**
 * Regression tests for setWeekPlanDay race condition + dedup (Tech-01).
 *
 * Before the fix, rapid successive edits to the same slot could cause a stale
 * in-flight save to roll back the latest optimistic value. Also, identical
 * repeat calls (from memoized UI props re-firing) triggered duplicate saves
 * whose rollbacks could fight over the slot.
 *
 * These tests pin the post-fix behavior so refactors don't regress it.
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

// Round 282: setWeekPlanDay's failure path now goes through reportError
// (was console.warn). Mock the reporter so tests can assert it fired.
const mockReportError = jest.fn();
jest.mock('../utils/errorReporter', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import { useWorkoutStore, type WeekPlanEntry } from '../store/useWorkoutStore';
import { userService } from '../services/userService';

const mockSaveWeekPlan = userService.saveWeekPlan as jest.Mock;

const entryA: WeekPlanEntry = { name: 'Push', emoji: '💪', exercises: ['bench-1'] };
const entryB: WeekPlanEntry = { name: 'Pull', emoji: '🔙', exercises: ['row-1'] };
const entryC: WeekPlanEntry = { name: 'Legs', emoji: '🦵', exercises: ['squat-1'] };

beforeEach(() => {
  mockSaveWeekPlan.mockReset();
  mockSaveWeekPlan.mockImplementation(() => Promise.resolve());
  useWorkoutStore.setState({ weekPlan: {} });
});

describe('setWeekPlanDay — happy path', () => {
  test('writes the entry to the store and sends the full plan to the server', async () => {
    useWorkoutStore.getState().setWeekPlanDay(0, entryA);
    expect(useWorkoutStore.getState().weekPlan[0]).toBe(entryA);
    expect(mockSaveWeekPlan).toHaveBeenCalledTimes(1);
    expect(mockSaveWeekPlan).toHaveBeenCalledWith({ 0: entryA });
  });

  test('ignores out-of-range dow', () => {
    useWorkoutStore.getState().setWeekPlanDay(-1 as any, entryA);
    useWorkoutStore.getState().setWeekPlanDay(7 as any, entryA);
    useWorkoutStore.getState().setWeekPlanDay(3.5 as any, entryA);
    expect(mockSaveWeekPlan).not.toHaveBeenCalled();
    expect(useWorkoutStore.getState().weekPlan).toEqual({});
  });

  test('can set a slot to null (rest day)', () => {
    useWorkoutStore.setState({ weekPlan: { 0: entryA } });
    useWorkoutStore.getState().setWeekPlanDay(0, null);
    expect(useWorkoutStore.getState().weekPlan[0]).toBeNull();
    expect(mockSaveWeekPlan).toHaveBeenCalledWith({ 0: null });
  });
});

describe('setWeekPlanDay — dedup', () => {
  test('reference-equal repeat call is a no-op (no network, no state churn)', () => {
    useWorkoutStore.setState({ weekPlan: { 0: entryA } });
    useWorkoutStore.getState().setWeekPlanDay(0, entryA);
    expect(mockSaveWeekPlan).not.toHaveBeenCalled();
  });

  test('different reference with same shape still triggers save (we do not deep-equal)', () => {
    useWorkoutStore.setState({ weekPlan: { 0: entryA } });
    const shallowCopy: WeekPlanEntry = { ...entryA };
    useWorkoutStore.getState().setWeekPlanDay(0, shallowCopy);
    // Shallow identity differs — caller intended a new value even if shape matches.
    expect(mockSaveWeekPlan).toHaveBeenCalledTimes(1);
  });

  test('noop when both prev and entry are null', () => {
    // weekPlan[0] is undefined (never set), entry is null — different identity.
    // First call sets it, second with same null reference is a noop.
    useWorkoutStore.getState().setWeekPlanDay(0, null);
    expect(mockSaveWeekPlan).toHaveBeenCalledTimes(1);
    mockSaveWeekPlan.mockClear();
    useWorkoutStore.getState().setWeekPlanDay(0, null);
    expect(mockSaveWeekPlan).not.toHaveBeenCalled();
  });
});

describe('setWeekPlanDay — rollback on save failure', () => {
  test('rolls back to prev value when the save rejects', async () => {
    useWorkoutStore.setState({ weekPlan: { 0: entryA } });
    mockSaveWeekPlan.mockRejectedValueOnce(new Error('network'));
    mockReportError.mockClear();

    useWorkoutStore.getState().setWeekPlanDay(0, entryB);
    // Optimistic write is visible immediately.
    expect(useWorkoutStore.getState().weekPlan[0]).toBe(entryB);

    // Let the rejected promise settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(useWorkoutStore.getState().weekPlan[0]).toBe(entryA);
    // Round 282: rollback now reports to Sentry instead of console.warn.
    expect(mockReportError).toHaveBeenCalled();
  });

  test('does NOT roll back if a newer edit replaced our optimistic value', async () => {
    useWorkoutStore.setState({ weekPlan: { 0: entryA } });
    mockSaveWeekPlan.mockRejectedValueOnce(new Error('network')); // first save fails
    mockSaveWeekPlan.mockResolvedValueOnce(undefined);            // second save wins
    mockReportError.mockClear();

    // Fire A → B rapidly, then B → C before save(B) has time to fail.
    useWorkoutStore.getState().setWeekPlanDay(0, entryB);
    useWorkoutStore.getState().setWeekPlanDay(0, entryC);

    // Drain microtasks.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // C is the user's latest intent. Save(B) failing must NOT roll us back to A —
    // that would silently undo the user's C edit.
    expect(useWorkoutStore.getState().weekPlan[0]).toBe(entryC);
  });

  test('two back-to-back failures of the same entry only roll back once (dedup guard)', async () => {
    useWorkoutStore.setState({ weekPlan: { 0: entryA } });
    mockSaveWeekPlan.mockRejectedValue(new Error('network')); // all saves fail
    mockReportError.mockClear();

    // Same reference passed twice — second call is deduped before firing save.
    useWorkoutStore.getState().setWeekPlanDay(0, entryB);
    useWorkoutStore.getState().setWeekPlanDay(0, entryB);

    await Promise.resolve();
    await Promise.resolve();

    expect(mockSaveWeekPlan).toHaveBeenCalledTimes(1);
    // Round 282: One rollback, one reportError — not two of each.
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(useWorkoutStore.getState().weekPlan[0]).toBe(entryA);
  });
});

describe('setWeekPlanDay — cross-slot independence', () => {
  test('failing save on slot 0 does not affect slot 1', async () => {
    mockSaveWeekPlan.mockRejectedValueOnce(new Error('network'));
    mockSaveWeekPlan.mockResolvedValueOnce(undefined);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    useWorkoutStore.getState().setWeekPlanDay(0, entryA);
    useWorkoutStore.getState().setWeekPlanDay(1, entryB);

    await Promise.resolve();
    await Promise.resolve();

    // Slot 0 rolled back to its previous value (undefined), slot 1 kept entryB.
    expect(useWorkoutStore.getState().weekPlan[0]).toBeUndefined();
    expect(useWorkoutStore.getState().weekPlan[1]).toBe(entryB);
    warnSpy.mockRestore();
  });
});
