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
export type GoalKey = 'weight_loss_fast' | 'weight_loss' | 'recomp' | 'muscle_gain' | 'mass';

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
};

/** Protein multiplier (g per kg bodyweight) for each goal. */
export const GOAL_PROTEIN_PER_KG: Record<GoalKey, number> = {
  weight_loss_fast: 1.8,
  weight_loss: 1.8,
  recomp: 2.0,
  muscle_gain: 2.2,
  mass: 2.2,
};

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
