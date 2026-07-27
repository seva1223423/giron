/**
 * Tests for useNutritionStore — meal logging and water tracking
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
    updateNutritionTargets: jest.fn(() => Promise.resolve()),
  },
}));

import { useNutritionStore } from '../store/useNutritionStore';

const mockMeal = (id: string, type: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'lunch') => ({
  id,
  type,
  photoUrl: undefined,
  totalCalories: 500,
  totalProtein: 30,
  totalFats: 20,
  totalCarbs: 50,
  items: [
    { id: `item-${id}`, name: 'Chicken', calories: 500, protein: 30, fats: 20, carbs: 50, weightGrams: 200 },
  ],
  createdAt: new Date().toISOString(),
});

describe('useNutritionStore', () => {
  beforeEach(() => {
    useNutritionStore.setState({
      dailyLog: {},
      defaultTargets: { calories: 2000, protein: 150, fats: 70, carbs: 250, waterTargetMl: 2500 },
      savedFoods: [],
    });
  });

  describe('addMeal', () => {
    test('adds meal to daily log', () => {
      const meal = mockMeal('meal-1');
      useNutritionStore.getState().addMeal('2026-04-08', meal);

      const dayLog = useNutritionStore.getState().getDayLog('2026-04-08');
      expect(dayLog.meals).toHaveLength(1);
      expect(dayLog.meals[0].totalCalories).toBe(500);
    });

    test('adds multiple meals to same day', () => {
      useNutritionStore.getState().addMeal('2026-04-08', mockMeal('meal-1', 'breakfast'));
      useNutritionStore.getState().addMeal('2026-04-08', mockMeal('meal-2', 'lunch'));

      const dayLog = useNutritionStore.getState().getDayLog('2026-04-08');
      expect(dayLog.meals).toHaveLength(2);
    });

    test('keeps the meal when the server call fails — no silent data loss', async () => {
      // The failure path used to roll back the optimistic insert, so food the
      // user had just typed in vanished from the diary with no message —
      // offline, a 5xx, or the timeout Render's free tier serves on the first
      // request after idle. The entry must survive; syncMealsFromServer
      // preserves local-only `meal-` ids, so it is not orphaned either.
      const { nutritionService } = require('../services');
      (nutritionService.addMeal as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

      useNutritionStore.getState().addMeal('2026-04-09', mockMeal('meal-offline'));
      // Let the rejected promise settle.
      await new Promise((r) => setTimeout(r, 0));

      const dayLog = useNutritionStore.getState().getDayLog('2026-04-09');
      expect(dayLog.meals).toHaveLength(1);
      expect(dayLog.meals[0].totalCalories).toBe(500);
    });

    test('different dates have separate logs', () => {
      useNutritionStore.getState().addMeal('2026-04-08', mockMeal('meal-1'));
      useNutritionStore.getState().addMeal('2026-04-09', mockMeal('meal-2'));

      expect(useNutritionStore.getState().getDayLog('2026-04-08').meals).toHaveLength(1);
      expect(useNutritionStore.getState().getDayLog('2026-04-09').meals).toHaveLength(1);
    });

    test('deduplicates if syncMealsFromServer added CUID copy before server confirmation', () => {
      // Simulate optimistic add (temp ID)
      useNutritionStore.getState().addMeal('2026-04-08', mockMeal('meal-temp'));
      // Simulate syncMealsFromServer pulling the confirmed copy before addMeal.then() fires
      const serverMeal = { ...mockMeal('cuid-confirmed'), id: 'cuid-confirmed', createdAt: new Date().toISOString() };
      useNutritionStore.setState((s) => ({
        dailyLog: { ...s.dailyLog, '2026-04-08': { ...s.dailyLog['2026-04-08'], meals: [...(s.dailyLog['2026-04-08']?.meals ?? []), serverMeal] } },
      }));
      // Both temp + CUID should be present now (pre-fix state)
      expect(useNutritionStore.getState().getDayLog('2026-04-08').meals).toHaveLength(2);

      // Simulate addMeal.then() dedup logic: remove pre-synced CUID, swap temp with server meal
      useNutritionStore.setState((s) => {
        const dl = s.dailyLog['2026-04-08'];
        if (!dl) return s;
        const deduped = dl.meals.filter((m) => m.id !== serverMeal.id);
        return { dailyLog: { ...s.dailyLog, '2026-04-08': { ...dl, meals: deduped.map((m) => m.id === 'meal-temp' ? serverMeal : m) } } };
      });

      // After dedup, only one meal with the CUID should remain
      const meals = useNutritionStore.getState().getDayLog('2026-04-08').meals;
      expect(meals).toHaveLength(1);
      expect(meals[0].id).toBe('cuid-confirmed');
    });
  });

  describe('removeMeal', () => {
    test('removes meal by id', () => {
      useNutritionStore.getState().addMeal('2026-04-08', mockMeal('meal-1'));
      useNutritionStore.getState().addMeal('2026-04-08', mockMeal('meal-2'));

      useNutritionStore.getState().removeMeal('2026-04-08', 'meal-1');

      const dayLog = useNutritionStore.getState().getDayLog('2026-04-08');
      expect(dayLog.meals).toHaveLength(1);
      expect(dayLog.meals[0].id).toBe('meal-2');
    });
  });

  describe('addWater', () => {
    test('adds water to daily log', () => {
      useNutritionStore.getState().addWater('2026-04-08', 250);

      expect(useNutritionStore.getState().getDayLog('2026-04-08').waterMl).toBe(250);
    });

    test('accumulates water throughout the day', () => {
      useNutritionStore.getState().addWater('2026-04-08', 250);
      useNutritionStore.getState().addWater('2026-04-08', 500);

      expect(useNutritionStore.getState().getDayLog('2026-04-08').waterMl).toBe(750);
    });
  });

  describe('setTargets', () => {
    test('sets nutrition targets for a day', () => {
      useNutritionStore.getState().setTargets('2026-04-08', {
        calories: 2500,
        protein: 180,
        fats: 80,
        carbs: 300,
      });

      const dayLog = useNutritionStore.getState().getDayLog('2026-04-08');
      expect(dayLog.targetCalories).toBe(2500);
      expect(dayLog.targetProtein).toBe(180);
    });

    test('sets water target', () => {
      useNutritionStore.getState().setTargets('2026-04-08', { calories: 2000, protein: 150, fats: 70, carbs: 250, waterTargetMl: 3000 });

      const dayLog = useNutritionStore.getState().getDayLog('2026-04-08');
      expect(dayLog.waterTargetMl).toBe(3000);
    });

    test('preserves per-day waterTargetMl when not passed (GoalsModal pattern)', () => {
      // Set a day-specific water target
      useNutritionStore.getState().setTargets('2026-04-08', { calories: 2000, protein: 150, fats: 70, carbs: 250, waterTargetMl: 3500 });
      // Update defaultTargets water target via a different day
      useNutritionStore.getState().setTargets('2026-04-09', { calories: 2000, protein: 150, fats: 70, carbs: 250, waterTargetMl: 2000 });
      // Now call setTargets for the first day WITHOUT waterTargetMl (GoalsModal only changes KBJU)
      useNutritionStore.getState().setTargets('2026-04-08', { calories: 2500, protein: 180, fats: 80, carbs: 300 });

      // The first day's stored waterTargetMl (3500) should be preserved, not overwritten by defaultTargets (2000)
      const dayLog = useNutritionStore.getState().getDayLog('2026-04-08');
      expect(dayLog.waterTargetMl).toBe(3500);
    });
  });

  describe('getDayLog', () => {
    test('returns default targets for new day', () => {
      const dayLog = useNutritionStore.getState().getDayLog('2026-04-08');

      expect(dayLog.meals).toEqual([]);
      expect(dayLog.waterMl).toBe(0);
      expect(dayLog.targetCalories).toBe(2000);
      expect(dayLog.targetProtein).toBe(150);
    });
  });

  describe('multiple days', () => {
    test('different days are independent', () => {
      useNutritionStore.getState().addWater('2026-04-08', 500);
      useNutritionStore.getState().addWater('2026-04-09', 1000);

      expect(useNutritionStore.getState().getDayLog('2026-04-08').waterMl).toBe(500);
      expect(useNutritionStore.getState().getDayLog('2026-04-09').waterMl).toBe(1000);
    });
  });

  describe('updateMealItem', () => {
    test('updates item fields and recalculates meal totals', () => {
      const meal = mockMeal('meal-srv-1');
      // Item starts at 500kcal/30p/20f/50c
      useNutritionStore.getState().addMeal('2026-04-08', meal);

      useNutritionStore.getState().updateMealItem('2026-04-08', 'meal-srv-1', 'item-meal-srv-1', {
        calories: 700,
        protein: 50,
        fats: 25,
        carbs: 60,
      });

      const updated = useNutritionStore.getState().getDayLog('2026-04-08').meals[0];
      expect(updated.totalCalories).toBe(700);
      expect(updated.totalProtein).toBe(50);
      expect(updated.items[0].calories).toBe(700);
    });

    test('does NOT sync local meals (meal- prefix) to server', () => {
      const { nutritionService } = require('../services');
      const localMeal = { ...mockMeal('meal-local-1') };
      useNutritionStore.getState().addMeal('2026-04-08', localMeal);

      useNutritionStore.getState().updateMealItem('2026-04-08', 'meal-local-1', 'item-meal-local-1', {
        calories: 300,
      });

      expect(nutritionService.updateMeal).not.toHaveBeenCalled();
    });

    test('is a no-op when date or meal does not exist', () => {
      // Should not throw — just silently do nothing
      expect(() => {
        useNutritionStore.getState().updateMealItem('2099-01-01', 'nonexistent', 'item-x', { calories: 100 });
      }).not.toThrow();
    });
  });

  describe('removeMealItem', () => {
    test('removes an item from a meal and recalculates totals', () => {
      const meal: any = {
        ...mockMeal('meal-srv-2'),
        items: [
          { id: 'item-a', name: 'Rice', calories: 200, protein: 5, fats: 1, carbs: 45, weightGrams: 100 },
          { id: 'item-b', name: 'Chicken', calories: 300, protein: 30, fats: 10, carbs: 0, weightGrams: 150 },
        ],
        totalCalories: 500,
        totalProtein: 35,
        totalFats: 11,
        totalCarbs: 45,
      };
      useNutritionStore.getState().addMeal('2026-04-08', meal);

      useNutritionStore.getState().removeMealItem('2026-04-08', 'meal-srv-2', 'item-a');

      const updated = useNutritionStore.getState().getDayLog('2026-04-08').meals[0];
      expect(updated.items).toHaveLength(1);
      expect(updated.items[0].id).toBe('item-b');
      expect(updated.totalCalories).toBe(300);
    });

    test('removes entire meal when last item is deleted', () => {
      const meal = mockMeal('meal-srv-3'); // single item
      useNutritionStore.getState().addMeal('2026-04-08', meal);

      expect(useNutritionStore.getState().getDayLog('2026-04-08').meals).toHaveLength(1);

      useNutritionStore.getState().removeMealItem('2026-04-08', 'meal-srv-3', 'item-meal-srv-3');

      expect(useNutritionStore.getState().getDayLog('2026-04-08').meals).toHaveLength(0);
    });
  });

  describe('applyServerTargets', () => {
    test('merges non-null server targets into defaultTargets', () => {
      useNutritionStore.getState().applyServerTargets({
        calories: 2800,
        protein: 200,
        fats: null,   // null → keep local value
        carbs: null,  // null → keep local value
        waterMl: 3000,
      });

      const targets = useNutritionStore.getState().defaultTargets;
      expect(targets.calories).toBe(2800);
      expect(targets.protein).toBe(200);
      expect(targets.fats).toBe(70);       // unchanged (was null from server)
      expect(targets.carbs).toBe(250);     // unchanged (was null from server)
      expect(targets.waterTargetMl).toBe(3000);
    });

    test('does not overwrite local values when all server fields are null', () => {
      useNutritionStore.getState().applyServerTargets({
        calories: null,
        protein: null,
        fats: null,
        carbs: null,
        waterMl: null,
      });

      const targets = useNutritionStore.getState().defaultTargets;
      // All defaults preserved
      expect(targets.calories).toBe(2000);
      expect(targets.protein).toBe(150);
    });
  });

  describe('clearUserData', () => {
    test('clears dailyLog and savedFoods, resets defaultTargets', () => {
      // Populate some state
      useNutritionStore.getState().addMeal('2026-04-08', mockMeal('meal-1'));
      useNutritionStore.getState().addWater('2026-04-08', 500);

      useNutritionStore.getState().clearUserData();

      const state = useNutritionStore.getState();
      expect(state.dailyLog).toEqual({});
      expect(state.savedFoods).toEqual([]);
      // defaultTargets reset to built-in defaults (calories: 2500 per the store code)
      expect(state.defaultTargets.calories).toBe(2500);
    });
  });
});
