/**
 * Regression tests for bugs found in useNutritionStore
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services', () => ({
  nutritionService: {
    addMeal: jest.fn(() => Promise.resolve({})),
    getMealsByDate: jest.fn(() => Promise.resolve([])),
    updateMeal: jest.fn(() => Promise.resolve({})),
    deleteMeal: jest.fn(() => Promise.resolve()),
  },
}));

import { useNutritionStore } from '../store/useNutritionStore';

beforeEach(() => {
  useNutritionStore.setState({
    dailyLog: {},
    defaultTargets: { calories: 2000, protein: 150, fats: 70, carbs: 250, waterTargetMl: 2500 },
    savedFoods: [],
  });
});

describe('syncMealsFromServer merge bug', () => {
  test('BUG FIX: keeps local-only meals when syncing from server (was replacing)', async () => {
    // Previously: { ...dayLog, meals } -- replaced all meals with server ones
    // Fix: keep meals with 'meal-' prefix IDs that aren't on server
    const localMeal = {
      id: 'meal-local-1', type: 'lunch' as const,
      totalCalories: 500, totalProtein: 30, totalFats: 20, totalCarbs: 50,
      items: [], createdAt: new Date().toISOString(),
    };
    useNutritionStore.setState({
      dailyLog: {
        '2026-04-08': {
          date: '2026-04-08',
          meals: [localMeal],
          waterMl: 0,
          targetCalories: 2000,
          targetProtein: 150,
          targetFats: 70,
          targetCarbs: 250,
          waterTargetMl: 2500,
        },
      },
      defaultTargets: { calories: 2000, protein: 150, fats: 70, carbs: 250, waterTargetMl: 2500 },
    });

    const serverMeal = {
      id: 'uuid-server-1', type: 'breakfast' as const,
      totalCalories: 300, totalProtein: 20, totalFats: 10, totalCarbs: 40,
      items: [], createdAt: new Date().toISOString(),
    };
    const { nutritionService } = require('../services');
    nutritionService.getMealsByDate.mockResolvedValueOnce([serverMeal]);

    await useNutritionStore.getState().syncMealsFromServer('2026-04-08');

    const dayLog = useNutritionStore.getState().getDayLog('2026-04-08');
    expect(dayLog.meals.length).toBe(2); // Both local AND server
    expect(dayLog.meals.find((m: any) => m.id === 'meal-local-1')).toBeDefined();
    expect(dayLog.meals.find((m: any) => m.id === 'uuid-server-1')).toBeDefined();
  });

  test('sync with empty server response keeps existing meals', async () => {
    const localMeal = {
      id: 'meal-local-2', type: 'dinner' as const,
      totalCalories: 600, totalProtein: 40, totalFats: 25, totalCarbs: 60,
      items: [], createdAt: new Date().toISOString(),
    };
    useNutritionStore.setState({
      dailyLog: {
        '2026-04-08': {
          date: '2026-04-08',
          meals: [localMeal],
          waterMl: 500,
          targetCalories: 2000,
          targetProtein: 150,
          targetFats: 70,
          targetCarbs: 250,
          waterTargetMl: 2500,
        },
      },
    });

    const { nutritionService } = require('../services');
    nutritionService.getMealsByDate.mockResolvedValueOnce([]);

    await useNutritionStore.getState().syncMealsFromServer('2026-04-08');

    // Empty server response should not clear local meals
    const dayLog = useNutritionStore.getState().getDayLog('2026-04-08');
    expect(dayLog.meals.length).toBe(1);
    expect(dayLog.meals[0].id).toBe('meal-local-2');
  });

  test('sync failure keeps local data intact', async () => {
    const localMeal = {
      id: 'meal-local-3', type: 'breakfast' as const,
      totalCalories: 400, totalProtein: 25, totalFats: 15, totalCarbs: 45,
      items: [], createdAt: new Date().toISOString(),
    };
    useNutritionStore.setState({
      dailyLog: {
        '2026-04-08': {
          date: '2026-04-08',
          meals: [localMeal],
          waterMl: 0,
          targetCalories: 2000,
          targetProtein: 150,
          targetFats: 70,
          targetCarbs: 250,
          waterTargetMl: 2500,
        },
      },
    });

    const { nutritionService } = require('../services');
    nutritionService.getMealsByDate.mockRejectedValueOnce(new Error('Network error'));

    await useNutritionStore.getState().syncMealsFromServer('2026-04-08');

    const dayLog = useNutritionStore.getState().getDayLog('2026-04-08');
    expect(dayLog.meals.length).toBe(1);
    expect(dayLog.meals[0].id).toBe('meal-local-3');
  });
});

describe('water tracking', () => {
  test('water accumulates correctly', () => {
    useNutritionStore.setState({
      dailyLog: {},
      defaultTargets: { calories: 2000, protein: 150, fats: 70, carbs: 250, waterTargetMl: 2500 },
    });
    useNutritionStore.getState().addWater('2026-04-08', 250);
    useNutritionStore.getState().addWater('2026-04-08', 500);
    useNutritionStore.getState().addWater('2026-04-08', 250);
    expect(useNutritionStore.getState().getDayLog('2026-04-08').waterMl).toBe(1000);
  });

  test('water tracking is per-date', () => {
    useNutritionStore.getState().addWater('2026-04-08', 500);
    useNutritionStore.getState().addWater('2026-04-09', 300);
    expect(useNutritionStore.getState().getDayLog('2026-04-08').waterMl).toBe(500);
    expect(useNutritionStore.getState().getDayLog('2026-04-09').waterMl).toBe(300);
  });
});

describe('getDayLog defaults', () => {
  test('returns default targets for new date', () => {
    useNutritionStore.setState({
      defaultTargets: { calories: 2500, protein: 180, fats: 90, carbs: 300, waterTargetMl: 3000 },
    });
    const dayLog = useNutritionStore.getState().getDayLog('2026-04-10');
    expect(dayLog.targetCalories).toBe(2500);
    expect(dayLog.targetProtein).toBe(180);
    expect(dayLog.meals).toEqual([]);
    expect(dayLog.waterMl).toBe(0);
  });

  test('BUG FIX: fills missing targets from defaults for old persisted entries', () => {
    // Old AsyncStorage data may lack targetFats/targetCarbs — getDayLog must fill from defaultTargets
    useNutritionStore.setState({
      dailyLog: {
        '2026-01-01': {
          date: '2026-01-01',
          meals: [],
          waterMl: 0,
          targetCalories: 2000,
          targetProtein: 150,
          // targetFats and targetCarbs intentionally missing (old format)
        } as any,
      },
      defaultTargets: { calories: 2000, protein: 150, fats: 80, carbs: 300, waterTargetMl: 2500 },
    });
    const dayLog = useNutritionStore.getState().getDayLog('2026-01-01');
    expect(dayLog.targetFats).toBe(80);
    expect(dayLog.targetCarbs).toBe(300);
    expect(dayLog.waterTargetMl).toBe(2500);
  });
});

describe('syncMealsFromServer sort with missing createdAt', () => {
  test('BUG FIX: does not crash when merged meals have undefined createdAt', async () => {
    const localMeal = {
      id: 'meal-local-no-date',
      type: 'snack' as const,
      totalCalories: 100, totalProtein: 5, totalFats: 5, totalCarbs: 10,
      items: [],
      // createdAt intentionally missing (old format)
    } as any;
    useNutritionStore.setState({
      dailyLog: {
        '2026-04-12': {
          date: '2026-04-12', meals: [localMeal], waterMl: 0,
          targetCalories: 2000, targetProtein: 150, targetFats: 70, targetCarbs: 250, waterTargetMl: 2500,
        },
      },
    });

    const serverMeal = {
      id: 'uuid-server-no-date',
      type: 'breakfast' as const,
      totalCalories: 300, totalProtein: 20, totalFats: 10, totalCarbs: 40,
      items: [],
      // createdAt intentionally missing
    } as any;
    const { nutritionService } = require('../services');
    nutritionService.getMealsByDate.mockResolvedValueOnce([serverMeal]);

    // Should not throw
    await expect(useNutritionStore.getState().syncMealsFromServer('2026-04-12')).resolves.toBeUndefined();
    const dayLog = useNutritionStore.getState().getDayLog('2026-04-12');
    expect(dayLog.meals.length).toBe(2);
  });
});

describe('saveFoodItem deduplication', () => {
  beforeEach(() => {
    useNutritionStore.setState({ savedFoods: [] });
  });

  test('prevents duplicate IDs', () => {
    const food = { id: 'saved-chicken', name: 'Chicken', calories: 165, protein: 31, fats: 3.6, carbs: 0, weightGrams: 100 };
    useNutritionStore.getState().saveFoodItem(food);
    useNutritionStore.getState().saveFoodItem(food);
    expect(useNutritionStore.getState().savedFoods.length).toBe(1);
  });

  test('allows same-name foods with different IDs', () => {
    const food1 = { id: 'saved-chicken-1', name: 'Chicken', calories: 165, protein: 31, fats: 3.6, carbs: 0, weightGrams: 100 };
    const food2 = { id: 'saved-chicken-2', name: 'Chicken', calories: 180, protein: 30, fats: 5, carbs: 0, weightGrams: 100 };
    useNutritionStore.getState().saveFoodItem(food1);
    useNutritionStore.getState().saveFoodItem(food2);
    expect(useNutritionStore.getState().savedFoods.length).toBe(2);
  });

  test('caps saved foods at 30', () => {
    for (let i = 0; i < 35; i++) {
      useNutritionStore.getState().saveFoodItem({ id: `saved-food-${i}`, name: `Food ${i}`, calories: 100, protein: 10, fats: 5, carbs: 10, weightGrams: 100 });
    }
    expect(useNutritionStore.getState().savedFoods.length).toBe(30);
  });
});

describe('cleanupOldLogs', () => {
  test('removes logs older than keepDays', () => {
    const today = new Date();
    const recent = new Date(today); recent.setDate(today.getDate() - 5);
    const old = new Date(today); old.setDate(today.getDate() - 100);
    const recentStr = recent.toISOString().split('T')[0];
    const oldStr = old.toISOString().split('T')[0];

    useNutritionStore.setState({
      dailyLog: {
        [recentStr]: { date: recentStr, meals: [], waterMl: 0, targetCalories: 2000, targetProtein: 150, targetFats: 70, targetCarbs: 250, waterTargetMl: 2500 },
        [oldStr]: { date: oldStr, meals: [], waterMl: 0, targetCalories: 2000, targetProtein: 150, targetFats: 70, targetCarbs: 250, waterTargetMl: 2500 },
      },
    });

    useNutritionStore.getState().cleanupOldLogs(90);

    const state = useNutritionStore.getState();
    expect(state.dailyLog[recentStr]).toBeDefined();
    expect(state.dailyLog[oldStr]).toBeUndefined();
  });

  test('keeps all logs within keepDays', () => {
    const today = new Date();
    const dates = [0, 10, 30, 60, 89].map((offset) => {
      const d = new Date(today); d.setDate(today.getDate() - offset);
      return d.toISOString().split('T')[0];
    });
    const dailyLog: any = {};
    dates.forEach((d) => {
      dailyLog[d] = { date: d, meals: [], waterMl: 0, targetCalories: 2000, targetProtein: 150, targetFats: 70, targetCarbs: 250, waterTargetMl: 2500 };
    });

    useNutritionStore.setState({ dailyLog });
    useNutritionStore.getState().cleanupOldLogs(90);

    const state = useNutritionStore.getState();
    dates.forEach((d) => {
      expect(state.dailyLog[d]).toBeDefined();
    });
  });
});
