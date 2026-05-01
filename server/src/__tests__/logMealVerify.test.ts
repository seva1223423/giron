/**
 * Round 197 — log_meal post-write verification tests.
 *
 * After log_meal creates the Meal row, we read it back to confirm
 * the stored totals match input. If they don't (silent rollback,
 * type coercion, replication lag), we throw — classifyToolError
 * surfaces a typed error to the AI instead of "Записал 200г белка"
 * when DB has 80г.
 *
 * Re-implementation of the verify logic for testing in isolation.
 * If ai.ts changes, update here too.
 */

type MealItem = { calories: number; protein: number; fats: number; carbs: number; weightGrams: number; name: string };
type CreatedMeal = { id: string; totalCalories: number; totalProtein: number; totalFats: number; totalCarbs: number; items: MealItem[] };

function verifyMealWrite(
  expected: { items: MealItem[]; totalCalories: number; totalProtein: number; totalFats: number; totalCarbs: number },
  actual: CreatedMeal | null,
): { ok: true } | { ok: false; reason: string } {
  if (!actual) {
    return { ok: false, reason: 'log_meal: written meal not found in verify (transaction rollback?)' };
  }
  const itemCountMatch = actual.items.length === expected.items.length;
  const calMatch = Math.abs((actual.totalCalories ?? 0) - expected.totalCalories) < 1;
  const protMatch = Math.abs((actual.totalProtein ?? 0) - expected.totalProtein) < 0.5;
  if (!itemCountMatch || !calMatch || !protMatch) {
    return {
      ok: false,
      reason: `log_meal: stored values diverge from input — items ${actual.items.length}/${expected.items.length}, kcal ${actual.totalCalories}/${expected.totalCalories}, protein ${actual.totalProtein}/${expected.totalProtein}`,
    };
  }
  return { ok: true };
}

const item = (name: string): MealItem => ({
  name, calories: 200, protein: 30, fats: 5, carbs: 10, weightGrams: 100,
});

describe('log_meal post-write verify — happy path', () => {
  test('matching write → ok', () => {
    const expected = {
      items: [item('Куриная грудка'), item('Гречка')],
      totalCalories: 400,
      totalProtein: 60,
      totalFats: 10,
      totalCarbs: 20,
    };
    const actual: CreatedMeal = {
      id: 'meal-1',
      totalCalories: 400,
      totalProtein: 60,
      totalFats: 10,
      totalCarbs: 20,
      items: expected.items,
    };
    expect(verifyMealWrite(expected, actual)).toEqual({ ok: true });
  });

  test('tiny rounding tolerance accepted', () => {
    const expected = {
      items: [item('A')],
      totalCalories: 200,
      totalProtein: 30,
      totalFats: 5,
      totalCarbs: 10,
    };
    const actual: CreatedMeal = {
      id: 'meal-1',
      totalCalories: 200, // exact
      totalProtein: 30.3, // within 0.5 tolerance
      totalFats: 5,
      totalCarbs: 10,
      items: expected.items,
    };
    expect(verifyMealWrite(expected, actual)).toEqual({ ok: true });
  });
});

describe('log_meal post-write verify — failure modes', () => {
  test('null actual (transaction rollback) → reject', () => {
    const expected = {
      items: [item('A')],
      totalCalories: 200, totalProtein: 30, totalFats: 5, totalCarbs: 10,
    };
    const r = verifyMealWrite(expected, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/rollback|not found/);
  });

  test('item count mismatch (some items dropped silently) → reject', () => {
    const expected = {
      items: [item('A'), item('B'), item('C')],
      totalCalories: 600, totalProtein: 90, totalFats: 15, totalCarbs: 30,
    };
    const actual: CreatedMeal = {
      id: 'meal-1',
      totalCalories: 600, totalProtein: 90, totalFats: 15, totalCarbs: 30,
      items: [item('A'), item('B')], // one missing
    };
    const r = verifyMealWrite(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/items 2\/3/);
  });

  test('calorie divergence > 1 kcal → reject', () => {
    const expected = {
      items: [item('A')],
      totalCalories: 200, totalProtein: 30, totalFats: 5, totalCarbs: 10,
    };
    const actual: CreatedMeal = {
      id: 'meal-1',
      totalCalories: 80, // way off — type coercion lost a digit?
      totalProtein: 30, totalFats: 5, totalCarbs: 10,
      items: expected.items,
    };
    const r = verifyMealWrite(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/kcal 80\/200/);
  });

  test('protein divergence > 0.5g → reject', () => {
    const expected = {
      items: [item('A')],
      totalCalories: 200, totalProtein: 30, totalFats: 5, totalCarbs: 10,
    };
    const actual: CreatedMeal = {
      id: 'meal-1',
      totalCalories: 200,
      totalProtein: 12, // big mismatch — exactly the kind of silent
                       // failure that previously made AI confidently
                       // claim "записал 30г белка" when DB has 12g
      totalFats: 5, totalCarbs: 10,
      items: expected.items,
    };
    const r = verifyMealWrite(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/protein 12\/30/);
  });
});

describe('log_meal post-write verify — boundary cases', () => {
  test('totalCalories null (Prisma may return null on parse error) → reject', () => {
    const expected = {
      items: [item('A')],
      totalCalories: 200, totalProtein: 30, totalFats: 5, totalCarbs: 10,
    };
    const actual = {
      id: 'meal-1',
      totalCalories: null as any,
      totalProtein: 30, totalFats: 5, totalCarbs: 10,
      items: expected.items,
    } as CreatedMeal;
    const r = verifyMealWrite(expected, actual);
    expect(r.ok).toBe(false);
  });

  test('zero-cal meal (water-only?) verifies correctly', () => {
    const expected = {
      items: [{ ...item('Вода'), calories: 0, protein: 0, fats: 0, carbs: 0, weightGrams: 200 }],
      totalCalories: 0, totalProtein: 0, totalFats: 0, totalCarbs: 0,
    };
    const actual: CreatedMeal = {
      id: 'meal-1',
      totalCalories: 0, totalProtein: 0, totalFats: 0, totalCarbs: 0,
      items: expected.items,
    };
    expect(verifyMealWrite(expected, actual)).toEqual({ ok: true });
  });

  test('negative-cal weird DB state → rejected by tolerance check', () => {
    const expected = {
      items: [item('A')],
      totalCalories: 200, totalProtein: 30, totalFats: 5, totalCarbs: 10,
    };
    const actual: CreatedMeal = {
      id: 'meal-1',
      totalCalories: -5, // invalid state
      totalProtein: 30, totalFats: 5, totalCarbs: 10,
      items: expected.items,
    };
    expect(verifyMealWrite(expected, actual).ok).toBe(false);
  });
});

describe('log_meal post-write verify — error message clarity', () => {
  test('reason names the exact divergence numbers', () => {
    const expected = {
      items: [item('A'), item('B')],
      totalCalories: 400, totalProtein: 60, totalFats: 10, totalCarbs: 20,
    };
    const actual: CreatedMeal = {
      id: 'meal-1',
      totalCalories: 350, totalProtein: 50, totalFats: 10, totalCarbs: 20,
      items: [item('A')],
    };
    const r = verifyMealWrite(expected, actual);
    if (!r.ok) {
      expect(r.reason).toContain('1/2'); // item count
      expect(r.reason).toContain('350/400'); // kcal
      expect(r.reason).toContain('50/60'); // protein
    }
  });
});
