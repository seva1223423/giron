import type { IconName } from '../../../components';

export interface DynamicPrompt {
  iconName: IconName;
  text: string;
}

export interface PromptInputs {
  workoutHistory: Array<{
    name: string;
    completedAt?: string | null;
    startedAt?: string | null;
    totalVolume?: number | null;
  }>;
  activeProgram: { name: string; workouts?: Array<{ name: string }> } | null;
  /** Today's log from the nutrition store. */
  todayNutrition: {
    proteinEaten: number;
    proteinTarget: number;
    mealsCount: number;
  } | null;
  /** Last night's sleep, if logged. */
  lastSleepHours: number | null;
  /** Client's local hour 0-23. */
  hour: number;
  now?: Date;
}

/**
 * Quick prompts built from the person's own data.
 *
 * The old set knew one domain: it could suggest analysing a workout but had
 * no idea protein was 40 grams behind at eight in the evening, or that last
 * night's sleep was five hours — even though both stores sit right next to
 * the workout one. The best prompt is the question the person should be
 * asking right now; these are the cross-domain cases, ordered so the most
 * actionable-today comes first.
 *
 * Pure function so tests cover the logic without rendering a hook: the same
 * split as wheel.ts and coachActions.ts.
 */
export function buildDynamicPrompts(inp: PromptInputs): DynamicPrompt[] {
  const prompts: DynamicPrompt[] = [];
  const now = inp.now ?? new Date();

  // Evening + protein far behind → the single most fixable gap of the day.
  if (
    inp.hour >= 17 &&
    inp.todayNutrition &&
    inp.todayNutrition.proteinTarget > 0 &&
    inp.todayNutrition.proteinEaten < inp.todayNutrition.proteinTarget * 0.6
  ) {
    const left = Math.round(inp.todayNutrition.proteinTarget - inp.todayNutrition.proteinEaten);
    prompts.push({ iconName: 'apple', text: `Чем добрать ${left} г белка сегодня вечером?` });
  }

  // Short night before a possible session → adjust, not cancel.
  if (inp.lastSleepHours !== null && inp.lastSleepHours > 0 && inp.lastSleepHours < 6) {
    prompts.push({
      iconName: 'moon',
      text: `Спал ${String(inp.lastSleepHours).replace('.', ',')} ч — как скорректировать сегодняшнюю тренировку?`,
    });
  }

  // Evening and the diary is empty — the cheapest moment to reconstruct it.
  if (inp.hour >= 19 && inp.todayNutrition && inp.todayNutrition.mealsCount === 0) {
    prompts.push({ iconName: 'apple', text: 'Помоги записать, что я сегодня ел' });
  }

  // ── The original workout-domain prompts, unchanged in spirit ──
  if (inp.activeProgram?.workouts?.length) {
    const firstWorkout = inp.activeProgram.workouts[0];
    prompts.push({ iconName: 'dumbbell', text: `Сделай тренировку "${firstWorkout.name}" немного легче` });
    prompts.push({ iconName: 'dumbbell', text: `Убери одно упражнение из "${firstWorkout.name}" — устала спина` });
  }

  if (inp.workoutHistory.length > 0) {
    const last = inp.workoutHistory[0];
    prompts.push({ iconName: 'chart', text: `Разбери мою последнюю тренировку: ${last.name}` });

    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const weekWorkouts = inp.workoutHistory.filter(
      (w) => new Date(w.completedAt || w.startedAt || '').getTime() > weekAgo,
    );
    if (weekWorkouts.length >= 2) {
      const totalVol = weekWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
      prompts.push({
        iconName: 'chart',
        text: `Анализ моей недели: ${weekWorkouts.length} тренировок, объём ${Math.round((totalVol / 1000) * 10) / 10} т`,
      });
    }

    const trainedDates = inp.workoutHistory
      .map((w) => new Date(w.completedAt || w.startedAt || '').toDateString())
      .filter((v, i, a) => a.indexOf(v) === i);
    let consecutive = 0;
    for (let i = 0; i < 4; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      if (trainedDates.includes(d.toDateString())) consecutive++;
      else break;
    }
    if (consecutive >= 3) {
      prompts.push({ iconName: 'moon', text: `Тренируюсь ${consecutive} дня подряд — стоит ли взять день отдыха?` });
    }
  }

  if (inp.activeProgram?.workouts && inp.activeProgram.workouts.length > 1 && inp.workoutHistory.length < 3) {
    prompts.push({ iconName: 'target', text: `Расставь тренировки программы "${inp.activeProgram.name}" по дням недели` });
  }

  if (!inp.activeProgram) {
    prompts.push({ iconName: 'target', text: 'Составь мне программу тренировок Толчок-Тяга-Ноги на 3 дня в неделю' });
  }

  // The chip row fits a handful; past that the good ones drown.
  return prompts.slice(0, 6);
}
