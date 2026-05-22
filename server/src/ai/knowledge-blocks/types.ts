/**
 * Common types for the knowledge-blocks registry.
 *
 * See ./README.md for the migration plan from inline ai.ts helpers
 * into this folder.
 */

export interface KnowledgeBlockInput {
  /** The current user message (sanitised, lowercased). */
  message: string;
  /** Optional extras some blocks need (set by contextEngine, not the route). */
  userGoal?: string | null;
  fitnessLevel?: string | null;
  injuryZones?: string[];
  trainingExperienceYears?: number | null;
  /** Profile flags used by safety/confidence-directive block. */
  hasWeightKg?: boolean;
  hasHeightCm?: boolean;
  hasGoal?: boolean;
  hasGender?: boolean;
  /** Body-weight + frequency used by nutrition/macro-split block. */
  bodyWeightKg?: number | null;
  trainingDaysPerWeek?: number;
}

export interface KnowledgeBlock {
  /** Stable identifier — `<topic>:<sub-topic>` is conventional but the
   *  registry only requires uniqueness. Used as the cache key and the
   *  selector's de-dup key. */
  id: string;

  /** Synonyms / trigger words for the TF-IDF selector. Matches against
   *  the user message; higher overlap = higher relevance score. */
  keywords: string[];

  /** Build the prose snippet that gets pasted into the system prompt.
   *  Pure function — no DB access, no closures over request state.
   *  Returns '' when the block has nothing relevant to add. */
  build: (input: KnowledgeBlockInput) => string;
}
