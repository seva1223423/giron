/**
 * Block 68: Rep Range Recommendation
 *
 * Originally inline at ai.ts L16283 (`getRepRangeAdvice`). Pure function
 * of user goal, training age, and current phase. Returns the
 * recommended rep range with rationale.
 */

import type { KnowledgeBlock, KnowledgeBlockInput } from './types';

interface RepRangeInput extends KnowledgeBlockInput {
  /** Months or years training — block accepts the same shape as the
   *  inline original (years; fractional ok). */
  trainingAgeYears?: number;
  /** "deload" | "accumulation" | "intensification" — same as the
   *  inline `currentPhase`. Optional; default behaviour skips phase
   *  modifier. */
  currentPhase?: string;
}

interface RepRange {
  main: string;
  auxiliary: string;
  rationale: string;
}

const REP_RANGES: Record<string, RepRange> = {
  STRENGTH: {
    main: '3-5 повторений @ 85-95% 1RM',
    auxiliary: '6-8 повторений @ 70-80% 1RM',
    rationale: 'Тяжёлые подходы развивают максимальную силу (нейромышечная адаптация)',
  },
  MUSCLE_GAIN: {
    main: '8-12 повторений @ 65-75% 1RM',
    auxiliary: '12-15 повторений @ 55-65% 1RM',
    rationale: 'Средний диапазон оптимален для гипертрофии (механическое напряжение + метаболический стресс)',
  },
  WEIGHT_LOSS: {
    main: '12-15 повторений @ 55-65% 1RM',
    auxiliary: '15-20 повторений @ 45-55% 1RM',
    rationale: 'Высокий объём + короткий отдых = больше калорий сожжено + сохранение мышц',
  },
  ENDURANCE: {
    main: '15-25 повторений @ 40-55% 1RM',
    auxiliary: '25-30+ повторений или время под нагрузкой',
    rationale: 'Длительная нагрузка развивает мышечную выносливость и капиллярную сеть',
  },
  GENERAL_FITNESS: {
    main: '8-15 повторений @ 60-75% 1RM',
    auxiliary: '6-8 тяжёлых + 15-20 лёгких (чередование)',
    rationale: 'Широкий диапазон для всестороннего развития',
  },
};

function buildRepRangeAdvice(input: RepRangeInput): string {
  const { userGoal, trainingAgeYears = 0, currentPhase } = input;
  if (!userGoal) return '';

  const range = REP_RANGES[userGoal] || REP_RANGES.GENERAL_FITNESS;

  let modifier = '';
  if (trainingAgeYears < 1) {
    modifier = '\n📌 Новичкам (<1 года) лучше начинать со средних диапазонов (8-12) и техники.';
  } else if (trainingAgeYears > 5) {
    modifier = '\n📌 Опытным атлетам (>5 лет) полезна периодизация — чередуй диапазоны еженедельно.';
  }

  let phaseNote = '';
  if (currentPhase === 'deload') {
    phaseNote = '\n🔄 Деload — снизь объём на 40-60% от обычного, диапазоны те же.';
  } else if (currentPhase === 'intensification') {
    phaseNote = '\n🔥 Интенсификация — ближе к нижнему краю диапазона, добавь 5-10% веса.';
  }

  return `\n\n## 🎯 ДИАПАЗОНЫ ПОВТОРЕНИЙ
- Основные упражнения: ${range.main}
- Вспомогательные: ${range.auxiliary}
${range.rationale}${modifier}${phaseNote}`;
}

export const repRangeBlock: KnowledgeBlock = {
  id: 'training:rep-ranges',
  keywords: [
    'повторения', 'повторов', 'диапазон', 'rep range', 'sets',
    'сила', 'гипертрофия', 'выносливость', 'процент 1rm',
    'сколько раз', 'подходов',
  ],
  build: (input) => buildRepRangeAdvice(input as RepRangeInput),
};
