/**
 * Pure derivations that HomeScreen runs inline in its render.
 *
 * Moved here so:
 *   - Unit tests can exercise them without rendering the screen
 *   - Future refactors don't accidentally change business logic
 *     (e.g. what counts as "today's PR", "this-week workouts")
 */

import type { Workout, WorkoutExercise, WorkoutSet } from '../types';

// ─── Week dots bitmap ───────────────────────────────────────────────────────

/**
 * Build a 7-cell bitmap of whether the user completed a workout on each
 * of the last 7 days (index 0 = 6 days ago, index 6 = today). Mirrors
 * the inline logic from HomeScreen.
 */
export function buildWeekDotsFromHistory(
  workoutHistory: Array<{ completedAt?: string | null }>,
  now: Date = new Date(),
): (0 | 1)[] {
  const dots: (0 | 1)[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const hit = workoutHistory.some(
      (w) => typeof w.completedAt === 'string' && w.completedAt.startsWith(ds),
    );
    dots.push(hit ? 1 : 0);
  }
  return dots;
}

// ─── Personal-record finder ─────────────────────────────────────────────────

/**
 * Find the heaviest completed set across all workouts, returning the
 * weight (kg) and the exercise name. Used by the StreakPR grid's
 * "Рекорд" tile.
 *
 * Safe against missing exercises arrays, null weights, and mixed set
 * types (only completed sets count).
 */
export function findHeaviestPR(
  workoutHistory: Array<{ exercises?: WorkoutExercise[] }>,
): { kg: number; exerciseName: string } {
  let bestKg = 0;
  let bestName = 'Ещё нет PR';
  for (const w of workoutHistory ?? []) {
    for (const we of w.exercises ?? []) {
      for (const s of (we.sets ?? []) as WorkoutSet[]) {
        const kg = s.completed && typeof s.weight === 'number' && isFinite(s.weight) ? s.weight : 0;
        if (kg > bestKg) {
          bestKg = kg;
          bestName = we.exercise?.name ?? 'Рекорд';
        }
      }
    }
  }
  return { kg: bestKg, exerciseName: bestName };
}

// ─── Today index ─────────────────────────────────────────────────────────────

/**
 * Current weekday index where Monday = 0 .. Sunday = 6. Matches the
 * WeekPlanStrip convention. `getDay()` returns Sunday=0..Saturday=6,
 * so we shift.
 */
export function todayMondayIndex(d: Date = new Date()): number {
  const day = d.getDay();
  return day === 0 ? 6 : day - 1;
}

// ─── Calorie ring progress ──────────────────────────────────────────────────

/**
 * Compute dayProgress for the ring as a 0..1 fraction. If the target
 * is missing or zero, returns 0 to avoid dividing by zero (rather than
 * infinite/NaN).
 */
export function calorieDayProgress(calNow: number, calTarget: number): number {
  if (!isFinite(calTarget) || calTarget <= 0) return 0;
  if (!isFinite(calNow) || calNow < 0) return 0;
  return calNow / calTarget;
}
