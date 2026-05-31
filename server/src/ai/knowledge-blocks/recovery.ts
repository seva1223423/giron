/**
 * Block 50: Smart Rest Period Suggestion
 *
 * Originally inline at ai.ts L14516 (`getSmartRestSuggestion`). Pure
 * function — picks an appropriate rest window based on exercise type,
 * set type, RPE, and the user's training goal.
 *
 * Returns a structured value (not a prose snippet) — the caller in
 * ai.ts wraps the output into a prompt-line. The block interface
 * normalises to a string for registry consistency.
 */

import type { KnowledgeBlock, KnowledgeBlockInput } from './types';

interface RestInput extends KnowledgeBlockInput {
  exerciseCategory?: string; // strength | cardio | flexibility
  exerciseType?: string;     // barbell | dumbbell | machine | bodyweight | cable
  setType?: string;          // normal | warmup | dropset | superset
  lastRpe?: number | null;
}

export interface RestSuggestion {
  restSeconds: number;
  reason: string;
}

/** Programmatic access — returns the structured suggestion. The block's
 *  `build()` formats this as prose for the system prompt. */
export function computeSmartRest(input: RestInput): RestSuggestion {
  const { exerciseType, setType, lastRpe, userGoal } = input;

  let baseRest = 90;
  if (exerciseType === 'barbell') baseRest = 120;
  else if (exerciseType === 'machine') baseRest = 60;
  else if (exerciseType === 'bodyweight') baseRest = 60;
  else if (exerciseType === 'cable') baseRest = 60;

  if (setType === 'warmup') {
    return { restSeconds: 60, reason: 'Разминочный подход — 60 сек достаточно.' };
  }
  if (setType === 'dropset') {
    return { restSeconds: 15, reason: 'Дроп-сет — минимальный отдых (10-15 сек) для максимального пампинга.' };
  }
  if (setType === 'superset') {
    return { restSeconds: 30, reason: 'Суперсет — 30 сек между упражнениями, 90 сек между кругами.' };
  }

  if (userGoal === 'STRENGTH') {
    baseRest = Math.max(baseRest, 180);
  } else if (userGoal === 'MUSCLE_GAIN') {
    baseRest = Math.min(baseRest, 90);
  } else if (userGoal === 'WEIGHT_LOSS') {
    baseRest = Math.min(baseRest, 60);
  } else if (userGoal === 'ENDURANCE') {
    baseRest = Math.min(baseRest, 45);
  }

  if (lastRpe !== null && lastRpe !== undefined) {
    if (lastRpe >= 9) baseRest += 60;
    else if (lastRpe >= 8) baseRest += 30;
  }

  let reason = '';
  if (userGoal === 'STRENGTH') reason = `Силовая цель — длинный отдых (${baseRest} сек) для полного восстановления АТФ.`;
  else if (userGoal === 'MUSCLE_GAIN') reason = `Гипертрофия — ${baseRest} сек для оптимального метаболического стресса.`;
  else if (userGoal === 'WEIGHT_LOSS') reason = `Жиросжигание — ${baseRest} сек для поддержания ЧСС.`;
  else reason = `Рекомендуемый отдых: ${baseRest} сек.`;

  return { restSeconds: baseRest, reason };
}

export const smartRestBlock: KnowledgeBlock = {
  id: 'recovery:smart-rest',
  keywords: [
    'отдых', 'пауза', 'между подходами', 'rest',
    'rpe', 'восстановление', 'дроп-сет', 'суперсет',
    'разминка', 'warmup',
  ],
  build: (input) => {
    const r = computeSmartRest(input as RestInput);
    return `\n\n## ⏲️ ОТДЫХ МЕЖДУ ПОДХОДАМИ
${r.restSeconds} сек — ${r.reason}`;
  },
};
