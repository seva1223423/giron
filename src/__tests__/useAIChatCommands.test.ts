/**
 * useAIChatCommands — store-mutation integration pins.
 *
 * Tests `executeCommand` (exported from the hook module) directly so we
 * don't need a React render shell. The parser is locked in
 * `parseChatCommand.test.ts`; here we pin the store side-effects for
 * every command type.
 *
 * Variable names use the `mock*` prefix per Jest's hoisting rules
 * (jest.mock factories can only reference variables named that way).
 */

const mockAddWater = jest.fn();
const mockSetTargets = jest.fn();
const mockGetDayLog = jest.fn(() => ({
  targetCalories: 2000,
  targetProtein: 120,
  targetFats: 60,
  targetCarbs: 250,
  waterTargetMl: 2500,
}));
const mockAddSet = jest.fn();
const mockUpdateSetData = jest.fn();
const mockCompleteSet = jest.fn();
const mockNextExercise = jest.fn();
const mockPrevExercise = jest.fn();
const mockRemoveSet = jest.fn();
const mockFinishWorkout = jest.fn(() => ({ id: 'w1' }));
const mockCancelWorkout = jest.fn();
const mockSetRestTimer = jest.fn();
const mockAddCardio = jest.fn();
const mockAddMeasurement = jest.fn();

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
      prevExercise: mockPrevExercise,
      removeSet: mockRemoveSet,
      finishWorkout: mockFinishWorkout,
      cancelWorkout: mockCancelWorkout,
      setRestTimer: mockSetRestTimer,
    }),
  },
  useNutritionStore: {
    getState: () => ({
      addWater: mockAddWater,
      setTargets: mockSetTargets,
      getDayLog: mockGetDayLog,
    }),
  },
  useCardioStore: {
    getState: () => ({ addSession: mockAddCardio }),
  },
}));

jest.mock('../store/useMeasurementsStore', () => ({
  useMeasurementsStore: {
    getState: () => ({ addEntry: mockAddMeasurement }),
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

// ═════════════════════ Phase A handlers ════════════════════════════════════

describe('executeCommand — water', () => {
  it('addWater(today, ml) + success toast', () => {
    executeCommand({ type: 'add_water', ml: 250 });
    expect(mockAddWater).toHaveBeenCalledWith('2026-05-12', 250);
    expect(mockToastSuccess).toHaveBeenCalledWith('+250 мл воды');
  });
});

describe('executeCommand — next/prev exercise', () => {
  it('next calls store.nextExercise', () => {
    mockActiveWorkout = { currentExerciseIndex: 0, workout: { exercises: [{ sets: [] }] } };
    executeCommand({ type: 'next_exercise' });
    expect(mockNextExercise).toHaveBeenCalledTimes(1);
  });

  it('prev calls store.prevExercise', () => {
    mockActiveWorkout = { currentExerciseIndex: 1, workout: { exercises: [{ sets: [] }, { sets: [] }] } };
    executeCommand({ type: 'prev_exercise' });
    expect(mockPrevExercise).toHaveBeenCalledTimes(1);
  });

  it('next warns when no active workout', () => {
    mockActiveWorkout = null;
    executeCommand({ type: 'next_exercise' });
    expect(mockNextExercise).not.toHaveBeenCalled();
    expect(mockToastWarn).toHaveBeenCalledWith('Нет активной тренировки');
  });
});

describe('executeCommand — complete_set / adjust_weight', () => {
  beforeEach(() => {
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
  });

  it('complete_set targets first pending', () => {
    executeCommand({ type: 'complete_set' });
    expect(mockCompleteSet).toHaveBeenCalledWith(0, 1, { weight: 85, reps: 6 });
  });

  it('adjust_weight +5 applies to all pending only', () => {
    executeCommand({ type: 'adjust_weight', delta: 5 });
    expect(mockUpdateSetData).toHaveBeenCalledTimes(2);
    expect(mockUpdateSetData).toHaveBeenCalledWith(0, 1, { weight: 90 });
    expect(mockUpdateSetData).toHaveBeenCalledWith(0, 2, { weight: 90 });
  });
});

// ═════════════════════ Phase D handlers ════════════════════════════════════

describe('executeCommand — remove_last_set', () => {
  it('drops the last set when it is pending', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [{ sets: [{ completed: true }, { completed: false }] }],
      },
    };
    executeCommand({ type: 'remove_last_set' });
    expect(mockRemoveSet).toHaveBeenCalledWith(0, 1);
    expect(mockToastSuccess).toHaveBeenCalledWith('Подход убран');
  });

  it('refuses to drop a completed set silently', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: { exercises: [{ sets: [{ completed: true }] }] },
    };
    executeCommand({ type: 'remove_last_set' });
    expect(mockRemoveSet).not.toHaveBeenCalled();
    expect(mockToastInfo).toHaveBeenCalled();
  });
});

