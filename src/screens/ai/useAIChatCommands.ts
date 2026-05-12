/**
 * AI-chat command handler hook.
 *
 * Wires `parseChatCommand` (pure regex parser) to live Zustand stores.
 * Returns `tryHandle(text)` → true if a command was recognized AND
 * acted upon. Caller (AIChatScreen) uses the boolean to short-circuit
 * the server send: matched → local mutation + toast, no server roundtrip;
 * unmatched → existing AI-chat-stream flow with quota debit.
 *
 * Design choices:
 *  - `getState()` for store reads/writes — no subscription, no re-render
 *    pressure on the chat list. The hook fires once per message, mutates
 *    once, returns.
 *  - "Recognized but situation wrong" (e.g. `+подход 100×6` with no active
 *    workout) still returns true and shows a soft toast — we don't fall
 *    through to the server because the user clearly wanted a local op.
 *  - Toast feedback uses the top-screen `toast.*` API (Direction A,
 *    `src/components/app-modal/toast.tsx`) for fire-and-forget UI.
 */
import { useCallback } from 'react';
import { useWorkoutStore } from '../../store';
import { useNutritionStore } from '../../store';
import { toast } from '../../components/app-modal/toast';
import { localDateStr } from '../../utils/date';
import { parseChatCommand, type ParsedCommand } from './parseChatCommand';

export interface AIChatCommandHandler {
  /**
   * Parse `text` as a local command and execute it.
   *
   *  - Returns `true` if a command was recognized (acted on the store OR
   *    showed a "can't do that right now" toast). Caller skips server send.
   *  - Returns `false` if no command matched. Caller falls through to the
   *    normal AI-chat send pipeline.
   */
  tryHandle: (text: string) => boolean;
}

export function useAIChatCommands(): AIChatCommandHandler {
  const tryHandle = useCallback((text: string): boolean => {
    const cmd = parseChatCommand(text);
    if (!cmd) return false;
    executeCommand(cmd);
    return true;
  }, []);

  return { tryHandle };
}

/**
 * Exported for unit testing. The hook itself is a thin useCallback
 * wrapper around `parseChatCommand` + `executeCommand` — easier to
 * test `executeCommand` directly without a React render shell.
 */
export function executeCommand(cmd: ParsedCommand): void {
  switch (cmd.type) {
    case 'add_water':
      return handleAddWater(cmd.ml);
    case 'add_set':
      return handleAddSet(cmd.weight, cmd.reps);
    case 'complete_set':
      return handleCompleteSet();
    case 'adjust_weight':
      return handleAdjustWeight(cmd.delta);
    case 'next_exercise':
      return handleNextExercise();
    case 'repeat_last':
      return handleRepeatLast();
  }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

function handleAddWater(ml: number): void {
  const today = localDateStr(new Date());
  useNutritionStore.getState().addWater(today, ml);
  toast.success(`+${ml} мл воды`);
}

function handleAddSet(weight: number, reps: number): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) {
    toast.warn('Нет активной тренировки');
    return;
  }
  const exIdx = aw.currentExerciseIndex;
  state.addSet(exIdx);
  // After `addSet`, the exercise has one more set. Re-read state because
  // Zustand is immutable — the old reference is stale.
  const updated = useWorkoutStore.getState().activeWorkout;
  if (!updated) return; // workout ended between calls (highly unlikely)
  const newSetIdx = updated.workout.exercises[exIdx].sets.length - 1;
  state.updateSetData(exIdx, newSetIdx, { weight, reps });
  toast.success(`+ подход ${weight}×${reps}`);
}

function handleCompleteSet(): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) {
    toast.warn('Нет активной тренировки');
    return;
  }
  const exIdx = aw.currentExerciseIndex;
  const sets = aw.workout.exercises[exIdx]?.sets ?? [];
  const nextPendingIdx = sets.findIndex((s) => !s.completed);
  if (nextPendingIdx === -1) {
    toast.info('Все подходы уже выполнены');
    return;
  }
  const set = sets[nextPendingIdx];
  // completeSet expects `Partial<WorkoutSet>` — forward the existing
  // weight/reps so PR detection sees the right numbers.
  state.completeSet(exIdx, nextPendingIdx, { weight: set.weight, reps: set.reps });
  toast.success('Подход засчитан');
}

function handleAdjustWeight(delta: number): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) {
    toast.warn('Нет активной тренировки');
    return;
  }
  const exIdx = aw.currentExerciseIndex;
  const sets = aw.workout.exercises[exIdx]?.sets ?? [];
  let changed = 0;
  sets.forEach((set, i) => {
    if (!set.completed && set.weight != null) {
      const next = Math.max(0, set.weight + delta);
      // Re-fetch state on each call so we're always operating on the
      // latest sets array (immutable updates between iterations).
      useWorkoutStore.getState().updateSetData(exIdx, i, { weight: next });
      changed++;
    }
  });
  if (changed === 0) {
    toast.info('Нет невыполненных подходов');
    return;
  }
  toast.success(delta > 0 ? `+${delta} кг на все` : `${delta} кг на все`);
}

function handleNextExercise(): void {
  const state = useWorkoutStore.getState();
  if (!state.activeWorkout) {
    toast.warn('Нет активной тренировки');
    return;
  }
  state.nextExercise();
  toast.info('Следующее упражнение');
}

function handleRepeatLast(): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) {
    toast.warn('Нет активной тренировки');
    return;
  }
  const exIdx = aw.currentExerciseIndex;
  const sets = aw.workout.exercises[exIdx]?.sets ?? [];
  // Find the latest completed set with a weight/reps payload to copy.
  const lastDone = [...sets].reverse().find((s) => s.completed && s.weight != null && s.reps != null);
  if (!lastDone) {
    toast.warn('Нет выполненного подхода');
    return;
  }
  state.addSet(exIdx);
  const updated = useWorkoutStore.getState().activeWorkout;
  if (!updated) return;
  const newSetIdx = updated.workout.exercises[exIdx].sets.length - 1;
  state.updateSetData(exIdx, newSetIdx, { weight: lastDone.weight, reps: lastDone.reps });
  toast.success(`Повтор ${lastDone.weight}×${lastDone.reps}`);
}
