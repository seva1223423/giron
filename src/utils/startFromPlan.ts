/**
 * Turning a plan into a live workout.
 *
 * Both the Home screen and the workouts screen answer "what do I train today"
 * and both have to start it. The logic was written twice; when the second
 * caller appeared it was easier to copy than to share, and the two copies
 * would have drifted the first time either changed. One implementation now.
 */

import type { WeekPlanEntry } from '../store/useWorkoutStore';
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../types';
import { startWorkoutSafe } from './startWorkoutSafe';

/** Fresh ids for a set of exercises — a repeated workout must not reuse them. */
function freshSets(sets: Partial<WorkoutSet>[], exIndex: number, stamp: number): WorkoutSet[] {
  return sets.map((s, i) => ({
    ...s,
    id: `set-${stamp}-${exIndex}-${i}`,
    setNumber: i + 1,
    type: s.type ?? 'normal',
    reps: s.reps ?? 10,
    weight: s.weight ?? 0,
    completed: false,
  })) as WorkoutSet[];
}

export type PlanStartResult =
  | { status: 'started' }
  | { status: 'routine' }        // caller must await startWorkoutFromRoutine
  | { status: 'empty' }          // nothing planned, or the plan has no exercises
  | { status: 'missing' };       // planned exercise ids no longer resolve

/**
 * Start the day described by `entry`. Returns `routine` without doing anything
 * when the day points at a saved routine — that path is async and needs the
 * store, so the caller runs it.
 */
export function startPlannedDay(
  entry: WeekPlanEntry | null,
  allExercises: Exercise[],
  navigation: any,
  navOptions?: { tab?: string },
): PlanStartResult {
  if (!entry || (!entry.routineId && entry.exercises.length === 0)) return { status: 'empty' };
  if (entry.routineId) return { status: 'routine' };

  const stamp = Date.now();
  const workoutExercises: WorkoutExercise[] = entry.exercises
    .map((exId, index) => {
      const ex = allExercises.find((e) => e.id === exId);
      if (!ex) return null;
      return {
        id: `we-${stamp}-${index}`,
        exerciseId: ex.id,
        exercise: ex,
        order: index,
        sets: freshSets(Array.from({ length: 4 }, () => ({})), index, stamp),
        restSeconds: 0,
      };
    })
    .filter(Boolean) as WorkoutExercise[];

  if (workoutExercises.length === 0) return { status: 'missing' };

  startWorkoutSafe(
    { id: `workout-${stamp}`, name: entry.name, exercises: workoutExercises },
    navigation,
    navOptions,
  );
  return { status: 'started' };
}

/** Repeat a finished workout: same exercises and weights, nothing marked done. */
export function repeatWorkout(last: Workout, navigation: any, navOptions?: { tab?: string }): void {
  const stamp = Date.now();
  const workoutExercises: WorkoutExercise[] = (last.exercises ?? []).map((we, index) => ({
    ...we,
    id: `we-${stamp}-${index}`,
    sets: freshSets(we.sets ?? [], index, stamp),
  }));
  startWorkoutSafe(
    { id: `workout-${stamp}`, name: last.name, exercises: workoutExercises },
    navigation,
    navOptions,
  );
}
