/**
 * Pure derivations that HomeScreen runs inline in its render.
 *
 * Moved here so:
 *   - Unit tests can exercise them without rendering the screen
 *   - Future refactors don't accidentally change business logic
 *     (e.g. what counts as "today's PR", "this-week workouts")
 */

import type { Workout, WorkoutExercise, WorkoutSet } from '../types';
import { localDateStr } from './date';

// ─── Week dots bitmap ───────────────────────────────────────────────────────

/**
 * Build a 7-cell bitmap of whether the user completed a workout on each
 * of the last 7 days (index 0 = 6 days ago, index 6 = today). Mirrors
 * the inline logic from HomeScreen.
 *
 * Timezone-correct: both the day buckets and the workout completion
 * timestamps are bucketed by the user's LOCAL calendar day. The previous
 * implementation compared `toISOString().split('T')[0]` (UTC date) with
 * `w.completedAt.startsWith(ds)` (UTC prefix), which silently mis-bucketed
 * workouts logged near midnight local — a 23:00 MSK workout has UTC date
 * 20:00 the same day, but a 02:00 MSK workout has UTC date 23:00 of the
 * PREVIOUS day, so the user saw an empty dot for "today" and a phantom
 * dot for "yesterday" in their local view. date.ts has the same warning
 * baked into the localDateStr docstring; this file now uses it.
 */
export function buildWeekDotsFromHistory(
  workoutHistory: Array<{ completedAt?: string | null }>,
  now: Date = new Date(),
): (0 | 1)[] {
  const dots: (0 | 1)[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = localDateStr(d);
    const hit = workoutHistory.some((w) => {
      if (typeof w.completedAt !== 'string') return false;
      const parsed = new Date(w.completedAt);
      if (isNaN(parsed.getTime())) return false;
      return localDateStr(parsed) === ds;
    });
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

// ─── Week plan day derivation ──────────────────────────────────────────────

export interface WeekPlanDerived {
  dayLabel: string;
  title: string;
  active: boolean;
  done: boolean;
}

/** Short Russian day labels, Monday-first (matches WeekPlanStrip spec). */
export const RU_DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

/**
 * Turn a weekPlan record (keyed by dow Mon=0..Sun=6) + workout history
 * into the 7 WeekPlanStrip tiles. Live day flips to "Сегодня" + active.
 * Past days check the history for a completion on their weekday.
 *
 * Pure so we can lock the exact labels, active flag, and done-detection
 * without mounting the screen.
 */
export function deriveWeekPlanDays(
  weekPlan: Record<number, { name?: string } | null | undefined>,
  workoutHistory: Array<{ completedAt?: string | null }>,
  now: Date = new Date(),
): WeekPlanDerived[] {
  const todayIdx = todayMondayIndex(now);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const p = weekPlan[i] ?? null;
    return {
      dayLabel: RU_DAY_LABELS[i],
      title: i === todayIdx ? 'Сегодня' : (p?.name ?? 'Отдых'),
      active: i === todayIdx,
      done: i < todayIdx && workoutHistory.some((w) => {
        if (typeof w.completedAt !== 'string') return false;
        const wd = new Date(w.completedAt);
        if (isNaN(wd.getTime())) return false;
        return todayMondayIndex(wd) === i;
      }),
    };
  });
}
