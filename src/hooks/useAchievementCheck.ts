import { useEffect, useRef, useMemo } from 'react';
import { useWorkoutStore, useNutritionStore } from '../store';
import { computeAchievements, getNewlyUnlocked, Achievement } from '../utils/achievements';
import { computeStreak } from '../utils/date';

/**
 * Checks for newly unlocked achievements whenever meals or workoutHistory change.
 * Calls onUnlocked with the list of newly unlocked achievements.
 *
 * The very first effect run on mount snapshots the current unlocked set
 * WITHOUT calling onUnlocked. Without this, every navigation to the host
 * screen (Nutrition) would replay every previously-earned achievement as
 * a fresh "unlocked!" alert — getNewlyUnlocked([], current) treats every
 * unlocked entry as new on a cold ref. Subsequent runs (driven by real
 * changes to workoutHistory / nutritionDaysLogged) correctly fire only
 * for the delta.
 */
export function useAchievementCheck(onUnlocked: (achievements: Achievement[]) => void) {
  const { workoutHistory } = useWorkoutStore();
  const { dailyLog } = useNutritionStore();

  const prevUnlockedRef = useRef<string[]>([]);
  const initializedRef = useRef(false);
  const onUnlockedRef = useRef(onUnlocked);
  onUnlockedRef.current = onUnlocked;

  const nutritionDaysLogged = Object.values(dailyLog).filter((d: any) => (d.meals?.length ?? 0) > 0).length;

  const streak = useMemo(
    () => computeStreak(workoutHistory.map((w) => w.completedAt).filter(Boolean) as string[]),
    [workoutHistory],
  );

  useEffect(() => {
    const current = computeAchievements({ workoutHistory, nutritionDaysLogged, currentStreak: streak });
    if (!initializedRef.current) {
      // First run on mount: snapshot the existing unlocked set as the
      // baseline so the next change-driven run only surfaces the delta.
      // Skipping onUnlocked here is intentional — the user already knows
      // which achievements they earned in past sessions; replaying them
      // as "Ачивка разблокирована!" alerts on every tab switch was the
      // bug round 74 fixed.
      prevUnlockedRef.current = current.filter((a) => a.unlocked).map((a) => a.id);
      initializedRef.current = true;
      return;
    }
    const newlyUnlocked = getNewlyUnlocked(prevUnlockedRef.current, current);
    if (newlyUnlocked.length > 0) {
      onUnlockedRef.current(newlyUnlocked);
    }
    prevUnlockedRef.current = current.filter((a) => a.unlocked).map((a) => a.id);
  }, [nutritionDaysLogged, workoutHistory]);
}
