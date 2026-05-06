import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEncryptedAsyncStorage } from '../utils/encryptedStorage';
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
  /** Remove a single entry from the day's water log by its index. The
   *  total `waterMl` is decremented by that entry's volume (clamped at 0). */
  removeWaterEntry: (date: string, entryIndex: number) => void;
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
        if (!existing) return getDefaultDayLog(date, get().defaultTargets);
        const dt = get().defaultTargets;
        // Older persisted entries may be missing target fields — fill from defaults
        return {
          ...existing,
          targetCalories: existing.targetCalories ?? dt.calories,
          targetProtein: existing.targetProtein ?? dt.protein,
          targetFats: existing.targetFats ?? dt.fats,
          targetCarbs: existing.targetCarbs ?? dt.carbs,
          waterTargetMl: existing.waterTargetMl ?? dt.waterTargetMl,
        };
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
        // Only send photo URLs that the server can validate (must be HTTPS, not local file URIs)
        const serverPhotoUrl = meal.photoUrl?.startsWith('https://') ? meal.photoUrl : undefined;
        nutritionService.addMeal({
          type: meal.type,
          date,
          photoUrl: serverPhotoUrl,
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
          // Replace temp meal with server-authoritative data (ID + recalculated macros).
          // First remove any pre-synced copy by CUID (syncMealsFromServer race), then swap temp ID.
          set((s) => {
            const dl = s.dailyLog[date];
            if (!dl) return s;
            const deduped = dl.meals.filter((m) => m.id !== serverMeal.id);
            return {
              dailyLog: {
                ...s.dailyLog,
                [date]: { ...dl, meals: deduped.map((m) => m.id === tempId ? serverMeal : m) },
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
        const removed = get().dailyLog[date]?.meals.find((m) => m.id === mealId);

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
          // Re-add only the removed meal — restoring a snapshot would erase concurrent changes
          if (removed) {
            set((s) => {
              const dayLog = s.dailyLog[date];
              if (!dayLog) return s;
              return {
                dailyLog: { ...s.dailyLog, [date]: { ...dayLog, meals: [...dayLog.meals, removed] } },
              };
            });
          }
        });
      },

      updateMealItem: (date, mealId, itemId, data) => {
        const prevMeal = get().dailyLog[date]?.meals.find((m) => m.id === mealId);

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
              totalCalories: Math.round(updatedItems.reduce((s, i) => s + i.calories, 0)),
              totalProtein: Math.round(updatedItems.reduce((s, i) => s + i.protein, 0) * 10) / 10,
              totalFats: Math.round(updatedItems.reduce((s, i) => s + i.fats, 0) * 10) / 10,
              totalCarbs: Math.round(updatedItems.reduce((s, i) => s + i.carbs, 0) * 10) / 10,
            };
            updatedMeal = updated;
            return updated;
          });
          return { dailyLog: { ...s.dailyLog, [date]: { ...dayLog, meals: updatedMeals } } };
        });

        // Sync to server with rollback; skip local-only meals that were never persisted
        if (updatedMeal && !mealId.startsWith('meal-')) {
          nutritionService.updateMeal(mealId, updatedMeal.items).catch(() => {
            // Revert only this meal — restoring a snapshot would erase concurrent changes
            if (prevMeal) {
              set((s) => {
                const dayLog = s.dailyLog[date];
                if (!dayLog) return s;
                return { dailyLog: { ...s.dailyLog, [date]: { ...dayLog, meals: dayLog.meals.map((m) => m.id === mealId ? prevMeal : m) } } };
              });
            }
          });
        }
      },

      addWater: (date, ml) => set((s) => {
        if (!ml || ml <= 0) return s;
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

      removeWaterEntry: (date, entryIndex) => set((s) => {
        const dayLog = s.dailyLog[date];
        if (!dayLog) return s;
        const log = dayLog.waterLog || [];
        if (entryIndex < 0 || entryIndex >= log.length) return s;
        const removed = log[entryIndex];
        const nextLog = log.filter((_, i) => i !== entryIndex);
        return {
          dailyLog: {
            ...s.dailyLog,
            [date]: {
              ...dayLog,
              waterMl: Math.max(0, dayLog.waterMl - removed.ml),
              waterLog: nextLog,
            },
          },
        };
      }),

      removeMealItem: (date, mealId, itemId) => {
        const prevMeal = get().dailyLog[date]?.meals.find((m) => m.id === mealId);
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
              totalCalories: Math.round(updatedItems.reduce((s, i) => s + i.calories, 0)),
              totalProtein: Math.round(updatedItems.reduce((s, i) => s + i.protein, 0) * 10) / 10,
              totalFats: Math.round(updatedItems.reduce((s, i) => s + i.fats, 0) * 10) / 10,
              totalCarbs: Math.round(updatedItems.reduce((s, i) => s + i.carbs, 0) * 10) / 10,
            };
            updatedMeals.push(updated);
          }
          return { dailyLog: { ...s.dailyLog, [date]: { ...dayLog, meals: updatedMeals } } };
        });

        // Skip server sync for locally-created meals
        if (mealId.startsWith('meal-')) return;

        const rollback = (err?: any) => {
          if (err?.response?.status === 404) return; // already gone — treat as success
          // Re-add only this meal — restoring a snapshot would erase concurrent changes
          if (prevMeal) {
            set((s) => {
              const dayLog = s.dailyLog[date];
              if (!dayLog) return s;
              const hasMeal = dayLog.meals.some((m) => m.id === mealId);
              const meals = hasMeal
                ? dayLog.meals.map((m) => m.id === mealId ? prevMeal : m)
                : [...dayLog.meals, prevMeal];
              return { dailyLog: { ...s.dailyLog, [date]: { ...dayLog, meals } } };
            });
          }
        };

        if (mealIsEmpty) {
          nutritionService.deleteMeal(mealId).catch(rollback);
        } else {
          nutritionService.updateMeal(mealId, remainingItems.map((i) => ({
            name: i.name, calories: i.calories, protein: i.protein, fats: i.fats, carbs: i.carbs, weightGrams: i.weightGrams,
          }))).catch(rollback);
        }
      },

      setTargets: (date, targets) => {
        set((s) => {
          const dayLog = s.dailyLog[date] || getDefaultDayLog(date, s.defaultTargets);
          // Preserve existing per-day water target when caller doesn't supply one (e.g. GoalsModal only saves KBJU)
          const waterTargetMl = targets.waterTargetMl ?? s.dailyLog[date]?.waterTargetMl ?? s.defaultTargets.waterTargetMl;
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
        });
        // Fire-and-forget sync to server — targets survive reinstall/multi-device
        nutritionService.updateNutritionTargets({
          calories: targets.calories,
          protein: targets.protein,
          fats: targets.fats,
          carbs: targets.carbs,
        }).catch(() => {});
      },

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
        const already = s.savedFoods.some((f) => f.id === item.id);
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
            const merged = [...meals, ...localOnly].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
            return {
              dailyLog: {
                ...s.dailyLog,
                [date]: { ...dayLog, meals: merged },
              },
            };
          });
        } catch {}
      },
    }),
    {
      name: 'giron-nutrition',
      // Round 233 (security audit, HIGH-2 follow-up): meal log + macro
      // history is personal health data. AES-GCM-wrapped via the same
      // master key as measurements/sleep stores. One-shot plaintext
      // migration on read.
      storage: createJSONStorage(() => createEncryptedAsyncStorage()),
      version: 1,
      migrate: (state: any) => state,
      // Round 257: partialize so we only persist user-data fields, not
      // derived/transient state. Without this we serialize the full
      // store shape on every set() — and `dailyLog` was unbounded
      // (every meal ever, no auto-cleanup). Heavy users hit AsyncStorage's
      // 6MB cap. partialize keeps only the persistable subset.
      partialize: (state) => ({
        dailyLog: state.dailyLog,
        defaultTargets: state.defaultTargets,
        savedFoods: state.savedFoods,
      }),
      // Auto-prune logs older than 90 days on rehydrate. cleanupOldLogs
      // already exists but was never auto-called. Calling it here keeps
      // the persisted blob bounded.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        try {
          state.cleanupOldLogs?.(90);
        } catch {
          // Best effort — if the store shape is somehow incompatible
          // with the cleanup helper, skip the prune rather than crash
          // the rehydrate.
        }
      },
    }
  )
);
