/**
 * Block 15: Confidence Directives & Limitations
 *
 * Originally inline at ai.ts L13265 (`getConfidenceDirective`). Pure
 * function of the user profile + message — flags incomplete data,
 * medical questions, and contradictory goals so the LLM dials back
 * confidence appropriately.
 *
 * Signature adapter: the inline version took `(user: any, message: string)`.
 * In the block shape we take a typed `KnowledgeBlockInput`; the caller
 * (contextEngine) provides the user-derived flags. This avoids any-typed
 * payloads leaking into the new module.
 */

import type { KnowledgeBlock, KnowledgeBlockInput } from './types';

interface ConfidenceInput extends KnowledgeBlockInput {
  hasWeightKg?: boolean;
  hasHeightCm?: boolean;
  hasGoal?: boolean;
  hasGender?: boolean;
}

function buildConfidenceDirective(input: ConfidenceInput): string {
  const directives: string[] = [];
  const { message } = input;

  // Medical/clinical questions — lower confidence, recommend specialist
  const medicalPatterns = /(?:диагноз|лечени[ея]|лекарств|таблетк|уколы?|стероид|гормональн\s*тераpi|курс\s*(?:тест|стероид)|мрт|узи|рентген|анализ\s*(?:кров|мочи))/i;
  if (medicalPatterns.test(message)) {
    directives.push('⚠️ ОСТОРОЖНОСТЬ: Вопрос касается медицины. НЕ ставь диагнозы и НЕ назначай лечение. Дай общую информацию и ОБЯЗАТЕЛЬНО рекомендуй обратиться к спортивному врачу / эндокринологу / ортопеду.');
  }

  // Incomplete profile — flag uncertainty in calculations
  const missingCritical: string[] = [];
  if (!input.hasWeightKg) missingCritical.push('вес');
  if (!input.hasHeightCm) missingCritical.push('рост');
  if (!input.hasGoal) missingCritical.push('цель');
  if (!input.hasGender) missingCritical.push('пол');

  if (missingCritical.length >= 2) {
    directives.push(`⚠️ НЕПОЛНЫЕ ДАННЫЕ: Не хватает: ${missingCritical.join(', ')}. Любые расчёты (КБЖУ, программа) будут приблизительными — СКАЖИ ОБ ЭТОМ и попроси заполнить профиль.`);
  }

  // Contradictory goals
  const contradictions = [
    { pattern: /(?:похуде|сушк|дефицит).*(?:набр|масс|объём)/i, msg: 'Пользователь говорит одновременно про похудение и набор массы — уточни приоритет.' },
    { pattern: /(?:не\s*ем|голода|0\s*калорий).*(?:масс|сил|рос)/i, msg: 'Пользователь хочет расти но не ест — объясни почему это невозможно.' },
  ];
  for (const c of contradictions) {
    if (c.pattern.test(message)) {
      directives.push(`⚠️ ПРОТИВОРЕЧИЕ: ${c.msg}`);
    }
  }

  return directives.length > 0
    ? `\n\n## ⚖️ УВЕРЕННОСТЬ И ОГРАНИЧЕНИЯ\n${directives.join('\n')}`
    : '';
}

export const confidenceDirectiveBlock: KnowledgeBlock = {
  id: 'safety:confidence-directive',
  // Always-on signal — selected on every turn regardless of keyword match.
  // The keywords below ensure the TF-IDF selector ranks it high when
  // medical or contradiction signals appear in the message.
  keywords: [
    'диагноз', 'лечение', 'лекарство', 'стероид', 'гормон',
    'мрт', 'узи', 'анализ', 'врач',
    'похудеть', 'набрать', 'масса', 'дефицит',
  ],
  build: (input) => buildConfidenceDirective(input as ConfidenceInput),
};
