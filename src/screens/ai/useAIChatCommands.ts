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
import {
  useWorkoutStore,
  useNutritionStore,
  useCardioStore,
} from '../../store';
import { useMeasurementsStore } from '../../store/useMeasurementsStore';
import { toast } from '../../components/app-modal/toast';
import { localDateStr } from '../../utils/date';
import { parseChatCommand, type ParsedCommand, type MeasurementField } from './parseChatCommand';

export interface AIChatCommandHandler {
  /**
   * Parse `text` as a local command and execute it.
   *
   *  - Returns `true` if a command was recognized (acted on a store OR
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
    case 'add_water':         return handleAddWater(cmd.ml);
    case 'add_set':           return handleAddSet(cmd.weight, cmd.reps);
    case 'complete_set':      return handleCompleteSet();
    case 'adjust_weight':     return handleAdjustWeight(cmd.delta);
    case 'next_exercise':     return handleNextExercise();
    case 'prev_exercise':     return handlePrevExercise();
    case 'repeat_last':       return handleRepeatLast();
    case 'remove_last_set':   return handleRemoveLastSet();
    case 'finish_workout':    return handleFinishWorkout();
    case 'cancel_workout':    return handleCancelWorkout();
    case 'set_weight':        return handleSetWeight(cmd.weight);
    case 'set_reps':          return handleSetReps(cmd.reps);
    case 'set_rest_timer':    return handleSetRestTimer(cmd.seconds);
    case 'set_calories_target': return handleSetCaloriesTarget(cmd.kcal);
    case 'set_water_target':  return handleSetWaterTarget(cmd.ml);
    case 'log_cardio':        return handleLogCardio(cmd.kind, cmd.minutes, cmd.km);
    case 'log_measurement':   return handleLogMeasurement(cmd.field, cmd.cm);
  }
}

// ─── Phase A handlers ───────────────────────────────────────────────────────

function handleAddWater(ml: number): void {
  const today = localDateStr(new Date());
  useNutritionStore.getState().addWater(today, ml);
  toast.success(`+${ml} мл воды`);
}

function handleAddSet(weight: number, reps: number): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) { toast.warn('Нет активной тренировки'); return; }
  const exIdx = aw.currentExerciseIndex;
  state.addSet(exIdx);
  const updated = useWorkoutStore.getState().activeWorkout;
  if (!updated) return;
  const newSetIdx = updated.workout.exercises[exIdx].sets.length - 1;
  state.updateSetData(exIdx, newSetIdx, { weight, reps });
  toast.success(`+ подход ${weight}×${reps}`);
}

function handleCompleteSet(): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) { toast.warn('Нет активной тренировки'); return; }
  const exIdx = aw.currentExerciseIndex;
  const sets = aw.workout.exercises[exIdx]?.sets ?? [];
  const nextPendingIdx = sets.findIndex((s) => !s.completed);
  if (nextPendingIdx === -1) { toast.info('Все подходы уже выполнены'); return; }
  const set = sets[nextPendingIdx];
  state.completeSet(exIdx, nextPendingIdx, { weight: set.weight, reps: set.reps });
  toast.success('Подход засчитан');
}

function handleAdjustWeight(delta: number): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) { toast.warn('Нет активной тренировки'); return; }
  const exIdx = aw.currentExerciseIndex;
  const sets = aw.workout.exercises[exIdx]?.sets ?? [];
  let changed = 0;
  sets.forEach((set, i) => {
    if (!set.completed && set.weight != null) {
      const next = Math.max(0, set.weight + delta);
      useWorkoutStore.getState().updateSetData(exIdx, i, { weight: next });
      changed++;
    }
  });
  if (changed === 0) { toast.info('Нет невыполненных подходов'); return; }
  toast.success(delta > 0 ? `+${delta} кг на все` : `${delta} кг на все`);
}

function handleNextExercise(): void {
  const state = useWorkoutStore.getState();
  if (!state.activeWorkout) { toast.warn('Нет активной тренировки'); return; }
  state.nextExercise();
  toast.info('Следующее упражнение');
}

function handlePrevExercise(): void {
  const state = useWorkoutStore.getState();
  if (!state.activeWorkout) { toast.warn('Нет активной тренировки'); return; }
  state.prevExercise();
  toast.info('Предыдущее упражнение');
}

function handleRepeatLast(): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) { toast.warn('Нет активной тренировки'); return; }
  const exIdx = aw.currentExerciseIndex;
  const sets = aw.workout.exercises[exIdx]?.sets ?? [];
  const lastDone = [...sets].reverse().find((s) => s.completed && s.weight != null && s.reps != null);
  if (!lastDone) { toast.warn('Нет выполненного подхода'); return; }
  state.addSet(exIdx);
  const updated = useWorkoutStore.getState().activeWorkout;
  if (!updated) return;
  const newSetIdx = updated.workout.exercises[exIdx].sets.length - 1;
  state.updateSetData(exIdx, newSetIdx, { weight: lastDone.weight, reps: lastDone.reps });
  toast.success(`Повтор ${lastDone.weight}×${lastDone.reps}`);
}

// ─── Phase D handlers — workout extras ──────────────────────────────────────

function handleRemoveLastSet(): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) { toast.warn('Нет активной тренировки'); return; }
  const exIdx = aw.currentExerciseIndex;
  const sets = aw.workout.exercises[exIdx]?.sets ?? [];
  if (sets.length === 0) { toast.info('Подходов нет'); return; }
  // Refuse to delete a completed set silently — if the user wants to
  // undo a logged set, they should swipe in the workout screen so PR
  // history stays auditable.
  const lastIdx = sets.length - 1;
  if (sets[lastIdx].completed) {
    toast.info('Последний подход уже выполнен — снимите в экране тренировки');
    return;
  }
  state.removeSet(exIdx, lastIdx);
  toast.success('Подход убран');
}

function handleFinishWorkout(): void {
  const state = useWorkoutStore.getState();
  if (!state.activeWorkout) { toast.warn('Нет активной тренировки'); return; }
  const result = state.finishWorkout();
  if (result) {
    toast.success('Тренировка завершена');
  } else {
    toast.info('Тренировку нельзя завершить сейчас');
  }
}

function handleCancelWorkout(): void {
  const state = useWorkoutStore.getState();
  if (!state.activeWorkout) { toast.warn('Нет активной тренировки'); return; }
  state.cancelWorkout();
  toast.success('Тренировка отменена');
}

function handleSetWeight(weight: number): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) { toast.warn('Нет активной тренировки'); return; }
  const exIdx = aw.currentExerciseIndex;
  const sets = aw.workout.exercises[exIdx]?.sets ?? [];
  const firstPending = sets.findIndex((s) => !s.completed);
  if (firstPending === -1) { toast.info('Нет невыполненных подходов'); return; }
  state.updateSetData(exIdx, firstPending, { weight });
  toast.success(`Вес: ${weight} кг`);
}

function handleSetReps(reps: number): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) { toast.warn('Нет активной тренировки'); return; }
  const exIdx = aw.currentExerciseIndex;
  const sets = aw.workout.exercises[exIdx]?.sets ?? [];
  const firstPending = sets.findIndex((s) => !s.completed);
  if (firstPending === -1) { toast.info('Нет невыполненных подходов'); return; }
  state.updateSetData(exIdx, firstPending, { reps });
  toast.success(`Повторов: ${reps}`);
}

function handleSetRestTimer(seconds: number): void {
  const state = useWorkoutStore.getState();
  if (!state.activeWorkout) { toast.warn('Нет активной тренировки'); return; }
  state.setRestTimer(seconds);
  toast.success(`Отдых: ${seconds} сек`);
}

// ─── Phase D handlers — nutrition targets ───────────────────────────────────

function handleSetCaloriesTarget(kcal: number): void {
  const today = localDateStr(new Date());
  const ns = useNutritionStore.getState();
  const dayLog = ns.getDayLog(today);
  // Preserve other macros — setTargets requires the full target shape.
  // Keep current protein/fats/carbs/water proportions.
  ns.setTargets(today, {
    calories: kcal,
    protein: dayLog.targetProtein ?? Math.round(kcal * 0.25 / 4),
    fats: dayLog.targetFats ?? Math.round(kcal * 0.3 / 9),
    carbs: dayLog.targetCarbs ?? Math.round(kcal * 0.45 / 4),
    waterTargetMl: dayLog.waterTargetMl,
  });
  toast.success(`Цель: ${kcal} ккал`);
}

function handleSetWaterTarget(ml: number): void {
  const today = localDateStr(new Date());
  const ns = useNutritionStore.getState();
  const dayLog = ns.getDayLog(today);
  ns.setTargets(today, {
    calories: dayLog.targetCalories,
    protein: dayLog.targetProtein,
    fats: dayLog.targetFats ?? 0,
    carbs: dayLog.targetCarbs ?? 0,
    waterTargetMl: ml,
  });
  toast.success(`Цель воды: ${ml} мл`);
}

// ─── Phase D handlers — cardio ──────────────────────────────────────────────

function handleLogCardio(
  kind: 'run' | 'walk' | 'cardio',
  minutes: number | undefined,
  km: number | undefined,
): void {
  const today = localDateStr(new Date());
  const cs = useCardioStore.getState();
  // The store wants: { type, date, durationMinutes, distanceKm?, ... }.
  // For a "пробежал 5 км" command with no minutes, estimate a sane
  // duration: 6 min/km for run, 12 min/km for walk. Better than null.
  const fallbackMinutes =
    minutes != null
      ? minutes
      : km != null
        ? Math.round(km * (kind === 'walk' ? 12 : 6))
        : 30;
  cs.addSession({
    type: kind === 'walk' ? 'walking' : kind === 'run' ? 'running' : 'other',
    date: today,
    durationMinutes: fallbackMinutes,
    distanceKm: km,
  });
  const parts: string[] = [];
  if (km != null) parts.push(`${km} км`);
  if (minutes != null) parts.push(`${minutes} мин`);
  const label =
    kind === 'run' ? 'Бег' : kind === 'walk' ? 'Ходьба' : 'Кардио';
  toast.success(`${label}: ${parts.join(', ') || `${fallbackMinutes} мин`}`);
}

// ─── Phase D handlers — measurements ────────────────────────────────────────

const MEASUREMENT_LABELS: Record<MeasurementField, string> = {
  chest: 'Грудь',
  waist: 'Талия',
  hips: 'Бёдра',
  bicep: 'Бицепс',
  thigh: 'Бедро',
  calf: 'Икра',
  neck: 'Шея',
};

function handleLogMeasurement(field: MeasurementField, cm: number): void {
  const today = localDateStr(new Date());
  useMeasurementsStore.getState().addEntry({
    date: today,
    [field]: cm,
  });
  toast.success(`${MEASUREMENT_LABELS[field]}: ${cm} см`);
}
