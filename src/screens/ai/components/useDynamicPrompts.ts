import { useMemo } from 'react';
import { useWorkoutStore, useNutritionStore, useSleepStore } from '../../../store';
import { localDateStr } from '../../../utils/date';
import { buildDynamicPrompts, type DynamicPrompt } from './buildDynamicPrompts';

export type { DynamicPrompt } from './buildDynamicPrompts';

/**
 * Thin store adapter over buildDynamicPrompts — the logic lives in the pure
 * builder where tests can reach it without rendering a hook. The old version
 * read only the workout store, so the chips could suggest analysing a workout
 * but never noticed protein 40 grams behind at eight in the evening.
 */
export function useDynamicPrompts(): DynamicPrompt[] {
  const { workoutHistory, programs } = useWorkoutStore();
  const dailyLog = useNutritionStore((s) => s.dailyLog);
  const sleepEntries = useSleepStore((s) => s.entries);

  return useMemo(() => {
    const now = new Date();
    const today = localDateStr(now);
    const day = dailyLog[today];

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastNight = sleepEntries.find(
      (e) => e.date === today || e.date === localDateStr(yesterday),
    );

    return buildDynamicPrompts({
      workoutHistory,
      activeProgram: programs.find((p) => p.isActive) ?? null,
      todayNutrition: day
        ? {
            proteinEaten: day.meals.reduce((s, m) => s + (m.totalProtein || 0), 0),
            proteinTarget: day.targetProtein ?? 0,
            mealsCount: day.meals.length,
          }
        : null,
      lastSleepHours: lastNight?.durationHours ?? null,
      hour: now.getHours(),
      now,
    });
  }, [workoutHistory, programs, dailyLog, sleepEntries]);
}
