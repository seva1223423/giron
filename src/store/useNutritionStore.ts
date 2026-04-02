import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DailyNutrition, Meal, NutritionItem } from '../types';
import { nutritionService } from '../services';

interface NutritionStore {
  dailyLog: Record<string, DailyNutrition>;
  waterMl: number;
  defaultTargets: { calories: number; protein: number; fats: number; carbs: number; waterTargetMl: number };
  savedFoods: NutritionItem[];

  getDayLog: (date: string) => DailyNutrition;
  addMeal: (date: string, meal: Meal) => void;
  removeMeal: (date: string, mealId: string) => void;
  updateMealItem: (date: string, mealId: string, itemId: string, data: Partial<NutritionItem>) => void;
  addWater: (date: string, ml: number) => void;
  setTargets: (date: string, targets: { calories: number; protein: number; fats: number; carbs: number; waterTargetMl?: number }) => void;
  syncMealsFromServer: (date: string) => Promise<void>;
  saveFoodItem: (item: NutritionItem) => void;
  removeSavedFood: (id: string) => void;
}

const getDefaultDayLog = (date: string, defaults?: { calories: number; protein: number; fats: number; carbs: number; waterTargetMl: number }): DailyNutrition => ({
  date,
  meals: [],
  waterMl: 0,
  targetCalories: defaults?.calories ?? 2500,
  targetProtein: defaults?.protein ?? 150,
  targetFats: defaults?.fats ?? 80,
  targetCarbs: defaults?.carbs ?? 300,
  waterTargetMl: defaults?.waterTargetMl ?? 2500,
});

export const useNutritionStore = create<NutritionStore>()(
  persist(
    (set, get) => ({
      dailyLog: {},
      waterMl: 0,
      defaultTargets: { calories: 2500, protein: 150, fats: 80, carbs: 300, waterTargetMl: 2500 },
      savedFoods: [],

      getDayLog: (date) => {
        const existing = get().dailyLog[date];
        if (existing) return existing;
        return getDefaultDayLog(date, get().defaultTargets);
      },

      addMeal: (date, meal) => {
        // Update local state immediately
        set((s) => {
          const dayLog = s.dailyLog[date] || getDefaultDayLog(date, s.defaultTargets);
          return {
            dailyLog: {
              ...s.dailyLog,
              [date]: {
                ...dayLog,
                meals: [...dayLog.meals, meal],
              },
            },
          };
        });

        // Sync to server in background
        nutritionService.addMeal({
          type: meal.type,
          photoUrl: meal.photoUrl,
          items: meal.items.map((item) => ({
            name: item.name,
            calories: item.calories,
            protein: item.protein,
            fats: item.fats,
            carbs: item.carbs,
            weightGrams: item.weightGrams,
          })),
        }).catch(() => {});
      },

      removeMeal: (date, mealId) => {
        set((s) => {
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
        });

        // Sync to server
        nutritionService.deleteMeal(mealId).catch(() => {});
      },

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
        const dayLog = s.dailyLog[date] || getDefaultDayLog(date, s.defaultTargets);
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
        const dayLog = s.dailyLog[date] || getDefaultDayLog(date, s.defaultTargets);
        const waterTargetMl = targets.waterTargetMl ?? s.defaultTargets.waterTargetMl;
        return {
          defaultTargets: { ...s.defaultTargets, ...targets, waterTargetMl },
          dailyLog: {
            ...s.dailyLog,
            [date]: {
              ...dayLog,
              targetCalories: targets.calories,
              targetProtein: targets.protein,
              targetFats: targets.fats,
              targetCarbs: targets.carbs,
              waterTargetMl,
            },
          },
        };
      }),

      saveFoodItem: (item) => set((s) => {
        const already = s.savedFoods.some((f) => f.id === item.id || f.name === item.name);
        if (already) return s;
        return { savedFoods: [item, ...s.savedFoods].slice(0, 30) };
      }),

      removeSavedFood: (id) => set((s) => ({
        savedFoods: s.savedFoods.filter((f) => f.id !== id),
      })),

      syncMealsFromServer: async (date) => {
        try {
          const meals = await nutritionService.getMealsByDate(date);
          if (meals.length > 0) {
            set((s) => {
              const dayLog = s.dailyLog[date] || getDefaultDayLog(date, s.defaultTargets);
              return {
                dailyLog: {
                  ...s.dailyLog,
                  [date]: { ...dayLog, meals },
                },
              };
            });
          }
        } catch {}
      },
    }),
    {
      name: 'iron-gym-nutrition',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
