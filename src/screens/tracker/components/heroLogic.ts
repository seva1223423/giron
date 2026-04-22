/**
 * Pure helpers extracted from CurrentSetHero for unit testing.
 *
 * Keeping them in a separate file (no React / store imports) means
 * jest can load them without the full expo native-modules mock graph.
 */
import type { WorkoutExercise, WorkoutSet } from '../../../types';

/** Find the "live" set for the hero card — first uncompleted working set,
 *  or fallback to the last set if everything is done. */
export function findLiveSet(sets: WorkoutSet[] | null | undefined): { index: number; set: WorkoutSet } | null {
  if (!sets || sets.length === 0) return null;
  const uncompleteIdx = sets.findIndex((s) => !s.completed);
  const index = uncompleteIdx >= 0 ? uncompleteIdx : sets.length - 1;
  const set = sets[index];
  return set ? { index, set } : null;
}

/** RPE → fill ratio (0..1) for the 8-cell scale on the hero card.
 *  RPE domain is 6..10; out-of-range values clamp. Guards against
 *  NaN / Infinity / missing. */
export function rpeFillRatio(rpe: number): number {
  if (!isFinite(rpe)) return 0;
  return Math.max(0, Math.min(1, (rpe - 6) / 4));
}

/** Eyebrow copy for the hero card. "Разминка · подход N" for warmup,
 *  "Подход W из N · рабочий" for working (or dropset, same rules). */
export function buildSetEyebrow(exercise: WorkoutExercise, liveIndex: number): string {
  const liveSet = exercise?.sets?.[liveIndex];
  if (!liveSet) return '';
  if (liveSet.type === 'warmup') {
    return `Разминка · подход ${liveIndex + 1}`;
  }
  const workingCount = exercise.sets.filter((s) => s.type !== 'warmup').length;
  const workingSoFar = exercise.sets
    .slice(0, liveIndex)
    .filter((s) => s.type !== 'warmup').length;
  return `Подход ${workingSoFar + 1} из ${workingCount} · рабочий`;
}
