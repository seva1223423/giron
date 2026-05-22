/**
 * Block 181: Macro Split Recommendation
 *
 * Originally inline at ai.ts L21373 (`getMacroSplitAdvice`). Pure
 * function — takes user goal + body weight + training frequency,
 * returns macro split recommendation.
 *
 * Goal value accepts the lower-case form used by some prompts
 * ('weight_loss', 'muscle_gain'); the live route normalises both
 * lower and upper case before calling. Keep the same convention here.
 */

import type { KnowledgeBlock, KnowledgeBlockInput } from './types';

interface MacroSplitInput extends KnowledgeBlockInput {
  bodyWeightKg?: number | null;
  trainingDaysPerWeek?: number;
}

function buildMacroSplitAdvice(input: MacroSplitInput): string {
  const { userGoal, bodyWeightKg, trainingDaysPerWeek = 3 } = input;
  if (!bodyWeightKg) return '';

  const goal = (userGoal ?? '').toLowerCase();
  const protein = Math.round(
    bodyWeightKg *
      (goal === 'weight_loss' ? 2.2 : goal === 'muscle_gain' ? 2.0 : 1.8),
  );

  let carbPct: number;
  let fatPct: number;

  if (goal === 'weight_loss') {
    carbPct = trainingDaysPerWeek >= 4 ? 35 : 30;
    fatPct = 30;
  } else if (goal === 'muscle_gain') {
    carbPct = 45;
    fatPct = 25;
  } else {
    carbPct = 40;
    fatPct = 30;
  }

  const proteinPct = 100 - carbPct - fatPct;
  const cals = protein * 4 + Math.round(bodyWeightKg * 35);
  const carbs = Math.round((cals * carbPct) / 100 / 4);
  const fats = Math.round((cals * fatPct) / 100 / 9);

  return `\n\n## 🥩 РЕКОМЕНДУЕМОЕ СООТНОШЕНИЕ МАКРОСОВ
Цель: ${goal === 'weight_loss' ? 'похудение' : goal === 'muscle_gain' ? 'набор массы' : 'поддержание формы'}
Белок: ~${protein}г/день (${proteinPct}% калорий)
Углеводы: ~${carbs}г/день (${carbPct}% калорий)
Жиры: ~${fats}г/день (${fatPct}% калорий)
Используй если пользователь спрашивает про питание или похудение.`;
}

export const macroSplitBlock: KnowledgeBlock = {
  id: 'nutrition:macro-split',
  keywords: [
    'макрос', 'бжу', 'белок', 'жиры', 'углеводы',
    'калории', 'кбжу', 'соотношение', 'питание',
    'похуде', 'набор', 'дефицит', 'профицит',
  ],
  build: (input) => buildMacroSplitAdvice(input as MacroSplitInput),
};
