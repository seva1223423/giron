/**
 * Mifflin-St Jeor BMR → TDEE → macro target calculator.
 *
 * Extracted from MacroCalculatorScreen so the formulas are independently
 * testable and can be reused elsewhere (e.g. onboarding auto-target).
 *
 * All inputs are already validated before calling (parseFloat, fallback
 * to defaults, Math.max guards) — the functions below assume valid numbers.
 */

export type ActivityKey = 'sedentary' | 'light' | 'moderate' | 'high' | 'extreme';
export type GoalKey =
  | 'weight_loss_fast'
  | 'weight_loss'
  | 'recomp'
  | 'muscle_gain'
  | 'mass'
  // Training-oriented goals, previously computed by the nutrition GoalsModal
  // with its own copy of the formulas (audit R37).
  | 'strength'
  | 'endurance';

export const ACTIVITY_MULTIPLIERS: Record<ActivityKey, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  extreme: 1.9,
};

export const GOAL_CAL_DELTAS: Record<GoalKey, number> = {
  weight_loss_fast: -700,
  weight_loss: -400,
  recomp: 0,
  muscle_gain: 400,
  mass: 700,
  strength: 200,
  endurance: 100,
};

/** Protein multiplier (g per kg bodyweight) for each goal. */
export const GOAL_PROTEIN_PER_KG: Record<GoalKey, number> = {
  weight_loss_fast: 1.8,
  weight_loss: 1.8,
  recomp: 2.0,
  muscle_gain: 2.2,
  mass: 2.2,
  strength: 2.0,
  endurance: 1.6,
};

/**
 * Activity level assumed by screens that have no activity picker (onboarding,
 * the nutrition goals modal). Both used to hardcode the raw 1.55 multiplier
 * alongside their own copy of the BMR formula.
 */
export const DEFAULT_ACTIVITY: ActivityKey = 'moderate';

/**
 * The profile's TrainingGoal (types/index.ts) mapped onto a nutrition goal.
 * Keeps onboarding, the goals modal and the macro calculator on one set of
 * numbers — previously the same person got different calorie and protein
 * targets depending on which screen computed them (audit R37).
 */
export const TRAINING_GOAL_TO_MACRO_GOAL = {
  weight_loss: 'weight_loss',
  muscle_gain: 'muscle_gain',
  strength: 'strength',
  endurance: 'endurance',
  flexibility: 'recomp',
  general_fitness: 'recomp',
  maintenance: 'recomp',
} as const satisfies Record<string, GoalKey>;

/** Mifflin-St Jeor BMR (kcal/day). */
export function calcBMR(weightKg: number, heightCm: number, ageYears: number, isFemale: boolean): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return isFemale ? base - 161 : base + 5;
}

/** Total Daily Energy Expenditure = BMR × activity multiplier. */
export function calcTDEE(bmr: number, activity: ActivityKey): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activity]);
}

export interface MacroResult {
  bmr: number;
  tdee: number;
  targetCal: number;
  protein: number;
  fats: number;
  carbs: number;
  proteinPerKg: number;
}

/** Full macro calculation given validated user inputs. */
export function calcMacros(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  female: boolean,
  activity: ActivityKey,
  goal: GoalKey,
): MacroResult {
  const bmr = calcBMR(weightKg, heightCm, ageYears, female);
  const tdee = calcTDEE(bmr, activity);
  const targetCal = Math.max(1200, tdee + GOAL_CAL_DELTAS[goal]);
  const proteinPerKg = GOAL_PROTEIN_PER_KG[goal];
  const protein = Math.round(weightKg * proteinPerKg);
  const fats = Math.round((targetCal * 0.25) / 9);
  const carbs = Math.max(50, Math.round((targetCal - protein * 4 - fats * 9) / 4));
  return { bmr: Math.round(bmr), tdee, targetCal, protein, fats, carbs, proteinPerKg };
}
