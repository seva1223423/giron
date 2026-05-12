/**
 * useAIChatCommands — store-mutation + service-call integration pins.
 * The parser is locked in parseChatCommand.test.ts; here we pin
 * side-effects for every executable command, including Phase F's
 * name-resolved actions (activate program / log body weight / swap
 * exercise / add recipe).
 */

// ── Workout store mocks ─────────────────────────────────────────────────
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
const mockUpdateProgram = jest.fn(async () => undefined);
const mockReplaceExercise = jest.fn(() => true);

// ── Nutrition store mocks ───────────────────────────────────────────────
const mockAddWater = jest.fn();
const mockSetTargets = jest.fn();
const mockAddMeal = jest.fn();
const mockRemoveMeal = jest.fn();
const mockSyncMeals = jest.fn(async () => undefined);
const mockGetDayLog = jest.fn(() => ({
  targetCalories: 2000,
  targetProtein: 120,
  targetFats: 60,
  targetCarbs: 250,
  waterTargetMl: 2500,
  waterMl: 0,
  meals: [],
}));

// ── Other store / service mocks ─────────────────────────────────────────
const mockAddCardio = jest.fn();
const mockAddMeasurement = jest.fn();
const mockAddSleep = jest.fn();
const mockSetNotificationsEnabled = jest.fn();
const mockSetWaterRemindersEnabled = jest.fn();
const mockSetThemeMode = jest.fn();
const mockFetchProfile = jest.fn(async () => undefined);
const mockUserAddWeight = jest.fn(async (_kg: number) => ({ id: 'bw1' }));
const mockRecipeAddToDiary = jest.fn(async (_id: string, _params: unknown) => ({ id: 'm1' }));

// ── Toast ───────────────────────────────────────────────────────────────
const mockToastSuccess = jest.fn();
const mockToastWarn = jest.fn();
const mockToastInfo = jest.fn();
const mockToastError = jest.fn();

// ── State holders (mutable across tests) ────────────────────────────────
let mockActiveWorkout: unknown = null;
let mockWorkoutHistory: unknown[] = [];
let mockPrograms: Array<{ id: string; name: string }> = [];
let mockCuratedRecipes: Array<{ id: string; name: string }> = [];
let mockMineRecipes: Array<{ id: string; name: string }> = [];

jest.mock('../store', () => ({
  useWorkoutStore: {
    getState: () => ({
      activeWorkout: mockActiveWorkout,
      workoutHistory: mockWorkoutHistory,
      programs: mockPrograms,
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
      updateProgram: mockUpdateProgram,
      replaceExerciseInWorkout: mockReplaceExercise,
    }),
  },
  useNutritionStore: {
    getState: () => ({
      addWater: mockAddWater,
      setTargets: mockSetTargets,
      addMeal: mockAddMeal,
      removeMeal: mockRemoveMeal,
      getDayLog: mockGetDayLog,
      syncMealsFromServer: mockSyncMeals,
    }),
  },
  useCardioStore: {
    getState: () => ({ addSession: mockAddCardio }),
  },
  useAuthStore: {
    getState: () => ({ fetchProfile: mockFetchProfile }),
  },
}));

jest.mock('../store/useMeasurementsStore', () => ({
  useMeasurementsStore: { getState: () => ({ addEntry: mockAddMeasurement }) },
}));

jest.mock('../store/useSleepStore', () => ({
  useSleepStore: { getState: () => ({ addEntry: mockAddSleep }) },
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
  useThemeStore: { getState: () => ({ setMode: mockSetThemeMode }) },
}));

jest.mock('../store/useRecipesStore', () => ({
  useRecipesStore: {
    getState: () => ({
      curated: mockCuratedRecipes,
      mine: mockMineRecipes,
    }),
  },
}));

jest.mock('../services/userService', () => ({
  userService: { addWeight: (kg: number) => mockUserAddWeight(kg) },
}));

jest.mock('../services/recipeService', () => ({
  recipeService: {
    addToDiary: (id: string, params: unknown) => mockRecipeAddToDiary(id, params),
  },
}));

