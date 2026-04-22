import { calcBMR, calcTDEE, calcMacros, ACTIVITY_MULTIPLIERS, GOAL_CAL_DELTAS, GOAL_PROTEIN_PER_KG } from '../utils/macros';

/**
 * Tests for src/utils/macros.ts — Mifflin-St Jeor BMR/macro calculator.
 *
 * Reference values verified against the Mifflin-St Jeor formula:
 *   Male BMR   = 10w + 6.25h - 5a + 5
 *   Female BMR = 10w + 6.25h - 5a - 161
 */

// ─── calcBMR ─────────────────────────────────────────────────────────────────

describe('calcBMR', () => {
  // 80 kg, 175 cm, 28 y/o male: 10*80 + 6.25*175 - 5*28 + 5 = 800+1093.75-140+5 = 1758.75
  test('male BMR formula', () => {
    expect(calcBMR(80, 175, 28, false)).toBeCloseTo(1758.75, 1);
  });

  // Same but female: -161 instead of +5 → 1758.75 - 166 = 1592.75
  test('female BMR formula', () => {
    expect(calcBMR(80, 175, 28, true)).toBeCloseTo(1592.75, 1);
  });

  test('male and female BMR differ by exactly 166', () => {
    const male = calcBMR(70, 170, 30, false);
    const female = calcBMR(70, 170, 30, true);
    expect(male - female).toBeCloseTo(166, 5);
  });

  test('higher weight → higher BMR', () => {
    expect(calcBMR(90, 175, 28, false)).toBeGreaterThan(calcBMR(70, 175, 28, false));
  });

  test('higher height → higher BMR', () => {
    expect(calcBMR(80, 180, 28, false)).toBeGreaterThan(calcBMR(80, 160, 28, false));
  });

  test('higher age → lower BMR', () => {
    expect(calcBMR(80, 175, 20, false)).toBeGreaterThan(calcBMR(80, 175, 50, false));
  });
});

// ─── calcTDEE ────────────────────────────────────────────────────────────────

describe('calcTDEE', () => {
  test('sedentary multiplier (1.2)', () => {
    const bmr = 1800;
    expect(calcTDEE(bmr, 'sedentary')).toBe(Math.round(bmr * 1.2));
  });

  test('moderate multiplier (1.55)', () => {
    const bmr = 1800;
    expect(calcTDEE(bmr, 'moderate')).toBe(Math.round(bmr * 1.55));
  });

  test('extreme multiplier (1.9)', () => {
    const bmr = 2000;
    expect(calcTDEE(bmr, 'extreme')).toBe(Math.round(bmr * 1.9));
  });

  test('TDEE increases with activity level', () => {
    const bmr = 2000;
    expect(calcTDEE(bmr, 'light')).toBeLessThan(calcTDEE(bmr, 'moderate'));
    expect(calcTDEE(bmr, 'moderate')).toBeLessThan(calcTDEE(bmr, 'high'));
    expect(calcTDEE(bmr, 'high')).toBeLessThan(calcTDEE(bmr, 'extreme'));
  });
});

// ─── calcMacros ──────────────────────────────────────────────────────────────

