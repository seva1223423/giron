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

export const knowledgeBlocksRegistry: KnowledgeBlock[] = [
  seasonalAdviceBlock,
  confidenceDirectiveBlock,
  macroSplitBlock,
  // TODO: migrate the remaining ~1419 inline helpers from ai.ts.
  // Next batches by topic (suggested order):
  //   - sleep.ts        (getSmartRestSuggestion, sleep-related blocks)
  //   - hypertrophy.ts  (getRepRangeAdvice, getPeriodizationAdvice)
  //   - technique.ts    (getTechniqueCues, getMuscleActivationCues)
  //   - injuries.ts     (getSubstitutionAdvice + EXERCISE_SUBSTITUTIONS table)
];

/** Helper for tests and the future selector wiring — finds a block by
 *  its stable id without scanning the array twice. */
export function findKnowledgeBlock(id: string): KnowledgeBlock | undefined {
  return knowledgeBlocksRegistry.find((b) => b.id === id);
}
