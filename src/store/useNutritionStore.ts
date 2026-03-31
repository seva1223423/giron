import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DailyNutrition, Meal, NutritionItem } from '../types';

interface NutritionStore {
  dailyLog: Record<string, DailyNutrition>;
  waterMl: number;

  getDayLog: (date: string) => DailyNutrition;
  addMeal: (date: string, meal: Meal) => void;
  removeMeal: (date: string, mealId: string) => void;
  updateMealItem: (date: string, mealId: string, itemId: string, data: Partial<NutritionItem>) => void;
  addWater: (date: string, ml: number) => void;
  setTargets: (date: string, targets: { calories: number; protein: number; fats: number; carbs: number }) => void;
}

const getDefaultDayLog = (date: string): DailyNutrition => ({
  date,
  meals: [],
  waterMl: 0,
  targetCalories: 2500,
  targetProtein: 150,
  targetFats: 80,
  targetCarbs: 300,
});

export const useNutritionStore = create<NutritionStore>()(
  persist(
    (set, get) => ({
      dailyLog: {},
      waterMl: 0,

      getDayLog: (date) => {
        return get().dailyLog[date] || getDefaultDayLog(date);
      },

      addMeal: (date, meal) => set((s) => {
        const dayLog = s.dailyLog[date] || getDefaultDayLog(date);
        return {
          dailyLog: {
            ...s.dailyLog,
            [date]: {
              ...dayLog,
              meals: [...dayLog.meals, meal],
            },
          },
        };
      }),

      removeMeal: (date, mealId) => set((s) => {
        const dayLog = s.dailyLog[date];
        if (!dayLog) return s;
        return {
          dailyLog: {
            ...s.dailyLog,
            [date]: {
              ...dayLog,
              meals: dayLog.meals.filter((m) => m.id !== mealId),
            },
          },
        };
      }),

      updateMealItem: (date, mealId, itemId, data) => set((s) => {
        const dayLog = s.dailyLog[date];
        if (!dayLog) return s;
        return {
          dailyLog: {
            ...s.dailyLog,
            [date]: {
              ...dayLog,
              meals: dayLog.meals.map((meal) =>
                meal.id === mealId
                  ? {
                      ...meal,
                      items: meal.items.map((item) =>
                        item.id === itemId ? { ...item, ...data } : item
                      ),
                    }
                  : meal
              ),
            },
          },
        };
      }),

      addWater: (date, ml) => set((s) => {
        const dayLog = s.dailyLog[date] || getDefaultDayLog(date);
        return {
          dailyLog: {
            ...s.dailyLog,
            [date]: {
              ...dayLog,
              waterMl: dayLog.waterMl + ml,
            },
          },
        };
      }),

      setTargets: (date, targets) => set((s) => {
        const dayLog = s.dailyLog[date] || getDefaultDayLog(date);
        return {
          dailyLog: {
            ...s.dailyLog,
            [date]: {
              ...dayLog,
              targetCalories: targets.calories,
              targetProtein: targets.protein,
              targetFats: targets.fats,
              targetCarbs: targets.carbs,
            },
          },
        };
      }),
    }),
    {
      name: 'iron-gym-nutrition',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
