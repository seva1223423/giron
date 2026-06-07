/**
 * Block 135: Exercise Tempo Recommendations
 *
 * Originally inline at ai.ts L19715 (`getExerciseTempo`). Pure
 * lookup over a static tempo database. Takes an exercise name and
 * the user's goal, returns a "3-1-1-0"-style tempo string.
 */

import type { KnowledgeBlock, KnowledgeBlockInput } from './types';

interface TempoInput extends KnowledgeBlockInput {
  exerciseName?: string;
}

const TEMPO_DB: Record<string, Record<string, string>> = {
  'жим лёжа': { STRENGTH: '3-1-1-0', MUSCLE_GAIN: '3-0-1-1', ENDURANCE: '2-0-1-0' },
  'присед': { STRENGTH: '3-1-1-0', MUSCLE_GAIN: '4-0-1-1', ENDURANCE: '2-0-1-0' },
  'становая тяга': { STRENGTH: '2-0-1-1', MUSCLE_GAIN: '3-0-1-0', ENDURANCE: '2-0-1-0' },
  'жим стоя': { STRENGTH: '3-1-1-0', MUSCLE_GAIN: '3-0-1-1', ENDURANCE: '2-0-1-0' },
  'тяга штанги': { STRENGTH: '2-1-1-1', MUSCLE_GAIN: '3-1-1-1', ENDURANCE: '2-0-1-0' },
  'подтягивания': { STRENGTH: '3-1-1-0', MUSCLE_GAIN: '4-1-1-0', ENDURANCE: '2-0-1-0' },
};

function buildExerciseTempo(input: TempoInput): string {
  const { exerciseName, userGoal } = input;
  if (!exerciseName) return '';

  const nameL = exerciseName.toLowerCase();
  for (const [key, tempos] of Object.entries(TEMPO_DB)) {
    if (nameL.includes(key)) {
      const tempo = tempos[userGoal || 'MUSCLE_GAIN'] || tempos['MUSCLE_GAIN'];
      return `\n\n## 🎬 ТЕМП ВЫПОЛНЕНИЯ
${exerciseName}: ${tempo} (эксцентрик-пауза-концентрик-пауза)`;
    }
  }
  return '';
}

export const exerciseTempoBlock: KnowledgeBlock = {
  id: 'training:exercise-tempo',
  keywords: [
    'темп', 'tempo', 'эксцентрик', 'концентрик', 'пауза',
    'скорость', 'медленно', 'быстро',
  ],
  build: (input) => buildExerciseTempo(input as TempoInput),
};
