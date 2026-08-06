/**
 * Applying the coach's workout actions to the running session.
 *
 * A session in progress lives only in the client store — it does not reach the
 * database until it ends. So the server's `log_active_set` and
 * `generate_warmup` carry intent, and these functions are what turns that
 * intent into sets the person actually sees.
 *
 * They live here rather than in AIChatScreen because they are pure logic over
 * the store, and importing the screen to test them would drag in navigation
 * and half of expo.
 */

import { useWorkoutStore } from '../store/useWorkoutStore';

/**
 * Which exercise the coach meant. Names arrive as the person said them —
 * "жим" for "Жим лёжа" — so matching is deliberately loose. Returns -1 when
 * nothing matches; the caller decides whether that is fatal.
 */
export function findExerciseIndex(exercises: any[], spoken: string): number {
  const needle = spoken.toLowerCase().trim();
  if (!needle) return -1;
  return exercises.findIndex((ex) => {
    const name = (ex.exercise?.name ?? '').toLowerCase();
    if (!name) return false;
    return name === needle || name.includes(needle) || needle.includes(name);
  });
}

/** Log a set the person reported in chat into the session that is running. */
export function applyCoachSet(data: {
  weight?: number;
  reps?: number;
  rpe?: number;
  exerciseName?: string;
}): boolean {
  const store = useWorkoutStore.getState();
  const active = store.activeWorkout;
  if (!active || typeof data.reps !== 'number') return false;

  const exercises = active.workout.exercises ?? [];
  let exIndex = active.currentExerciseIndex ?? 0;

  if (data.exerciseName) {
    const found = findExerciseIndex(exercises, data.exerciseName);
    if (found < 0) return false;
    exIndex = found;
  }

  const target = exercises[exIndex];
  if (!target) return false;

  // Fill the next unfinished set; if every planned set is done, add one —
  // an extra set is a normal thing to do and refusing it would be worse.
  let setIndex = (target.sets ?? []).findIndex((st: any) => !st.completed);
  if (setIndex < 0) {
    store.addSet(exIndex);
    setIndex =
      (useWorkoutStore.getState().activeWorkout?.workout.exercises[exIndex].sets.length ?? 1) - 1;
  }

  store.completeSet(exIndex, setIndex, {
    weight: data.weight ?? 0,
    reps: data.reps,
    ...(typeof data.rpe === 'number' ? { rpe: data.rpe } : {}),
  });
  return true;
}

/**
 * Warm-up sets for an exercise in the running session.
 *
 * `generate_warmup` used to be a tool that did nothing: it returned a sentence
 * telling the person to go find a button, so the coach announced a warm-up
 * that never appeared. The store already builds one — the same action the
 * button in the tracker calls — so both paths now produce the same sets.
 *
 * Returns why it could not be applied, or null when it worked.
 */
export function applyCoachWarmup(data: { exerciseName?: string }): string | null {
  const store = useWorkoutStore.getState();
  const active = store.activeWorkout;
  if (!active) return 'Разминку некуда добавить — тренировка не идёт';

  const exercises = active.workout.exercises ?? [];
  let exIndex = active.currentExerciseIndex ?? 0;

  if (data.exerciseName) {
    const found = findExerciseIndex(exercises, data.exerciseName);
    if (found < 0) return `«${data.exerciseName}» нет в этой тренировке`;
    exIndex = found;
  }

  const target = exercises[exIndex];
  if (!target) return 'Разминку некуда добавить — упражнение не найдено';

  // Skip warm-up sets when reading the working weight. Asking twice would
  // otherwise take 40% of the 40% set and the warm-up would shrink each time.
  const working = (target.sets ?? []).find(
    (st: any) => st.type !== 'warmup' && (st.weight || 0) > 0,
  );
  if (!working?.weight) return 'Сначала поставь рабочий вес — разминка считается от него';

  store.generateWarmupSets(exIndex, working.weight);
  return null;
}
