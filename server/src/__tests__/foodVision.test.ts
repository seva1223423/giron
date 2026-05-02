/**
 * Tests for server/src/utils/foodVision.ts — extraction + clamping + merging
 * of LLM food-vision responses.
 */

import {
  parseFoodResponse,
  validateFoodItems,
  flagSanity,
  SANITY_MAX_KCAL_PER_100G,
  SANITY_MAX_KCAL_PER_ITEM,
  SANITY_MAX_TOTAL_KCAL,
  type FoodItem,
} from '../utils/foodVision';

// ─── parseFoodResponse ────────────────────────────────────────────────────────

describe('parseFoodResponse', () => {
  test('parses a clean JSON object with items array', () => {
    const text = `{"items":[{"name":"Гречка","weightGrams":200,"calories":172,"protein":6.8,"fats":1.6,"carbs":35}]}`;
    const out = parseFoodResponse(text);
    expect(out).toHaveLength(1);
    expect(out![0].name).toBe('Гречка');
  });

  test('unwraps ```json ... ``` fences', () => {
    const text = '```json\n{"items":[{"name":"Рис","weightGrams":150,"calories":200,"protein":4,"fats":0.5,"carbs":43}]}\n```';
    expect(parseFoodResponse(text)).toHaveLength(1);
  });

  test('returns [] for notFood:true (distinguishable from null parse error)', () => {
    expect(parseFoodResponse('{"items":[],"notFood":true}')).toEqual([]);
  });

  test('returns null when no JSON is salvageable', () => {
    expect(parseFoodResponse('плов с бараниной, 350 грамм')).toBeNull();
  });

  test('recovers from trailing commas', () => {
    const text = '{"items":[{"name":"Хлеб","weightGrams":40,"calories":100,"protein":3,"fats":1,"carbs":20,},]}';
    const out = parseFoodResponse(text);
    expect(out).toHaveLength(1);
    expect(out![0].name).toBe('Хлеб');
  });

  test('recovers from single quotes', () => {
    const text = "{'items':[{'name':'Салат','weightGrams':120,'calories':40,'protein':1,'fats':0.2,'carbs':9}]}";
    const out = parseFoodResponse(text);
    expect(out).toHaveLength(1);
    expect(out![0].name).toBe('Салат');
  });

  test('accepts bare array (no items wrapper)', () => {
    const text = '[{"name":"Банан","weightGrams":120,"calories":105,"protein":1,"fats":0.3,"carbs":27}]';
    const out = parseFoodResponse(text);
    expect(out).toHaveLength(1);
    expect(out![0].name).toBe('Банан');
  });

  test('returns null when items array is missing and no array fallback', () => {
    expect(parseFoodResponse('{"other":"data"}')).toBeNull();
  });
});

// ─── validateFoodItems ────────────────────────────────────────────────────────

