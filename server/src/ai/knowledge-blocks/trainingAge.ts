/**
 * Block 115: Training-Age-Aware Coaching Tone
 *
 * Originally inline at ai.ts L18800 (`getTrainingAgeAdvice`). Pure
 * function — picks advice tone (beginner / intermediate / advanced)
 * from experience years + fitness level + total workouts.
 *
 * Returns a SYSTEM-PROMPT directive that tells the LLM how to dial
 * its language and detail level. Always emits SOMETHING — even for
 * unknown experience, it picks beginner as the safe default.
 */

import type { KnowledgeBlock, KnowledgeBlockInput } from './types';

interface TrainingAgeInput extends KnowledgeBlockInput {
  totalWorkouts?: number;
}

function buildTrainingAgeAdvice(input: TrainingAgeInput): string {
  const { trainingExperienceYears, fitnessLevel, totalWorkouts = 0 } = input;

  let effectiveAge = trainingExperienceYears ?? 0;
  if (!trainingExperienceYears && totalWorkouts > 0) {
    effectiveAge = Math.min(totalWorkouts / 150, 5);
  }

  const level = fitnessLevel?.toLowerCase() || 'beginner';

  if (effectiveAge < 1 || level === 'beginner') {
    return `\n\n## 🎓 УРОВЕНЬ СОВЕТОВ: НОВИЧОК
Тренировочный стаж: <1 года. Давай ПРОСТЫЕ советы:
- Базовые упражнения, не усложняй
- Объясняй ЗАЧЕМ, а не только КАК
- Не используй жаргон: RPE, периодизация, мезоцикл — только простые слова
- Прогресс линейный: каждую неделю +2.5 кг на штангу
- Мотивируй часто, критикуй мягко`;
  }

  if (effectiveAge < 3 || level === 'intermediate') {
    return `\n\n## 🎓 УРОВЕНЬ СОВЕТОВ: СРЕДНИЙ
Тренировочный стаж: 1-3 года. Можно использовать:
- RPE/RIR для регулировки нагрузки
- Периодизацию (волнообразная, блоковая)
- Суперсеты и дроп-сеты
- Анализ слабых мест`;
  }

  return `\n\n## 🎓 УРОВЕНЬ СОВЕТОВ: ПРОДВИНУТЫЙ
Тренировочный стаж: 3+ лет. Говори на равных:
- DUP, conjugate, block periodization
- Специализация на слабые мышцы
- Тонкая настройка объёма и интенсивности
- Продвинутые техники: кластерные сеты, мио-репс`;
}

export const trainingAgeBlock: KnowledgeBlock = {
  id: 'coaching:training-age-tone',
  // Always-relevant — selected on every turn to tune the LLM's tone.
  // Keywords ensure higher rank when the user mentions experience or
  // asks for plan recommendations.
  keywords: [
    'стаж', 'опыт', 'новичок', 'продвинутый', 'средний',
    'давно', 'тренируюсь', 'годами', 'месяцев',
  ],
  build: (input) => buildTrainingAgeAdvice(input as TrainingAgeInput),
};
