/**
 * useAIChatCommands — store-mutation integration pins for every command.
 * The parser is locked in parseChatCommand.test.ts; here we pin the
 * store side-effects for all 30 commands.
 */

// Workout
const mockAddSet = jest.fn();
const mockUpdateSetData = jest.fn();
const mockCompleteSet = jest.fn();
const mockNextExercise = jest.fn();
const mockPrevExercise = jest.fn();
const mockRemoveSet = jest.fn();
const mockFinishWorkout = jest.fn(() => ({ id: 'w1' }));
const mockCancelWorkout = jest.fn();
const mockSetRestTimer = jest.fn();
const mockSetWeekPlanDay = jest.fn();

// Nutrition
const mockAddWater = jest.fn();
const mockSetTargets = jest.fn();
const mockAddMeal = jest.fn();
const mockRemoveMeal = jest.fn();
// Explicit return-type generic so the `meals: []` initial doesn't get
// inferred as `never[]` — later tests do `mockReturnValueOnce` with
// populated meals, and TS would reject those object literals against
// the inferred `never[]` type. See PR #53 CI failure.
type MockDayLog = {
  targetCalories: number;
  targetProtein: number;
  targetFats: number;
  targetCarbs: number;
  waterTargetMl: number;
  waterMl: number;
  meals: Array<{
    id?: string;
    type?: string;
    totalCalories?: number;
    totalProtein?: number;
  }>;
};
const mockGetDayLog = jest.fn<MockDayLog, [string]>(() => ({
  targetCalories: 2000,
  targetProtein: 120,
  targetFats: 60,
  targetCarbs: 250,
  waterTargetMl: 2500,
  waterMl: 0,
  meals: [],
}));

// Cardio / Measurements / Sleep / Settings / Theme
const mockAddCardio = jest.fn();
const mockAddMeasurement = jest.fn();
const mockAddSleep = jest.fn();
const mockSetNotificationsEnabled = jest.fn();
const mockSetWaterRemindersEnabled = jest.fn();
const mockSetThemeMode = jest.fn();

// Toast
const mockToastSuccess = jest.fn();
const mockToastWarn = jest.fn();
const mockToastInfo = jest.fn();
const mockToastError = jest.fn();

let mockActiveWorkout: unknown = null;
let mockWorkoutHistory: unknown[] = [];

jest.mock('../store', () => ({
  useWorkoutStore: {
    getState: () => ({
      activeWorkout: mockActiveWorkout,
      workoutHistory: mockWorkoutHistory,
      addSet: mockAddSet,
      updateSetData: mockUpdateSetData,
      completeSet: mockCompleteSet,
      nextExercise: mockNextExercise,
      prevExercise: mockPrevExercise,
      removeSet: mockRemoveSet,
      finishWorkout: mockFinishWorkout,
      cancelWorkout: mockCancelWorkout,
      setRestTimer: mockSetRestTimer,
      setWeekPlanDay: mockSetWeekPlanDay,
    }),
  },
  useNutritionStore: {
    getState: () => ({
      addWater: mockAddWater,
      setTargets: mockSetTargets,
      addMeal: mockAddMeal,
      removeMeal: mockRemoveMeal,
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

jest.mock('../store/useSleepStore', () => ({
  useSleepStore: {
    getState: () => ({ addEntry: mockAddSleep }),
  },
}));

jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      setNotificationsEnabled: mockSetNotificationsEnabled,
      setWaterRemindersEnabled: mockSetWaterRemindersEnabled,
    }),
  },
}));

jest.mock('../store/useThemeStore', () => ({
  useThemeStore: {
    getState: () => ({ setMode: mockSetThemeMode }),
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
  mockWorkoutHistory = [];
  // Reset the dayLog mock default (jest.clearAllMocks() also clears
  // .mockImplementation, so we reset it here).
  mockGetDayLog.mockReturnValue({
    targetCalories: 2000,
    targetProtein: 120,
    targetFats: 60,
    targetCarbs: 250,
    waterTargetMl: 2500,
    waterMl: 0,
    meals: [],
  });
});

// ═════════════════════ Phase A ════════════════════════════════════════════

describe('Phase A — core', () => {
  it('add_water → addWater(today, ml)', () => {
    executeCommand({ type: 'add_water', ml: 250 });
    expect(mockAddWater).toHaveBeenCalledWith('2026-05-12', 250);
  });

  it('next_exercise warns when no workout', () => {
    executeCommand({ type: 'next_exercise' });
    expect(mockNextExercise).not.toHaveBeenCalled();
    expect(mockToastWarn).toHaveBeenCalledWith('Нет активной тренировки');
  });

  it('complete_set targets first pending', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [{
          sets: [
            { weight: 80, reps: 8, completed: true },
            { weight: 85, reps: 6, completed: false },
          ],
        }],
      },
    };
    executeCommand({ type: 'complete_set' });
    expect(mockCompleteSet).toHaveBeenCalledWith(0, 1, { weight: 85, reps: 6 });
  });
});