describe('calcMacros', () => {
  const base = () => calcMacros(80, 175, 28, false, 'moderate', 'muscle_gain');

  test('returns all required fields', () => {
    const r = base();
    expect(r).toHaveProperty('bmr');
    expect(r).toHaveProperty('tdee');
    expect(r).toHaveProperty('targetCal');
    expect(r).toHaveProperty('protein');
    expect(r).toHaveProperty('fats');
    expect(r).toHaveProperty('carbs');
    expect(r).toHaveProperty('proteinPerKg');
  });

  test('BMR is rounded integer', () => {
    const { bmr } = base();
    expect(Number.isInteger(bmr)).toBe(true);
  });

  test('targetCal floor is 1200 (extreme cut scenario)', () => {
    // Very light person, fast weight loss goal → cannot dip below 1200
    const r = calcMacros(40, 150, 20, true, 'sedentary', 'weight_loss_fast');
    expect(r.targetCal).toBeGreaterThanOrEqual(1200);
  });

  test('carbs floor is 50', () => {
    // Very high protein at low calories could push carbs negative without floor
    const r = calcMacros(120, 185, 30, false, 'sedentary', 'weight_loss_fast');
    expect(r.carbs).toBeGreaterThanOrEqual(50);
  });

  test('muscle_gain goal adds 400 kcal above TDEE', () => {
    const w = 80; const h = 175; const a = 28;
    const recomp = calcMacros(w, h, a, false, 'moderate', 'recomp');
    const gain = calcMacros(w, h, a, false, 'moderate', 'muscle_gain');
    expect(gain.targetCal - recomp.targetCal).toBe(400);
  });

  test('weight_loss_fast subtracts 700 kcal below TDEE', () => {
    const w = 80; const h = 175; const a = 28;
    const recomp = calcMacros(w, h, a, false, 'moderate', 'recomp');
    const cut = calcMacros(w, h, a, false, 'moderate', 'weight_loss_fast');
    // targetCal could be clamped, so check the non-clamped scenario
    if (recomp.tdee - 700 >= 1200) {
      expect(cut.targetCal).toBe(recomp.tdee - 700);
    } else {
      expect(cut.targetCal).toBe(1200);
    }
  });

  test('protein per kg is higher for mass/muscle goals', () => {
    const common = [80, 175, 28, false, 'moderate'] as const;
    const mass = calcMacros(...common, 'mass');
    const loss = calcMacros(...common, 'weight_loss');
    expect(mass.proteinPerKg).toBeGreaterThan(loss.proteinPerKg);
  });

  test('fats = ~25% of targetCal / 9', () => {
    const r = base();
    const expected = Math.round((r.targetCal * 0.25) / 9);
    expect(r.fats).toBe(expected);
  });

  test('macro energy sum is close to targetCal (within rounding)', () => {
    const r = base();
    const energyFromMacros = r.protein * 4 + r.fats * 9 + r.carbs * 4;
    // Due to integer rounding, allow a tolerance of ±20 kcal
    expect(Math.abs(energyFromMacros - r.targetCal)).toBeLessThanOrEqual(20);
  });

  test('female gets a lower BMR than equivalent male', () => {
    const male = calcMacros(70, 170, 30, false, 'moderate', 'recomp');
    const female = calcMacros(70, 170, 30, true, 'moderate', 'recomp');
    expect(female.bmr).toBeLessThan(male.bmr);
    expect(female.tdee).toBeLessThan(male.tdee);
  });
});

// ─── constant tables sanity ───────────────────────────────────────────────────

describe('constant tables', () => {
  test('all 5 activity multipliers are present and > 1', () => {
    const keys = ['sedentary', 'light', 'moderate', 'high', 'extreme'] as const;
    for (const k of keys) {
      expect(ACTIVITY_MULTIPLIERS[k]).toBeGreaterThan(1);
    }
  });

  test('activity multipliers are strictly increasing', () => {
    expect(ACTIVITY_MULTIPLIERS.sedentary).toBeLessThan(ACTIVITY_MULTIPLIERS.light);
    expect(ACTIVITY_MULTIPLIERS.light).toBeLessThan(ACTIVITY_MULTIPLIERS.moderate);
    expect(ACTIVITY_MULTIPLIERS.moderate).toBeLessThan(ACTIVITY_MULTIPLIERS.high);
    expect(ACTIVITY_MULTIPLIERS.high).toBeLessThan(ACTIVITY_MULTIPLIERS.extreme);
  });

  test('goal cal deltas cover a symmetric range', () => {
    expect(GOAL_CAL_DELTAS.recomp).toBe(0);
    expect(Math.abs(GOAL_CAL_DELTAS.weight_loss_fast)).toBeGreaterThan(Math.abs(GOAL_CAL_DELTAS.weight_loss));
    expect(GOAL_CAL_DELTAS.mass).toBeGreaterThan(GOAL_CAL_DELTAS.muscle_gain);
  });

  test('protein per kg is highest for mass goals', () => {
    expect(GOAL_PROTEIN_PER_KG.mass).toBe(GOAL_PROTEIN_PER_KG.muscle_gain);
    expect(GOAL_PROTEIN_PER_KG.mass).toBeGreaterThan(GOAL_PROTEIN_PER_KG.recomp);
    expect(GOAL_PROTEIN_PER_KG.recomp).toBeGreaterThan(GOAL_PROTEIN_PER_KG.weight_loss);
  });
});