// Provide a small static exercise library for swap_exercise tests.
jest.mock('../data/exercises', () => ({
  exercises: [
    { id: 'bench-press', name: 'Жим штанги лёжа' },
    { id: 'incline-bench-press', name: 'Жим штанги на наклонной' },
    { id: 'squat', name: 'Приседания со штангой' },
  ],
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
  mockPrograms = [];
  mockCuratedRecipes = [];
  mockMineRecipes = [];
  mockGetDayLog.mockReturnValue({
    targetCalories: 2000,
    targetProtein: 120,
    targetFats: 60,
    targetCarbs: 250,
    waterTargetMl: 2500,
    waterMl: 0,
    meals: [],
  });
  mockFinishWorkout.mockReturnValue({ id: 'w1' });
  mockReplaceExercise.mockReturnValue(true);
  mockUpdateProgram.mockResolvedValue(undefined);
  mockUserAddWeight.mockResolvedValue({ id: 'bw1' });
  mockRecipeAddToDiary.mockResolvedValue({ id: 'm1' });
  mockSyncMeals.mockResolvedValue(undefined);
  mockFetchProfile.mockResolvedValue(undefined);
});

// ═════════════════════ Phase A/D/E smoke ═════════════════════════════════

describe('Phase A/D/E — smoke', () => {
  it('add_water → addWater', () => {
    executeCommand({ type: 'add_water', ml: 250 });
    expect(mockAddWater).toHaveBeenCalledWith('2026-05-12', 250);
  });

  it('next_exercise warns when no workout', () => {
    executeCommand({ type: 'next_exercise' });
    expect(mockNextExercise).not.toHaveBeenCalled();
    expect(mockToastWarn).toHaveBeenCalled();
  });

  it('log_measurement maps field', () => {
    executeCommand({ type: 'log_measurement', field: 'waist', cm: 80 });
    expect(mockAddMeasurement).toHaveBeenCalledWith({ date: '2026-05-12', waist: 80 });
  });

  it('log_meal_kcal creates meal with auto-macros', () => {
    executeCommand({ type: 'log_meal_kcal', mealType: 'breakfast', kcal: 400 });
    expect(mockAddMeal).toHaveBeenCalledWith('2026-05-12', expect.objectContaining({
      type: 'breakfast',
      totalCalories: 400,
    }));
  });

  it('stats_water shows progress + target', () => {
    mockGetDayLog.mockReturnValueOnce({
      targetCalories: 2000, targetProtein: 120, targetFats: 60, targetCarbs: 250,
      waterTargetMl: 2500, waterMl: 1000, meals: [],
    });
    executeCommand({ type: 'stats_water' });
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('40%'));
  });
});

// ═════════════════════ Phase F — activate_program ═════════════════════════

describe('Phase F — activate_program', () => {
  it('exact-match name → updateProgram(id, {isActive:true})', async () => {
    mockPrograms = [
      { id: 'p1', name: 'Сила' },
      { id: 'p2', name: 'Кардио' },
    ];
    executeCommand({ type: 'activate_program', name: 'Сила' });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockUpdateProgram).toHaveBeenCalledWith('p1', { isActive: true });
    expect(mockToastSuccess).toHaveBeenCalledWith('Программа: Сила');
  });

  it('substring-match picks first hit', async () => {
    mockPrograms = [
      { id: 'p1', name: 'Верх — низ сплит' },
      { id: 'p2', name: 'Верх изоляция' },
    ];
    executeCommand({ type: 'activate_program', name: 'верх' });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockUpdateProgram).toHaveBeenCalledWith('p1', { isActive: true });
  });

  it('case-insensitive', async () => {
    mockPrograms = [{ id: 'p1', name: 'СИЛА И МАССА' }];
    executeCommand({ type: 'activate_program', name: 'сила' });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockUpdateProgram).toHaveBeenCalledWith('p1', { isActive: true });
  });

  it('no match → warn with available list', async () => {
    mockPrograms = [{ id: 'p1', name: 'Сила' }, { id: 'p2', name: 'Кардио' }];
    executeCommand({ type: 'activate_program', name: 'Йога' });
    await Promise.resolve();
    expect(mockUpdateProgram).not.toHaveBeenCalled();
    expect(mockToastWarn).toHaveBeenCalledWith(expect.stringContaining('Сила'));
  });

  it('empty program list → warn "Программ нет"', async () => {
    mockPrograms = [];
    executeCommand({ type: 'activate_program', name: 'Сила' });
    await Promise.resolve();
    expect(mockToastWarn).toHaveBeenCalledWith('Программ нет');
  });

  it('updateProgram rejection → error toast', async () => {
    mockPrograms = [{ id: 'p1', name: 'Сила' }];
    mockUpdateProgram.mockRejectedValueOnce(new Error('network'));
    executeCommand({ type: 'activate_program', name: 'Сила' });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockToastError).toHaveBeenCalledWith('Не удалось активировать программу');
  });
});

// ═════════════════════ Phase F — log_body_weight ═════════════════════════