// ═════════════════════ Phase D ════════════════════════════════════════════

describe('Phase D — workout extras', () => {
  beforeEach(() => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [{
          sets: [
            { weight: 80, reps: 8, completed: true },
            { weight: 85, reps: 6, completed: false },
          ],
        }],
      },
    };
  });

  it('prev_exercise → prevExercise', () => {
    executeCommand({ type: 'prev_exercise' });
    expect(mockPrevExercise).toHaveBeenCalledTimes(1);
  });

  it('finish_workout / cancel_workout', () => {
    executeCommand({ type: 'finish_workout' });
    expect(mockFinishWorkout).toHaveBeenCalledTimes(1);
    executeCommand({ type: 'cancel_workout' });
    expect(mockCancelWorkout).toHaveBeenCalledTimes(1);
  });

  it('remove_last_set refuses completed set silently', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: { exercises: [{ sets: [{ completed: true }] }] },
    };
    executeCommand({ type: 'remove_last_set' });
    expect(mockRemoveSet).not.toHaveBeenCalled();
    expect(mockToastInfo).toHaveBeenCalled();
  });

  it('set_weight / set_reps target first pending', () => {
    executeCommand({ type: 'set_weight', weight: 95 });
    expect(mockUpdateSetData).toHaveBeenCalledWith(0, 1, { weight: 95 });
    executeCommand({ type: 'set_reps', reps: 10 });
    expect(mockUpdateSetData).toHaveBeenCalledWith(0, 1, { reps: 10 });
  });

  it('set_rest_timer calls setRestTimer', () => {
    executeCommand({ type: 'set_rest_timer', seconds: 90 });
    expect(mockSetRestTimer).toHaveBeenCalledWith(90);
  });
});

describe('Phase D — targets / cardio / measurements', () => {
  it('set_calories_target preserves macros', () => {
    executeCommand({ type: 'set_calories_target', kcal: 2500 });
    expect(mockSetTargets).toHaveBeenCalledWith('2026-05-12', expect.objectContaining({
      calories: 2500,
      protein: 120,
    }));
  });

  it('log_cardio (run with km) estimates duration 6 min/km', () => {
    executeCommand({ type: 'log_cardio', kind: 'run', km: 5 });
    expect(mockAddCardio).toHaveBeenCalledWith({
      type: 'running',
      date: '2026-05-12',
      durationMinutes: 30,
      distanceKm: 5,
    });
  });

  it('log_measurement maps field correctly', () => {
    executeCommand({ type: 'log_measurement', field: 'waist', cm: 80 });
    expect(mockAddMeasurement).toHaveBeenCalledWith({ date: '2026-05-12', waist: 80 });
  });
});

// ═════════════════════ Phase E ════════════════════════════════════════════

describe('Phase E — log_meal_kcal', () => {
  it('creates a meal with kcal + estimated macros (25P/30F/45C split)', () => {
    executeCommand({ type: 'log_meal_kcal', mealType: 'breakfast', kcal: 400 });
    expect(mockAddMeal).toHaveBeenCalledWith('2026-05-12', expect.objectContaining({
      type: 'breakfast',
      totalCalories: 400,
      // 400 kcal × 0.25 / 4 = 25 protein
      totalProtein: 25,
      // 400 kcal × 0.30 / 9 ≈ 13 fats
      totalFats: 13,
      // 400 kcal × 0.45 / 4 = 45 carbs
      totalCarbs: 45,
      items: expect.arrayContaining([
        expect.objectContaining({ calories: 400, name: 'Свободная запись' }),
      ]),
    }));
  });

  it('+300 ккал → snack', () => {
    executeCommand({ type: 'log_meal_kcal', mealType: 'snack', kcal: 300 });
    expect(mockAddMeal).toHaveBeenCalledWith('2026-05-12', expect.objectContaining({
      type: 'snack',
      totalCalories: 300,
    }));
  });
});

describe('Phase E — reset_water / remove_last_meal', () => {
  it('reset_water → addWater(today, -current)', () => {
    mockGetDayLog.mockReturnValueOnce({
      targetCalories: 2000, targetProtein: 120, targetFats: 60, targetCarbs: 250,
      waterTargetMl: 2500, waterMl: 1500, meals: [],
    });
    executeCommand({ type: 'reset_water' });
    expect(mockAddWater).toHaveBeenCalledWith('2026-05-12', -1500);
  });

  it('reset_water → no-op when already 0', () => {
    executeCommand({ type: 'reset_water' });
    expect(mockAddWater).not.toHaveBeenCalled();
    expect(mockToastInfo).toHaveBeenCalled();
  });

  it('remove_last_meal → removeMeal(today, last.id)', () => {
    mockGetDayLog.mockReturnValueOnce({
      targetCalories: 2000, targetProtein: 120, targetFats: 60, targetCarbs: 250,
      waterTargetMl: 2500, waterMl: 0,
      meals: [{ id: 'm1', type: 'breakfast' }, { id: 'm2', type: 'lunch' }],
    });
    executeCommand({ type: 'remove_last_meal' });
    expect(mockRemoveMeal).toHaveBeenCalledWith('2026-05-12', 'm2');
  });
});

