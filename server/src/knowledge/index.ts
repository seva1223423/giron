import { TRAINING_PRINCIPLES } from './trainingPrinciples';
import { NUTRITION_KNOWLEDGE } from './nutrition';
import { EXERCISE_TECHNIQUE } from './exerciseTechnique';
import { RECOVERY_KNOWLEDGE } from './recovery';
import { SPECIAL_POPULATIONS } from './specialPopulations';

/**
 * Complete AI Trainer Knowledge Base
 *
 * Compiled from peer-reviewed research and authoritative sources:
 * - NSCA "Essentials of Strength Training and Conditioning" (4th ed.)
 * - ACSM Guidelines for Exercise Testing and Prescription (11th ed.)
 * - Brad Schoenfeld — hypertrophy research, meta-analyses
 * - Eric Helms — "Muscle & Strength Pyramids" (2nd ed.)
 * - Mike Israetel — "Scientific Principles of Hypertrophy Training"
 * - Greg Nuckols — "Stronger By Science"
 * - Mark Rippetoe — "Starting Strength" (3rd ed.)
 * - Tudor Bompa — "Periodization" (6th ed.)
 * - Alan Aragon — nutrition research
 * - Lyle McDonald — "Flexible Dieting"
 * - ISSN Position Stands on protein, creatine, supplements
 * - Matthew Walker — "Why We Sleep"
 * - Morton et al. 2018 — protein meta-analysis
 * - Schoenfeld, Ogborn & Krieger 2016 — frequency meta-analysis
 * - Schoenfeld 2017 — volume meta-analysis
 * - Helms et al. 2014 — protein on caloric deficit
 * - Lauersen et al. 2014 — injury prevention meta-analysis
 */

export const FULL_KNOWLEDGE_BASE = [
  TRAINING_PRINCIPLES,
  NUTRITION_KNOWLEDGE,
  EXERCISE_TECHNIQUE,
  RECOVERY_KNOWLEDGE,
  SPECIAL_POPULATIONS,
].join('\n\n---\n\n');

export {
  TRAINING_PRINCIPLES,
  NUTRITION_KNOWLEDGE,
  EXERCISE_TECHNIQUE,
  RECOVERY_KNOWLEDGE,
  SPECIAL_POPULATIONS,
};
