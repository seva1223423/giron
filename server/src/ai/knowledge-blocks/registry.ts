/**
 * Knowledge-blocks registry — the destination for the migration from
 * inline `getXxx(message)` helpers in routes/ai.ts.
 *
 * The selector (`getRelevantKnowledge` in ai.ts) iterates this array,
 * runs the TF-IDF score against each block's `keywords`, and picks the
 * top N for the system prompt. Order in this array doesn't matter.
 *
 * See ./README.md for the migration recipe.
 */

import type { KnowledgeBlock } from './types';

import { seasonalAdviceBlock } from './seasonal';
import { confidenceDirectiveBlock } from './confidence';
import { macroSplitBlock } from './macros';
import { smartRestBlock } from './recovery';
import { repRangeBlock } from './hypertrophy';
import { nutritionTimingBlock } from './nutritionTiming';
import { trainingAgeBlock } from './trainingAge';
import { exerciseTempoBlock } from './tempo';

export const knowledgeBlocksRegistry: KnowledgeBlock[] = [
  // Batch 1 (PoC, 2026-05-22)
  seasonalAdviceBlock,
  confidenceDirectiveBlock,
  macroSplitBlock,
  // Batch 2 (2026-05-22, audit follow-up)
  smartRestBlock,         // ai.ts L14516 — getSmartRestSuggestion
  repRangeBlock,          // ai.ts L16283 — getRepRangeAdvice
  nutritionTimingBlock,   // ai.ts L13347 — getNutritionTimingAdvice
  trainingAgeBlock,       // ai.ts L18800 — getTrainingAgeAdvice
  exerciseTempoBlock,     // ai.ts L19715 — getExerciseTempo
  // TODO: migrate the remaining ~1414 inline helpers from ai.ts.
  // Next batches by topic (suggested order):
  //   - technique.ts    (getTechniqueCues, getMuscleActivationCues)
  //   - injuries.ts     (getSubstitutionAdvice + EXERCISE_SUBSTITUTIONS table)
  //   - periodization.ts (getPeriodizationAdvice, getPlateauBreakers)
  //   - exercise.ts     (getExerciseAlternatives, getSmartSubstitutions)
];

/** Helper for tests and the future selector wiring — finds a block by
 *  its stable id without scanning the array twice. */
export function findKnowledgeBlock(id: string): KnowledgeBlock | undefined {
  return knowledgeBlocksRegistry.find((b) => b.id === id);
}