describe('Phase E — log_sleep', () => {
  it('7h 30min → bedtime 23:00, wake 06:30', () => {
    executeCommand({ type: 'log_sleep', hours: 7, minutes: 30 });
    expect(mockAddSleep).toHaveBeenCalledWith({
      date: '2026-05-12',
      bedtime: '23:00',
      wakeTime: '06:30',
    });
  });

  it('8h → bedtime 23:00, wake 07:00', () => {
    executeCommand({ type: 'log_sleep', hours: 8, minutes: 0 });
    expect(mockAddSleep).toHaveBeenCalledWith({
      date: '2026-05-12',
      bedtime: '23:00',
      wakeTime: '07:00',
    });
  });

  it('rejects 0/0 (warning, no log)', () => {
    executeCommand({ type: 'log_sleep', hours: 0, minutes: 0 });
    expect(mockAddSleep).not.toHaveBeenCalled();
  });
});

describe('Phase E — theme / settings', () => {
  it('set_theme', () => {
    executeCommand({ type: 'set_theme', mode: 'dark' });
    expect(mockSetThemeMode).toHaveBeenCalledWith('dark');
    executeCommand({ type: 'set_theme', mode: 'light' });
    expect(mockSetThemeMode).toHaveBeenCalledWith('light');
  });

  it('toggle_notifications', () => {
    executeCommand({ type: 'toggle_notifications', enabled: true });
    expect(mockSetNotificationsEnabled).toHaveBeenCalledWith(true);
    executeCommand({ type: 'toggle_notifications', enabled: false });
    expect(mockSetNotificationsEnabled).toHaveBeenCalledWith(false);
  });

  it('toggle_water_reminders', () => {
    executeCommand({ type: 'toggle_water_reminders', enabled: true });
    expect(mockSetWaterRemindersEnabled).toHaveBeenCalledWith(true);
  });
});

describe('Phase E — schedule_rest_today', () => {
  it('calls setWeekPlanDay(todayDow, null)', () => {
    // Don't pin the exact dow value because it depends on local time;
    // just ensure setWeekPlanDay was called with a valid Mon0 dow + null.
    executeCommand({ type: 'schedule_rest_today' });
    expect(mockSetWeekPlanDay).toHaveBeenCalledTimes(1);
    const [dow, entry] = mockSetWeekPlanDay.mock.calls[0];
    expect(dow).toBeGreaterThanOrEqual(0);
    expect(dow).toBeLessThanOrEqual(6);
    expect(entry).toBeNull();
  });
});

describe('Phase E — stats (read-only info toasts)', () => {
  it('stats_water shows progress + target', () => {
    mockGetDayLog.mockReturnValueOnce({
      targetCalories: 2000, targetProtein: 120, targetFats: 60, targetCarbs: 250,
      waterTargetMl: 2500, waterMl: 1000, meals: [],
    });
    executeCommand({ type: 'stats_water' });
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('1000'));
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('2500'));
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('40%'));
  });

  it('stats_meal aggregates totals across meals', () => {
    mockGetDayLog.mockReturnValueOnce({
      targetCalories: 2000, targetProtein: 120, targetFats: 60, targetCarbs: 250,
      waterTargetMl: 2500, waterMl: 0,
      meals: [
        { totalCalories: 500, totalProtein: 30 },
        { totalCalories: 300, totalProtein: 20 },
      ],
    });
    executeCommand({ type: 'stats_meal' });
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('800'));
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('50'));
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('2'));
  });

  it('stats_progress counts completed workouts + total tons', () => {
    mockWorkoutHistory = [
      { id: '1', completedAt: '2026-05-10', totalVolume: 5000 },
      { id: '2', completedAt: null, totalVolume: 0 },
      { id: '3', completedAt: '2026-05-11', totalVolume: 6000 },
    ];
    executeCommand({ type: 'stats_progress' });
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('2'));
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('11')); // 11.0 т
  });

  it('stats_last_workout picks the most recent completed', () => {
    mockWorkoutHistory = [
      { id: '1', name: 'A', completedAt: '2026-05-10T12:00:00Z', exercises: [{}, {}], durationMinutes: 45 },
      { id: '2', name: 'B', completedAt: '2026-05-11T12:00:00Z', exercises: [{}], durationMinutes: 30 },
    ];
    executeCommand({ type: 'stats_last_workout' });
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('B'));
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('1'));
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('30'));
  });

  it('stats_last_workout handles empty history', () => {
    mockWorkoutHistory = [];
    executeCommand({ type: 'stats_last_workout' });
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('ещё нет'));
  });
});
