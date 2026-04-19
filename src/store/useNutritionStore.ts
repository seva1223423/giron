import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DailyNutrition, Meal, NutritionItem, WaterLogEntry } from '../types';
import { nutritionService } from '../services';
import { localDateStr } from '../utils/date';

interface NutritionStore {
  dailyLog: Record<string, DailyNutrition>;
  defaultTargets: { calories: number; protein: number; fats: number; carbs: number; waterTargetMl: number };
  savedFoods: NutritionItem[];

  getDayLog: (date: string) => DailyNutrition;
  addMeal: (date: string, meal: Meal) => void;
  removeMeal: (date: string, mealId: string) => void;
  updateMealItem: (date: string, mealId: string, itemId: string, data: Partial<NutritionItem>) => void;
  addWater: (date: string, ml: number) => void;
  removeMealItem: (date: string, mealId: string, itemId: string) => void;
  setTargets: (date: string, targets: { calories: number; protein: number; fats: number; carbs: number; waterTargetMl?: number }) => void;
  /** Apply server-persisted nutrition targets — only overwrites if server has non-default values */
  applyServerTargets: (serverTargets: { calories?: number | null; protein?: number | null; fats?: number | null; carbs?: number | null; waterMl?: number | null }) => void;
  syncMealsFromServer: (date: string) => Promise<void>;
  saveFoodItem: (item: NutritionItem) => void;
  removeSavedFood: (id: string) => void;
  cleanupOldLogs: (keepDays?: number) => void;
  clearUserData: () => void;
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
      defaultTargets: { calories: 2500, protein: 150, fats: 80, carbs: 300, waterTargetMl: 2500 },
      savedFoods: [],

      getDayLog: (date) => {
        const existing = get().dailyLog[date];
        if (existing) return existing;
        return getDefaultDayLog(date, get().defaultTargets);
      },

