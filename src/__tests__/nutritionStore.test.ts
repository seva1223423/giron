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

    test('different dates have separate logs', () => {
      useNutritionStore.getState().addMeal('2026-04-08', mockMeal('meal-1'));
      useNutritionStore.getState().addMeal('2026-04-09', mockMeal('meal-2'));

      expect(useNutritionStore.getState().getDayLog('2026-04-08').meals).toHaveLength(1);
      expect(useNutritionStore.getState().getDayLog('2026-04-09').meals).toHaveLength(1);
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
});
