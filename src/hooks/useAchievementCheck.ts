import { useEffect, useRef, useCallback } from 'react';
import { useWorkoutStore, useNutritionStore } from '../store';
import { computeAchievements, getNewlyUnlocked, Achievement } from '../utils/achievements';
import { computeStreak } from '../utils/date';

/**
 * Checks for newly unlocked achievements whenever meals or workoutHistory change.
 * Calls onUnlocked with the list of newly unlocked achievements.
 */
export function useAchievementCheck(onUnlocked: (achievements: Achievement[]) => void) {
  const { workoutHistory } = useWorkoutStore();
  const { dailyLog } = useNutritionStore();

  const prevUnlockedRef = useRef<string[]>([]);
  const onUnlockedRef = useRef(onUnlocked);
  onUnlockedRef.current = onUnlocked;

  const nutritionDaysLogged = Object.values(dailyLog).filter((d: any) => (d.meals?.length ?? 0) > 0).length;

  const streak = computeStreak(workoutHistory.map((w) => w.completedAt).filter(Boolean) as string[]);

  useEffect(() => {
    const current = computeAchievements({ workoutHistory, nutritionDaysLogged, currentStreak: streak });
    const newlyUnlocked = getNewlyUnlocked(prevUnlockedRef.current, current);
    if (newlyUnlocked.length > 0) {
      onUnlockedRef.current(newlyUnlocked);
    }
    prevUnlockedRef.current = current.filter((a) => a.unlocked).map((a) => a.id);
  }, [nutritionDaysLogged, workoutHistory, streak]);
}
