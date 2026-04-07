import { useEffect, useRef, useCallback } from 'react';
import { useWorkoutStore, useNutritionStore } from '../store';
import { computeAchievements, getNewlyUnlocked, Achievement } from '../utils/achievements';

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

  const nutritionDaysLogged = Object.values(dailyLog).filter((d: any) => d.meals.length > 0).length;

  // Approximate streak from workoutHistory
  const streak = (() => {
    if (workoutHistory.length === 0) return 0;
    let s = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      if (workoutHistory.some((w) => w.completedAt?.startsWith(ds))) s++;
      else if (i > 0) break;
    }
    return s;
  })();

  useEffect(() => {
    const current = computeAchievements({ workoutHistory, nutritionDaysLogged, currentStreak: streak });
    const newlyUnlocked = getNewlyUnlocked(prevUnlockedRef.current, current);
    if (newlyUnlocked.length > 0) {
      onUnlockedRef.current(newlyUnlocked);
    }
    prevUnlockedRef.current = current.filter((a) => a.unlocked).map((a) => a.id);
  }, [nutritionDaysLogged, workoutHistory.length, streak]);
}
