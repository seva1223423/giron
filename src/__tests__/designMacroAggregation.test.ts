/**
 * Nutrition daily totals — summing macros across meals, computing
 * percentage progress toward daily targets, and safety against bad
 * data (negative macros, NaN, infinity).
 */

interface MealItem {
  calories: number;
  protein: number;
  fats: number;
  carbs: number;
}

interface DailyTotals {
  calories: number;
  protein: number;
  fats: number;
  carbs: number;
}

function sumMeals(items: MealItem[]): DailyTotals {
  const total = { calories: 0, protein: 0, fats: 0, carbs: 0 };
  for (const it of items ?? []) {
    if (!it) continue;
    if (typeof it.calories === 'number' && isFinite(it.calories) && it.calories > 0) total.calories += it.calories;
    if (typeof it.protein === 'number' && isFinite(it.protein) && it.protein > 0) total.protein += it.protein;
    if (typeof it.fats === 'number' && isFinite(it.fats) && it.fats > 0) total.fats += it.fats;
    if (typeof it.carbs === 'number' && isFinite(it.carbs) && it.carbs > 0) total.carbs += it.carbs;
  }
  return total;
}

function progressPct(current: number, target: number): number {
  if (!isFinite(target) || target <= 0) return 0;
  if (!isFinite(current) || current < 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

function remainingKcal(targetKcal: number, consumedKcal: number): number {
  if (!isFinite(targetKcal) || targetKcal <= 0) return 0;
  if (!isFinite(consumedKcal) || consumedKcal < 0) return targetKcal;
  return Math.max(0, targetKcal - consumedKcal);
}

// ─── sumMeals ─────────────────────────────────────────────────────────────

describe('sumMeals', () => {
  test('empty array → zero totals', () => {
    expect(sumMeals([])).toEqual({ calories: 0, protein: 0, fats: 0, carbs: 0 });
  });

  test('single item sums', () => {
    expect(sumMeals([{ calories: 200, protein: 20, fats: 5, carbs: 30 }])).toEqual({
      calories: 200, protein: 20, fats: 5, carbs: 30,
    });
  });

  test('multiple items aggregate', () => {
    expect(
      sumMeals([
        { calories: 200, protein: 20, fats: 5, carbs: 30 },
        { calories: 150, protein: 10, fats: 3, carbs: 20 },
      ])
    ).toEqual({ calories: 350, protein: 30, fats: 8, carbs: 50 });
  });

  test('negative values ignored', () => {
    expect(sumMeals([
      { calories: -100, protein: -10, fats: -5, carbs: -20 },
      { calories: 200, protein: 20, fats: 5, carbs: 30 },
    ])).toEqual({ calories: 200, protein: 20, fats: 5, carbs: 30 });
  });

  test('NaN values ignored', () => {
    expect(sumMeals([
      { calories: NaN, protein: 20, fats: 5, carbs: 30 },
    ])).toEqual({ calories: 0, protein: 20, fats: 5, carbs: 30 });
  });

  test('Infinity values ignored', () => {
    expect(sumMeals([
      { calories: Infinity, protein: 20, fats: 5, carbs: 30 },
    ])).toEqual({ calories: 0, protein: 20, fats: 5, carbs: 30 });
  });

  test('null items skipped', () => {
    expect(sumMeals([null as any, { calories: 100, protein: 10, fats: 2, carbs: 15 }])).toEqual({
      calories: 100, protein: 10, fats: 2, carbs: 15,
    });
  });

  test('1000-item aggregation accurate (float safety)', () => {
    const items: MealItem[] = Array.from({ length: 1000 }, () => ({
      calories: 10, protein: 1, fats: 0.1, carbs: 2,
    }));
    const total = sumMeals(items);
    expect(total.calories).toBe(10000);
    expect(total.protein).toBe(1000);
    expect(total.fats).toBeCloseTo(100);
    expect(total.carbs).toBe(2000);
  });
});

// ─── progressPct ──────────────────────────────────────────────────────────

describe('progressPct', () => {
  test('0/2000 → 0%', () => {
    expect(progressPct(0, 2000)).toBe(0);
  });

  test('500/2000 → 25%', () => {
    expect(progressPct(500, 2000)).toBe(25);
  });

  test('1000/2000 → 50%', () => {
    expect(progressPct(1000, 2000)).toBe(50);
  });

  test('2000/2000 → 100%', () => {
    expect(progressPct(2000, 2000)).toBe(100);
  });

  test('over-consumption clamped at 100%', () => {
    expect(progressPct(3000, 2000)).toBe(100);
  });

  test('negative current → 0%', () => {
    expect(progressPct(-500, 2000)).toBe(0);
  });

  test('zero target → 0%', () => {
    expect(progressPct(500, 0)).toBe(0);
  });

  test('negative target → 0%', () => {
    expect(progressPct(500, -100)).toBe(0);
  });

  test('NaN current → 0%', () => {
    expect(progressPct(NaN, 2000)).toBe(0);
  });

  test('Infinity target → 0%', () => {
    expect(progressPct(1000, Infinity)).toBe(0);
  });

  test('rounding to integer percent', () => {
    expect(progressPct(333, 1000)).toBe(33);
    expect(progressPct(667, 1000)).toBe(67);
  });
});

// ─── remainingKcal ───────────────────────────────────────────────────────

describe('remainingKcal', () => {
  test('target 2000 - consumed 500 → 1500', () => {
    expect(remainingKcal(2000, 500)).toBe(1500);
  });

  test('target equal consumed → 0', () => {
    expect(remainingKcal(2000, 2000)).toBe(0);
  });

  test('over-consumed → 0 (not negative)', () => {
    expect(remainingKcal(2000, 2500)).toBe(0);
  });

  test('zero target → 0', () => {
    expect(remainingKcal(0, 100)).toBe(0);
  });

  test('NaN target → 0', () => {
    expect(remainingKcal(NaN, 100)).toBe(0);
  });

  test('NaN consumed → full target', () => {
    expect(remainingKcal(2000, NaN)).toBe(2000);
  });

  test('negative consumed treated as 0', () => {
    expect(remainingKcal(2000, -500)).toBe(2000);
  });
});

// ─── Pipeline: meals → totals → progress ──────────────────────────────────

describe('Full nutrition pipeline', () => {
  test('three meals leading to partial daily progress', () => {
    const meals: MealItem[] = [
      { calories: 400, protein: 25, fats: 15, carbs: 40 },
      { calories: 600, protein: 35, fats: 20, carbs: 50 },
      { calories: 500, protein: 30, fats: 18, carbs: 45 },
    ];
    const totals = sumMeals(meals);
    expect(totals.calories).toBe(1500);

    const calPct = progressPct(totals.calories, 2000);
    expect(calPct).toBe(75);

    const rem = remainingKcal(2000, totals.calories);
    expect(rem).toBe(500);
  });

  test('exceeded target clamps cleanly', () => {
    const meals: MealItem[] = [
      { calories: 2500, protein: 100, fats: 50, carbs: 150 },
      { calories: 1000, protein: 40, fats: 30, carbs: 80 },
    ];
    const totals = sumMeals(meals);
    const pct = progressPct(totals.calories, 2000);
    expect(pct).toBe(100);
    expect(remainingKcal(2000, totals.calories)).toBe(0);
  });
});

// ─── Macro targets ──────────────────────────────────────────────────────

describe('Realistic macro target ranges', () => {
  const TARGETS = {
    calories: 2500,
    protein: 160,
    fats: 80,
    carbs: 300,
  };

  test('4-4-9 rule check (approximate, within 100kcal)', () => {
    const kcalFromMacros = TARGETS.protein * 4 + TARGETS.carbs * 4 + TARGETS.fats * 9;
    // Protein+fat+carbs don't always perfectly sum to kcal target since
    // actual targets are rounded — allow ±100kcal tolerance.
    expect(Math.abs(kcalFromMacros - TARGETS.calories)).toBeLessThanOrEqual(100);
  });

  test('protein target integer kcal multiplier', () => {
    expect(TARGETS.protein * 4).toBe(640);
  });

  test('fats contribute 9 kcal/g', () => {
    expect(TARGETS.fats * 9).toBe(720);
  });

  test('carbs contribute 4 kcal/g', () => {
    expect(TARGETS.carbs * 4).toBe(1200);
  });
});

// ─── Water + hydration placeholder (future feature) ──────────────────────

describe('Hydration target tracking (placeholder pattern)', () => {
  function hydrationPct(mlConsumed: number, mlTarget: number): number {
    if (!isFinite(mlTarget) || mlTarget <= 0) return 0;
    if (!isFinite(mlConsumed) || mlConsumed < 0) return 0;
    return Math.min(100, Math.round((mlConsumed / mlTarget) * 100));
  }

  test('2L target 500ml → 25%', () => {
    expect(hydrationPct(500, 2000)).toBe(25);
  });

  test('over-hydrated clamps at 100%', () => {
    expect(hydrationPct(3000, 2000)).toBe(100);
  });
});