describe('Phase F — log_body_weight', () => {
  it('calls userService.addWeight + fetchProfile + success toast', async () => {
    executeCommand({ type: 'log_body_weight', kg: 78.2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockUserAddWeight).toHaveBeenCalledWith(78.2);
    expect(mockFetchProfile).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith('Вес тела: 78.2 кг');
  });

  it('addWeight rejection → error toast', async () => {
    mockUserAddWeight.mockRejectedValueOnce(new Error('500'));
    executeCommand({ type: 'log_body_weight', kg: 78 });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockToastError).toHaveBeenCalledWith('Не удалось сохранить вес');
  });
});

// ═════════════════════ Phase F — swap_exercise ═════════════════════════════

describe('Phase F — swap_exercise', () => {
  it('replaces current exercise when from matches current name', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [{ exercise: { name: 'Жим штанги лёжа' }, sets: [] }],
      },
    };
    // toName must substring-match a library exercise — "наклонной" appears
    // verbatim in "Жим штанги на наклонной". Russian case endings vary
    // (наклонный/наклонной/наклонную) so users get the most reliable hits
    // with the noun-form of the title.
    executeCommand({ type: 'swap_exercise', fromName: 'жим', toName: 'наклонной' });
    expect(mockReplaceExercise).toHaveBeenCalledWith(0,
      expect.objectContaining({ id: 'incline-bench-press' }));
    expect(mockToastSuccess).toHaveBeenCalledWith('Жим штанги на наклонной');
  });

  it('warns when no active workout', () => {
    executeCommand({ type: 'swap_exercise', fromName: 'жим', toName: 'наклонный' });
    expect(mockReplaceExercise).not.toHaveBeenCalled();
    expect(mockToastWarn).toHaveBeenCalledWith('Нет активной тренировки');
  });

  it('rejects when "from" does not match current exercise', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [{ exercise: { name: 'Приседания со штангой' }, sets: [] }],
      },
    };
    executeCommand({ type: 'swap_exercise', fromName: 'жим', toName: 'наклонный' });
    expect(mockReplaceExercise).not.toHaveBeenCalled();
    expect(mockToastWarn).toHaveBeenCalledWith(expect.stringContaining('жим'));
  });

  it('warns when "to" exercise not found in library', () => {
    mockActiveWorkout = {
      currentExerciseIndex: 0,
      workout: {
        exercises: [{ exercise: { name: 'Жим штанги лёжа' }, sets: [] }],
      },
    };
    executeCommand({ type: 'swap_exercise', fromName: 'жим', toName: 'космический жим' });
    expect(mockReplaceExercise).not.toHaveBeenCalled();
    expect(mockToastWarn).toHaveBeenCalledWith(expect.stringContaining('космический'));
  });
});

// ═════════════════════ Phase F — add_recipe ═════════════════════════════

describe('Phase F — add_recipe', () => {
  it('matches curated + calls addToDiary + syncs meals', async () => {
    mockCuratedRecipes = [{ id: 'r1', name: 'Куриная грудка с рисом' }];
    // Query must substring-match the recipe name. Russian noun forms
    // differ (курица/куриная) — "куриная" appears verbatim in the recipe,
    // so it's a reliable match. "грудка" also works.
    executeCommand({ type: 'add_recipe', name: 'куриная грудка' });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockRecipeAddToDiary).toHaveBeenCalledWith('r1', expect.objectContaining({
      date: '2026-05-12',
      servings: 1,
    }));
    expect(mockSyncMeals).toHaveBeenCalledWith('2026-05-12');
    expect(mockToastSuccess).toHaveBeenCalledWith('+ Куриная грудка с рисом');
  });

  it('matches user-created recipes (mine list)', async () => {
    mockMineRecipes = [{ id: 'r-user-1', name: 'Моя овсянка' }];
    executeCommand({ type: 'add_recipe', name: 'овсянка' });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockRecipeAddToDiary).toHaveBeenCalledWith('r-user-1', expect.any(Object));
  });

  it('warns when recipe not found', async () => {
    mockCuratedRecipes = [{ id: 'r1', name: 'Овсянка' }];
    executeCommand({ type: 'add_recipe', name: 'космическая еда' });
    await Promise.resolve();
    expect(mockRecipeAddToDiary).not.toHaveBeenCalled();
    expect(mockToastWarn).toHaveBeenCalledWith(expect.stringContaining('космическая еда'));
  });

  it('addToDiary rejection → error toast', async () => {
    mockCuratedRecipes = [{ id: 'r1', name: 'Овсянка' }];
    mockRecipeAddToDiary.mockRejectedValueOnce(new Error('500'));
    executeCommand({ type: 'add_recipe', name: 'овсянка' });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockToastError).toHaveBeenCalledWith('Не удалось добавить рецепт');
  });
});