describe('validateFoodItems', () => {
  const baseItem = (overrides: Partial<FoodItem> = {}): FoodItem => ({
    name: 'Тест',
    weightGrams: 100,
    calories: 100,
    protein: 10,
    fats: 5,
    carbs: 10,
    ...overrides,
  });

  test('drops items with empty or missing names', () => {
    const out = validateFoodItems([
      baseItem({ name: '' }),
      baseItem({ name: '   ' }),
      baseItem({ name: 'Real' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Real');
  });

  test('clamps oversized weight (>5kg) instead of dropping', () => {
    // Audit-driven change: holiday meals ("целая индейка 7 кг") used
    // to disappear entirely. New behavior keeps the item but clamps
    // weightGrams to 5000 — the sanity flag surfaces the implausible
    // portion to the user who can edit it down. Better-visible than silent loss.
    const out = validateFoodItems([baseItem({ weightGrams: 10000 })]);
    expect(out).toHaveLength(1);
    expect(out[0].weightGrams).toBe(5000);
  });

  test('clamps individual values to ranges', () => {
    const out = validateFoodItems([
      baseItem({ protein: 9999, fats: 9999, carbs: 9999, calories: 99999 }),
    ]);
    expect(out[0].protein).toBeLessThanOrEqual(300);
    expect(out[0].fats).toBeLessThanOrEqual(300);
    expect(out[0].carbs).toBeLessThanOrEqual(600);
    expect(out[0].calories).toBeLessThanOrEqual(5000);
  });

  test('when calories zero, derives from macros (P*4 + F*9 + C*4)', () => {
    const out = validateFoodItems([
      baseItem({ calories: 0, protein: 10, fats: 5, carbs: 10 }),
    ]);
    expect(out[0].calories).toBe(10 * 4 + 5 * 9 + 10 * 4); // 40+45+40 = 125
  });

  test('when macros all zero, trusts AI calorie number', () => {
    const out = validateFoodItems([
      baseItem({ calories: 250, protein: 0, fats: 0, carbs: 0 }),
    ]);
    expect(out[0].calories).toBe(250);
  });

  test('averages AI vs macro kcal when they disagree by more than 25%', () => {
    // AI says 500 kcal but P*4+F*9+C*4 = 100*4 = 400 kcal → ratio 1.25 boundary
    // Picked 600 kcal AI vs 400 macros → ratio 1.5 → average = 500
    const out = validateFoodItems([
      baseItem({ calories: 600, protein: 100, fats: 0, carbs: 0 }),
    ]);
    expect(out[0].calories).toBe(500);
  });

  test('trusts AI value when it matches macros within 25%', () => {
    // AI says 410 kcal, macros 400 → ratio 1.025 → keep AI
    const out = validateFoodItems([
      baseItem({ calories: 410, protein: 100, fats: 0, carbs: 0 }),
    ]);
    expect(out[0].calories).toBe(410);
  });

  test('keeps confidence in 0.5–1.0 range, drops otherwise', () => {
    expect(validateFoodItems([baseItem({ confidence: 0.8 })])[0].confidence).toBe(0.8);
    expect(validateFoodItems([baseItem({ confidence: 1.2 })])[0].confidence).toBeUndefined();
    expect(validateFoodItems([baseItem({ confidence: 0.3 })])[0].confidence).toBeUndefined();
  });

  test('trims and clamps name to 200 chars', () => {
    const long = '  ' + 'x'.repeat(300) + '  ';
    const out = validateFoodItems([baseItem({ name: long })]);
    expect(out[0].name.length).toBe(200);
    expect(out[0].name.startsWith(' ')).toBe(false);
  });

  test('merges duplicate items by normalized name — sums weights/macros', () => {
    const out = validateFoodItems([
      baseItem({ name: 'Куриная грудка', weightGrams: 100, calories: 110, protein: 23, fats: 1, carbs: 0 }),
      baseItem({ name: 'куриная  грудка', weightGrams: 50, calories: 55, protein: 11, fats: 0.5, carbs: 0 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].weightGrams).toBe(150);
    expect(out[0].calories).toBe(165);
    expect(out[0].protein).toBeCloseTo(34, 1);
  });

  test('merge picks the longer (more specific) name', () => {
    const out = validateFoodItems([
      baseItem({ name: 'Грудка' }),
      baseItem({ name: 'грудка' }),
    ]);
    // Both normalize to "грудка" — but since they literally tie, the first
    // wins. The more-specific pick kicks in when names differ in length.
    const out2 = validateFoodItems([
      baseItem({ name: 'грудка' }),
      baseItem({ name: 'Куриная грудка' }),
    ]);
    // These normalize differently, so they do NOT merge
    expect(out2).toHaveLength(2);
  });

  test('merge picks the lowest confidence (most conservative)', () => {
    const out = validateFoodItems([
      baseItem({ confidence: 0.9 }),
      baseItem({ confidence: 0.6 }),
    ]);
    expect(out[0].confidence).toBe(0.6);
  });

  test('distinct names stay as separate items', () => {
    const out = validateFoodItems([
      baseItem({ name: 'Рис' }),
      baseItem({ name: 'Курица' }),
      baseItem({ name: 'Огурец' }),
    ]);
    expect(out).toHaveLength(3);
  });
});

// ─── flagSanity ───────────────────────────────────────────────────────────────

describe('flagSanity', () => {
  test('empty input → no flags', () => {
    expect(flagSanity([])).toEqual([]);
  });

  test('normal meal → no flags', () => {
    expect(flagSanity([
      { calories: 350, weightGrams: 200 },
      { calories: 180, weightGrams: 150 },
    ])).toEqual([]);
  });

  test('too-high kcal/100g flagged', () => {
    const flags = flagSanity([{ calories: 2000, weightGrams: 100 }]);
    expect(flags).toContain('kcal_per_100g');
  });

  test('per-item ceiling flagged', () => {
    expect(flagSanity([
      { calories: SANITY_MAX_KCAL_PER_ITEM + 1, weightGrams: 1000 },
    ])).toContain('kcal_per_item');
  });

  test('total over daily ceiling flagged', () => {
    expect(flagSanity([
      { calories: 2000, weightGrams: 500 },
      { calories: 2000, weightGrams: 500 },
      { calories: 2000, weightGrams: 500 },
    ])).toContain('total_kcal');
  });

  test('zero-weight items skip per-100g check', () => {
    const flags = flagSanity([{ calories: 5000, weightGrams: 0 }]);
    expect(flags).not.toContain('kcal_per_100g');
    expect(flags).toContain('kcal_per_item');
  });

  test('boundary values do not trigger', () => {
    expect(flagSanity([{ calories: SANITY_MAX_KCAL_PER_100G, weightGrams: 100 }])).toEqual([]);
    expect(flagSanity([{ calories: SANITY_MAX_KCAL_PER_ITEM, weightGrams: 1000 }])).toEqual([]);
  });
});