      addMeal: (date, meal) => {
        // Use a temp ID so we can locate this entry after server confirms
        const tempId = meal.id || `meal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const tempMeal: Meal = { ...meal, id: tempId };

        // Optimistic update
        set((s) => {
          const dayLog = s.dailyLog[date] || getDefaultDayLog(date, s.defaultTargets);
          return {
            dailyLog: {
              ...s.dailyLog,
              [date]: { ...dayLog, meals: [...dayLog.meals, tempMeal] },
            },
          };
        });

        // Sync to server — replace temp ID with server ID on success, rollback on failure
        nutritionService.addMeal({
          type: meal.type,
          date,
          photoUrl: meal.photoUrl,
          items: meal.items.map((item) => ({
            name: item.name,
            calories: item.calories,
            protein: item.protein,
            fats: item.fats,
            carbs: item.carbs,
            weightGrams: item.weightGrams,
          })),
        }).then((serverMeal) => {
          const dayLog = get().dailyLog[date];
          const stillPresent = dayLog?.meals.some((m) => m.id === tempId);
          if (!stillPresent) {
            // Meal was deleted locally while the server call was in-flight — clean up server copy
            nutritionService.deleteMeal(serverMeal.id).catch(() => {});
            return;
          }
          // Replace temp meal with server-authoritative data (ID + recalculated macros)
          set((s) => {
            const dl = s.dailyLog[date];
            if (!dl) return s;
            return {
              dailyLog: {
                ...s.dailyLog,
                [date]: {
                  ...dl,
                  meals: dl.meals.map((m) => m.id === tempId ? serverMeal : m),
                },
              },
            };
          });
        }).catch(() => {
          // Rollback: remove the optimistically added meal
          set((s) => {
            const dl = s.dailyLog[date];
            if (!dl) return s;
            return {
              dailyLog: {
                ...s.dailyLog,
                [date]: { ...dl, meals: dl.meals.filter((m) => m.id !== tempId) },
              },
            };
          });
        });
      },

      removeMeal: (date, mealId) => {
        // Snapshot for rollback — only attempt server delete for server-side meals
        const snapshot = get().dailyLog[date]?.meals ?? [];

        set((s) => {
          const dayLog = s.dailyLog[date];
          if (!dayLog) return s;
          return {
            dailyLog: {
              ...s.dailyLog,
              [date]: { ...dayLog, meals: dayLog.meals.filter((m) => m.id !== mealId) },
            },
          };
        });

        // Skip server call for locally-created meals that were never synced
        if (mealId.startsWith('meal-')) return;

        nutritionService.deleteMeal(mealId).catch((err) => {
          // 404 = already deleted on server — treat as success
          if (err?.response?.status === 404) return;
          set((s) => {
            const dayLog = s.dailyLog[date];
            if (!dayLog) return s;
            return {
              dailyLog: { ...s.dailyLog, [date]: { ...dayLog, meals: snapshot } },
            };
          });
        });
      },

      updateMealItem: (date, mealId, itemId, data) => {
        const snapshot = get().dailyLog[date]?.meals ?? [];

        let updatedMeal: Meal | undefined;
        set((s) => {
          const dayLog = s.dailyLog[date];
          if (!dayLog) return s;
          const updatedMeals = dayLog.meals.map((meal) => {
            if (meal.id !== mealId) return meal;
            const updatedItems = meal.items.map((item) => item.id === itemId ? { ...item, ...data } : item);
            const updated: Meal = {
              ...meal,
              items: updatedItems,
              totalCalories: updatedItems.reduce((s, i) => s + i.calories, 0),
              totalProtein: updatedItems.reduce((s, i) => s + i.protein, 0),
              totalFats: updatedItems.reduce((s, i) => s + i.fats, 0),
              totalCarbs: updatedItems.reduce((s, i) => s + i.carbs, 0),
            };
            updatedMeal = updated;
            return updated;
          });
          return { dailyLog: { ...s.dailyLog, [date]: { ...dayLog, meals: updatedMeals } } };
        });

        // Sync to server with rollback; skip local-only meals that were never persisted
        if (updatedMeal && !mealId.startsWith('meal-')) {
          nutritionService.updateMeal(mealId, updatedMeal.items).catch(() => {
            set((s) => {
              const dayLog = s.dailyLog[date];
              if (!dayLog) return s;
              return { dailyLog: { ...s.dailyLog, [date]: { ...dayLog, meals: snapshot } } };
            });
          });
        }
      },

      addWater: (date, ml) => set((s) => {
        const dayLog = s.dailyLog[date] || getDefaultDayLog(date, s.defaultTargets);
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const newEntry: WaterLogEntry = { time: timeStr, ml };
        return {
          dailyLog: {
            ...s.dailyLog,
            [date]: {
              ...dayLog,
              waterMl: dayLog.waterMl + ml,
              waterLog: [...(dayLog.waterLog || []), newEntry],
            },
          },
        };
      }),

      removeMealItem: (date, mealId, itemId) => {
        const snapshot = get().dailyLog[date]?.meals ?? [];
        let remainingItems: Meal['items'] = [];
        let mealIsEmpty = false;

        set((s) => {
          const dayLog = s.dailyLog[date];
          if (!dayLog) return s;
          const updatedMeals: Meal[] = [];
          for (const meal of dayLog.meals) {
            if (meal.id !== mealId) { updatedMeals.push(meal); continue; }
            const updatedItems = meal.items.filter((item) => item.id !== itemId);
            if (updatedItems.length === 0) { mealIsEmpty = true; continue; } // remove meal entirely
            remainingItems = updatedItems;
            const updated: Meal = {
              ...meal,
              items: updatedItems,
              totalCalories: updatedItems.reduce((s, i) => s + i.calories, 0),
              totalProtein: updatedItems.reduce((s, i) => s + i.protein, 0),
              totalFats: updatedItems.reduce((s, i) => s + i.fats, 0),
              totalCarbs: updatedItems.reduce((s, i) => s + i.carbs, 0),
            };
            updatedMeals.push(updated);
          }
          return { dailyLog: { ...s.dailyLog, [date]: { ...dayLog, meals: updatedMeals } } };
        });

        // Skip server sync for locally-created meals
        if (mealId.startsWith('meal-')) return;

        const rollback = (err?: any) => {
          if (err?.response?.status === 404) return; // already gone — treat as success
          set((s) => {
            const dayLog = s.dailyLog[date];
            if (!dayLog) return s;
            return { dailyLog: { ...s.dailyLog, [date]: { ...dayLog, meals: snapshot } } };
          });
        };

        if (mealIsEmpty) {
          nutritionService.deleteMeal(mealId).catch(rollback);
        } else {
          nutritionService.updateMeal(mealId, remainingItems.map((i) => ({
            name: i.name, calories: i.calories, protein: i.protein, fats: i.fats, carbs: i.carbs, weightGrams: i.weightGrams,
          }))).catch(rollback);
        }
      },

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

      applyServerTargets: ({ calories, protein, fats, carbs, waterMl }) => set((s) => {
        // Only apply when server has non-null values; don't overwrite user's local customizations
        // with nulls (treat null as "not set on server yet").
        const merged = { ...s.defaultTargets };
        if (calories != null) merged.calories = calories;
        if (protein != null) merged.protein = protein;
        if (fats != null) merged.fats = fats;
        if (carbs != null) merged.carbs = carbs;
        if (waterMl != null) merged.waterTargetMl = waterMl;
        return { defaultTargets: merged };
      }),

      saveFoodItem: (item) => set((s) => {
        const already = s.savedFoods.some((f) => f.id === item.id || f.name === item.name);
        if (already) return s;
        return { savedFoods: [item, ...s.savedFoods].slice(0, 30) };
      }),

      removeSavedFood: (id) => set((s) => ({
        savedFoods: s.savedFoods.filter((f) => f.id !== id),
      })),

      clearUserData: () => set({
        dailyLog: {},
        defaultTargets: { calories: 2500, protein: 150, fats: 80, carbs: 300, waterTargetMl: 2500 },
        savedFoods: [],
      }),

      cleanupOldLogs: (keepDays: number = 90) => {
        set((s) => {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - keepDays);
          const cutoffStr = localDateStr(cutoff);

          const cleaned: typeof s.dailyLog = {};
          for (const [date, log] of Object.entries(s.dailyLog)) {
            if (date >= cutoffStr) {
              cleaned[date] = log;
            }
          }

          return { dailyLog: cleaned };
        });
      },

      syncMealsFromServer: async (date) => {
        try {
          const meals = await nutritionService.getMealsByDate(date);
          set((s) => {
            const dayLog = s.dailyLog[date] || getDefaultDayLog(date, s.defaultTargets);
            // Merge: keep local-only meals (IDs starting with 'meal-') that server doesn't know about
            const serverIds = new Set(meals.map((m) => m.id));
            const localOnly = dayLog.meals.filter((m) => m.id.startsWith('meal-') && !serverIds.has(m.id));
            return {
              dailyLog: {
                ...s.dailyLog,
                [date]: { ...dayLog, meals: [...meals, ...localOnly] },
              },
            };
          });
        } catch {}
      },
    }),
    {
      name: 'iron-gym-nutrition',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (state: any) => state,
    }
  )
);
