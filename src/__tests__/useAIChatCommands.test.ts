/**
 * useAIChatCommands — store-mutation integration pins.
 *
 * Tests `executeCommand` (exported from the hook module) directly so we
 * don't need a React render shell. The hook itself is a thin
 * useCallback wrapper around `parseChatCommand` + `executeCommand` —
 * the parser is locked in `parseChatCommand.test.ts`; here we pin the
 * store side-effects.
 *
 * Variable names use the `mock*` prefix per Jest's hoisting rules
 * (jest.mock factories can only reference variables named that way).
 */

const mockAddWater = jest.fn();
const mockAddSet = jest.fn();
const mockUpdateSetData = jest.fn();
const mockCompleteSet = jest.fn();
const mockNextExercise = jest.fn();

const mockToastSuccess = jest.fn();
const mockToastWarn = jest.fn();
const mockToastInfo = jest.fn();
const mockToastError = jest.fn();

let mockActiveWorkout: unknown = null;

jest.mock('../store', () => ({
  useWorkoutStore: {
    getState: () => ({
      activeWorkout: mockActiveWorkout,
      addSet: mockAddSet,
      updateSetData: mockUpdateSetData,
      completeSet: mockCompleteSet,
      nextExercise: mockNextExercise,
    }),
  },
  useNutritionStore: {
    getState: () => ({
      addWater: mockAddWater,
    }),
  },
}));

jest.mock('../components/app-modal/toast', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    warn: (...args: unknown[]) => mockToastWarn(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

jest.mock('../utils/date', () => ({
  localDateStr: () => '2026-05-12',
}));

import { executeCommand } from '../screens/ai/useAIChatCommands';

beforeEach(() => {
  jest.clearAllMocks();
  mockActiveWorkout = null;
});

describe('executeCommand — water', () => {
  it('calls nutritionStore.addWater with today + ml + success toast', () => {
    executeCommand({ type: 'add_water', ml: 250 });
    expect(mockAddWater).toHaveBeenCalledWith('2026-05-12', 250);
    expect(mockToastSuccess).toHaveBeenCalledWith('+250 мл воды');
  });
});

describe('executeCommand — next_exercise', () => {
  it('calls store.nextExercise when workout active', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: { exercises: [{ sets: [] }] },
    };
    executeCommand({ type: 'next_exercise' });
    expect(mockNextExercise).toHaveBeenCalledTimes(1);
    expect(mockToastInfo).toHaveBeenCalledWith('Следующее упражнение');
  });

  it('warns + skips mutation when no active workout', () => {
    mockActiveWorkout = null;
    executeCommand({ type: 'next_exercise' });
    expect(mockNextExercise).not.toHaveBeenCalled();
    expect(mockToastWarn).toHaveBeenCalledWith('Нет активной тренировки');
  });
});

describe('executeCommand — complete_set', () => {
  it('fires completeSet on the first pending set with the right payload', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [
          {
            sets: [
              { weight: 80, reps: 8, completed: true },
              { weight: 85, reps: 6, completed: false },
              { weight: 85, reps: 6, completed: false },
            ],
          },
        ],
      },
    };
    executeCommand({ type: 'complete_set' });
    expect(mockCompleteSet).toHaveBeenCalledWith(0, 1, { weight: 85, reps: 6 });
    expect(mockToastSuccess).toHaveBeenCalledWith('Подход засчитан');
  });

  it('info-toast when all sets already done', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [
          {
            sets: [
              { weight: 80, reps: 8, completed: true },
              { weight: 85, reps: 6, completed: true },
            ],
          },
        ],
      },
    };
    executeCommand({ type: 'complete_set' });
    expect(mockCompleteSet).not.toHaveBeenCalled();
    expect(mockToastInfo).toHaveBeenCalledWith('Все подходы уже выполнены');
  });

  it('warns when no active workout', () => {
    mockActiveWorkout = null;
    executeCommand({ type: 'complete_set' });
    expect(mockCompleteSet).not.toHaveBeenCalled();
    expect(mockToastWarn).toHaveBeenCalledWith('Нет активной тренировки');
  });
});

describe('executeCommand — adjust_weight', () => {
  it('+5 kg applies to all pending sets only, never to completed sets', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [
          {
            sets: [
              { weight: 80, reps: 8, completed: true },
              { weight: 80, reps: 8, completed: false },
              { weight: 80, reps: 8, completed: false },
            ],
          },
        ],
      },
    };
    executeCommand({ type: 'adjust_weight', delta: 5 });
    // 2 pending sets — each got updateSetData with new weight=85
    expect(mockUpdateSetData).toHaveBeenCalledTimes(2);
    expect(mockUpdateSetData).toHaveBeenCalledWith(0, 1, { weight: 85 });
    expect(mockUpdateSetData).toHaveBeenCalledWith(0, 2, { weight: 85 });
    expect(mockToastSuccess).toHaveBeenCalledWith('+5 кг на все');
  });

  it('-5 floors weight at 0 (no negative loads)', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [
          {
            sets: [{ weight: 3, reps: 8, completed: false }],
          },
        ],
      },
    };
    executeCommand({ type: 'adjust_weight', delta: -5 });
    expect(mockUpdateSetData).toHaveBeenCalledWith(0, 0, { weight: 0 });
  });

  it('info-toast when no pending sets', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [
          {
            sets: [{ weight: 80, reps: 8, completed: true }],
          },
        ],
      },
    };
    executeCommand({ type: 'adjust_weight', delta: 5 });
    expect(mockUpdateSetData).not.toHaveBeenCalled();
    expect(mockToastInfo).toHaveBeenCalledWith('Нет невыполненных подходов');
  });
});
