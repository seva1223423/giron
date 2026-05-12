/**
 * AI-chat command handler hook.
 *
 * Wires `parseChatCommand` (pure regex parser) to live Zustand stores.
 * Returns `tryHandle(text)` → true if a command was recognized AND
 * acted upon. Caller (AIChatScreen) uses the boolean to short-circuit
 * the server send.
 */
import { useCallback } from 'react';
import {
  useWorkoutStore,
  useNutritionStore,
  useCardioStore,
} from '../../store';
import { useMeasurementsStore } from '../../store/useMeasurementsStore';
import { useSleepStore } from '../../store/useSleepStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useThemeStore } from '../../store/useThemeStore';
import { toast } from '../../components/app-modal/toast';
import { localDateStr } from '../../utils/date';
import { parseChatCommand, type ParsedCommand, type MeasurementField, type MealType } from './parseChatCommand';

export interface AIChatCommandHandler {
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
 * Exported for unit testing. The hook is a thin useCallback wrapper —
 * testing `executeCommand` directly avoids a React render shell.
 */
export function executeCommand(cmd: ParsedCommand): void {
  switch (cmd.type) {
    // Phase A
    case 'add_water':           return handleAddWater(cmd.ml);
    case 'add_set':             return handleAddSet(cmd.weight, cmd.reps);
    case 'complete_set':        return handleCompleteSet();
    case 'adjust_weight':       return handleAdjustWeight(cmd.delta);
    case 'next_exercise':       return handleNextExercise();
    case 'prev_exercise':       return handlePrevExercise();
    case 'repeat_last':         return handleRepeatLast();
    // Phase D
    case 'remove_last_set':     return handleRemoveLastSet();
    case 'finish_workout':      return handleFinishWorkout();
    case 'cancel_workout':      return handleCancelWorkout();
    case 'set_weight':          return handleSetWeight(cmd.weight);
    case 'set_reps':            return handleSetReps(cmd.reps);
    case 'set_rest_timer':      return handleSetRestTimer(cmd.seconds);
    case 'set_calories_target': return handleSetCaloriesTarget(cmd.kcal);
    case 'set_water_target':    return handleSetWaterTarget(cmd.ml);
    case 'log_cardio':          return handleLogCardio(cmd.kind, cmd.minutes, cmd.km);
    case 'log_measurement':     return handleLogMeasurement(cmd.field, cmd.cm);
    // Phase E
    case 'log_meal_kcal':       return handleLogMealKcal(cmd.mealType, cmd.kcal);
    case 'reset_water':         return handleResetWater();
    case 'remove_last_meal':    return handleRemoveLastMeal();
    case 'log_sleep':           return handleLogSleep(cmd.hours, cmd.minutes);
    case 'set_theme':           return handleSetTheme(cmd.mode);
    case 'toggle_notifications': return handleToggleNotifications(cmd.enabled);
    case 'toggle_water_reminders': return handleToggleWaterReminders(cmd.enabled);
    case 'schedule_rest_today': return handleScheduleRestToday();
    // Phase E stats (read-only — info toast)
    case 'stats_water':         return handleStatsWater();
    case 'stats_meal':          return handleStatsMeal();
    case 'stats_progress':      return handleStatsProgress();
    case 'stats_last_workout':  return handleStatsLastWorkout();
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

// ─── Phase D handlers ───────────────────────────────────────────────────────

function handleRemoveLastSet(): void {
  const state = useWorkoutStore.getState();
  const aw = state.activeWorkout;
  if (!aw) { toast.warn('Нет активной тренировки'); return; }
  const exIdx = aw.currentExerciseIndex;
  const sets = aw.workout.exercises[exIdx]?.sets ?? [];
  if (sets.length === 0) { toast.info('Подходов нет'); return; }
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
  if (result) toast.success('Тренировка завершена');
  else toast.info('Тренировку нельзя завершить сейчас');
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

function handleSetCaloriesTarget(kcal: number): void {
  const today = localDateStr(new Date());
  const ns = useNutritionStore.getState();
  const dayLog = ns.getDayLog(today);
  ns.setTargets(today, {
    calories: kcal,
    protein: dayLog.targetProtein ?? Math.round((kcal * 0.25) / 4),
    fats: dayLog.targetFats ?? Math.round((kcal * 0.3) / 9),
    carbs: dayLog.targetCarbs ?? Math.round((kcal * 0.45) / 4),
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

function handleLogCardio(
  kind: 'run' | 'walk' | 'cardio',
  minutes: number | undefined,
  km: number | undefined,
): void {
  const today = localDateStr(new Date());
  const cs = useCardioStore.getState();
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
  const label = kind === 'run' ? 'Бег' : kind === 'walk' ? 'Ходьба' : 'Кардио';
  toast.success(`${label}: ${parts.join(', ') || `${fallbackMinutes} мин`}`);
}

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
  useMeasurementsStore.getState().addEntry({ date: today, [field]: cm });
  toast.success(`${MEASUREMENT_LABELS[field]}: ${cm} см`);
}

// ─── Phase E handlers ───────────────────────────────────────────────────────

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

function handleLogMealKcal(mealType: MealType, kcal: number): void {
  const today = localDateStr(new Date());
  // Quick-log without macro breakdown — record the kcal under the right
  // meal-type bucket. Estimate macros from typical Russian-diet split
  // (25P/30F/45C) so the day's totals don't go macro-blind.
  const protein = Math.round((kcal * 0.25) / 4);
  const fats = Math.round((kcal * 0.30) / 9);
  const carbs = Math.round((kcal * 0.45) / 4);
  const now = new Date().toISOString();
  useNutritionStore.getState().addMeal(today, {
    id: `quick-${Date.now()}`,
    type: mealType,
    items: [
      {
        id: `item-${Date.now()}`,
        name: 'Свободная запись',
        calories: kcal,
        protein,
        fats,
        carbs,
        weightGrams: 0,
      },
    ],
    totalCalories: kcal,
    totalProtein: protein,
    totalFats: fats,
    totalCarbs: carbs,
    createdAt: now,
  });
  toast.success(`${MEAL_TYPE_LABELS[mealType]}: ${kcal} ккал`);
}

function handleResetWater(): void {
  const today = localDateStr(new Date());
  const ns = useNutritionStore.getState();
  const current = ns.getDayLog(today).waterMl ?? 0;
  if (current <= 0) {
    toast.info('Вода уже 0');
    return;
  }
  // addWater accepts negative deltas (line 215 in store: simple addition).
  // Pass -current to zero it out. Floor at 0 happens at the store level
  // for any future safety (see clamp in removeWaterAtIndex).
  ns.addWater(today, -current);
  toast.success('Вода обнулена');
}

function handleRemoveLastMeal(): void {
  const today = localDateStr(new Date());
  const ns = useNutritionStore.getState();
  const meals = ns.getDayLog(today).meals ?? [];
  if (meals.length === 0) { toast.info('Приёмов сегодня нет'); return; }
  const last = meals[meals.length - 1];
  ns.removeMeal(today, last.id);
  toast.success(`${MEAL_TYPE_LABELS[last.type as MealType] ?? 'Приём'} убран`);
}

function handleLogSleep(hours: number, minutes: number): void {
  if (hours === 0 && minutes === 0) {
    toast.warn('Длительность сна не может быть 0');
    return;
  }
  const today = localDateStr(new Date());
  // Convention: bedtime 23:00, wakeTime = bedtime + duration (wraps past
  // midnight by mod 24). This is "close enough" for sleep duration logging
  // without forcing the user to enter explicit times.
  const bedtimeH = 23;
  const totalMinutes = hours * 60 + minutes;
  const wakeMinutes = (bedtimeH * 60 + totalMinutes) % (24 * 60);
  const wakeH = Math.floor(wakeMinutes / 60);
  const wakeM = wakeMinutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  useSleepStore.getState().addEntry({
    date: today,
    bedtime: `${pad(bedtimeH)}:00`,
    wakeTime: `${pad(wakeH)}:${pad(wakeM)}`,
  });
  const hoursLabel = minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`;
  toast.success(`Сон: ${hoursLabel}`);
}

function handleSetTheme(mode: 'light' | 'dark' | 'auto'): void {
  useThemeStore.getState().setMode(mode);
  const label = mode === 'dark' ? 'Тёмная тема' : mode === 'light' ? 'Светлая тема' : 'Авто-тема';
  toast.success(label);
}

function handleToggleNotifications(enabled: boolean): void {
  useSettingsStore.getState().setNotificationsEnabled(enabled);
  toast.success(enabled ? 'Уведомления включены' : 'Уведомления выключены');
}

function handleToggleWaterReminders(enabled: boolean): void {
  useSettingsStore.getState().setWaterRemindersEnabled(enabled);
  toast.success(enabled ? 'Напоминания о воде включены' : 'Напоминания о воде выключены');
}

function handleScheduleRestToday(): void {
  // JS getDay: 0=Sun..6=Sat. App uses 0=Mon..6=Sun → convert.
  const jsDow = new Date().getDay();
  const dowMon0 = (jsDow + 6) % 7;
  useWorkoutStore.getState().setWeekPlanDay(dowMon0, null);
  toast.success('Сегодня — день отдыха');
}

// ─── Phase E stats (read-only) ──────────────────────────────────────────────

function handleStatsWater(): void {
  const today = localDateStr(new Date());
  const dayLog = useNutritionStore.getState().getDayLog(today);
  const got = dayLog.waterMl ?? 0;
  const target = dayLog.waterTargetMl ?? 2500;
  const percent = Math.round((got / target) * 100);
  toast.info(`Вода: ${got} / ${target} мл (${percent}%)`);
}

function handleStatsMeal(): void {
  const today = localDateStr(new Date());
  const dayLog = useNutritionStore.getState().getDayLog(today);
  const meals = dayLog.meals ?? [];
  const totalKcal = meals.reduce((s, m) => s + (m.totalCalories ?? 0), 0);
  const totalProtein = Math.round(meals.reduce((s, m) => s + (m.totalProtein ?? 0), 0));
  const targetKcal = dayLog.targetCalories ?? 2000;
  toast.info(
    `Калории: ${totalKcal} / ${targetKcal} ккал · Белок: ${totalProtein} г · Приёмов: ${meals.length}`,
  );
}

function handleStatsProgress(): void {
  const history = useWorkoutStore.getState().workoutHistory ?? [];
  const completed = history.filter((w) => w.completedAt).length;
  const totalVolume = history.reduce((sum, w) => {
    return sum + (w.totalVolume ?? 0);
  }, 0);
  const totalTons = Math.round(totalVolume / 100) / 10;
  toast.info(`Тренировок: ${completed} · Общий объём: ${totalTons} т`);
}

function handleStatsLastWorkout(): void {
  const history = useWorkoutStore.getState().workoutHistory ?? [];
  const last = [...history]
    .filter((w) => w.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];
  if (!last) { toast.info('Тренировок ещё нет'); return; }
  const dateStr = new Date(last.completedAt!).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
  const exCount = last.exercises?.length ?? 0;
  const duration = last.durationMinutes ?? 0;
  toast.info(`${last.name} · ${dateStr} · ${exCount} упр · ${duration} мин`);
}
