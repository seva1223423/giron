/**
 * Personal records, recomputed from history.
 *
 * `isPR` is set on a set the moment it is ticked, and it is a client-only
 * field: WorkoutSet has no such column, so the server neither stores it nor
 * returns it. fetchHistory replaces every synced workout with the server's
 * copy, which meant the badges vanished — the history card's PR count and the
 * calendar's total both went to zero on the first refresh after a session.
 *
 * Storing the flag would need a migration for something that is derived
 * anyway, and a stored flag also goes stale: correct an old set downward and
 * the record it used to hold stays marked forever. So it is computed here from
 * the history the client already has.
 *
 * Same rule as the live detection in useWorkoutStore.completeSet — strictly
 * beating the best estimated 1RM so far, with the first time an exercise is
 * ever done counting as a record.
 */

import type { Workout, WorkoutSet } from '../types';
import { estimateOneRepMax } from './oneRepMax';

/** Chronological order. Undated workouts sort last so they never set a bar. */
function byTime(a: Workout, b: Workout): number {
  const at = new Date(a.completedAt || a.startedAt || 0).getTime();
  const bt = new Date(b.completedAt || b.startedAt || 0).getTime();
  return at - bt;
}

function countsTowardsRecord(s: WorkoutSet): boolean {
  return Boolean(s.completed) && s.type !== 'warmup' && (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0;
}

/**
 * Returns the same workouts with every set's `isPR` set to what the history
 * actually says. Input is not mutated; the returned order matches the input.
 */
export function annotatePRs(history: Workout[]): Workout[] {
  const best = new Map<string, number>();
  const flags = new Map<string, boolean>(); // set id → isPR

  for (const workout of [...history].sort(byTime)) {
    for (const we of [...(workout.exercises ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const key = we.exerciseId;
      for (const set of [...(we.sets ?? [])].sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0))) {
        if (!countsTowardsRecord(set)) continue;
        const rm = estimateOneRepMax(set.weight as number, set.reps as number);
        const previous = best.get(key);
        if (previous === undefined || rm > previous) {
          flags.set(set.id, true);
          best.set(key, rm);
        }
      }
    }
  }

  return history.map((w) => ({
    ...w,
    exercises: (w.exercises ?? []).map((we) => ({
      ...we,
      sets: (we.sets ?? []).map((s) => {
        const isPR = flags.get(s.id) === true;
        // Leave the object alone when nothing changes — the history list is
        // memoised on set identity in a few places.
        return Boolean(s.isPR) === isPR ? s : { ...s, isPR };
      }),
    })),
  }));
}
