/**
 * Estimated one-rep max (Epley) — the single source of truth.
 *
 * This expression used to live inline in 16 places across 9 screens and the
 * workout store, in TWO different versions: most copies applied the formula
 * unconditionally, while the two calculator screens special-cased a single
 * rep. So a 100 kg × 1 set showed "~100" on the calculator and "103" in the
 * PR notification for the very same set (audit R36).
 *
 * A single repetition IS the one-rep max by definition — estimating it with
 * Epley inflates the number by 3.3% and, worse, means a genuine heavy single
 * can be beaten by a lighter set that was never actually lifted as a max.
 * The special case is the correct behaviour, so it is the one that stays.
 */

/** Estimated 1RM in kg. Returns 0 for a set that carries no information. */
export function estimateOneRepMax(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (!Number.isFinite(reps) || reps <= 0) return 0;
  // A single rep is already the max — do not extrapolate it.
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Same value, rounded to a whole kg — what the UI shows. */
export function estimateOneRepMaxRounded(weight: number, reps: number): number {
  return Math.round(estimateOneRepMax(weight, reps));
}