describe('executeCommand — finish/cancel workout', () => {
  it('finish calls finishWorkout + success toast', () => {
    mockActiveWorkout = { currentExerciseIndex: 0, workout: { exercises: [] } };
    executeCommand({ type: 'finish_workout' });
    expect(mockFinishWorkout).toHaveBeenCalledTimes(1);
    expect(mockToastSuccess).toHaveBeenCalledWith('Тренировка завершена');
  });

  it('cancel calls cancelWorkout + success toast', () => {
    mockActiveWorkout = { currentExerciseIndex: 0, workout: { exercises: [] } };
    executeCommand({ type: 'cancel_workout' });
    expect(mockCancelWorkout).toHaveBeenCalledTimes(1);
    expect(mockToastSuccess).toHaveBeenCalledWith('Тренировка отменена');
  });
});

describe('executeCommand — set_weight / set_reps', () => {
  beforeEach(() => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [
          {
            sets: [
              { weight: 80, reps: 8, completed: true },
              { weight: 85, reps: 6, completed: false },
            ],
          },
        ],
      },
    };
  });

  it('set_weight updates the FIRST pending set only', () => {
    executeCommand({ type: 'set_weight', weight: 95 });
    expect(mockUpdateSetData).toHaveBeenCalledTimes(1);
    expect(mockUpdateSetData).toHaveBeenCalledWith(0, 1, { weight: 95 });
  });

  it('set_reps updates the FIRST pending set only', () => {
    executeCommand({ type: 'set_reps', reps: 10 });
    expect(mockUpdateSetData).toHaveBeenCalledTimes(1);
    expect(mockUpdateSetData).toHaveBeenCalledWith(0, 1, { reps: 10 });
  });
});

describe('executeCommand — set_rest_timer', () => {
  it('calls setRestTimer(seconds)', () => {
    mockActiveWorkout = { currentExerciseIndex: 0, workout: { exercises: [] } };
    executeCommand({ type: 'set_rest_timer', seconds: 90 });
    expect(mockSetRestTimer).toHaveBeenCalledWith(90);
    expect(mockToastSuccess).toHaveBeenCalledWith('Отдых: 90 сек');
  });
});

describe('executeCommand — calorie / water targets', () => {
  it('set_calories_target preserves macros while changing kcal', () => {
    executeCommand({ type: 'set_calories_target', kcal: 2500 });
    expect(mockSetTargets).toHaveBeenCalledWith('2026-05-12', {
      calories: 2500,
      protein: 120, // preserved from mockGetDayLog
      fats: 60,
      carbs: 250,
      waterTargetMl: 2500,
    });
  });

  it('set_water_target preserves macros while changing waterTargetMl', () => {
    executeCommand({ type: 'set_water_target', ml: 3500 });
    expect(mockSetTargets).toHaveBeenCalledWith('2026-05-12', {
      calories: 2000,
      protein: 120,
      fats: 60,
      carbs: 250,
      waterTargetMl: 3500,
    });
  });
});

describe('executeCommand — log_cardio', () => {
  it('run with distance maps to "running" type', () => {
    executeCommand({ type: 'log_cardio', kind: 'run', km: 5 });
    expect(mockAddCardio).toHaveBeenCalledWith({
      type: 'running',
      date: '2026-05-12',
      durationMinutes: 30, // estimate 6 min/km * 5km
      distanceKm: 5,
    });
  });

  it('walk with distance maps to "walking" type', () => {
    executeCommand({ type: 'log_cardio', kind: 'walk', km: 3 });
    expect(mockAddCardio).toHaveBeenCalledWith({
      type: 'walking',
      date: '2026-05-12',
      durationMinutes: 36, // 12 min/km * 3km
      distanceKm: 3,
    });
  });

  it('duration-only cardio maps to "other"', () => {
    executeCommand({ type: 'log_cardio', kind: 'cardio', minutes: 45 });
    expect(mockAddCardio).toHaveBeenCalledWith({
      type: 'other',
      date: '2026-05-12',
      durationMinutes: 45,
      distanceKm: undefined,
    });
  });
});

describe('executeCommand — log_measurement', () => {
  it('logs waist measurement', () => {
    executeCommand({ type: 'log_measurement', field: 'waist', cm: 80 });
    expect(mockAddMeasurement).toHaveBeenCalledWith({
      date: '2026-05-12',
      waist: 80,
    });
  });

  it('logs bicep measurement', () => {
    executeCommand({ type: 'log_measurement', field: 'bicep', cm: 38 });
    expect(mockAddMeasurement).toHaveBeenCalledWith({
      date: '2026-05-12',
      bicep: 38,
    });
  });

  it('toast label uses Russian field name', () => {
    executeCommand({ type: 'log_measurement', field: 'chest', cm: 110 });
    expect(mockToastSuccess).toHaveBeenCalledWith('Грудь: 110 см');
  });
});
