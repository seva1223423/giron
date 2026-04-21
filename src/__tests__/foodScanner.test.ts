/**
 * Tests for src/utils/foodScanner.ts — the pure helpers that back the food
 * scanner screen (fingerprint, sanity flagging, OFF field parsing, meal-type
 * default, confidence bucketing).
 */

import {
  fingerprintBase64,
  flagSanity,
  confidenceBucket,
  extractKcal,
  parseServingGrams,
  defaultMealType,
  findSavedFoodMatch,
  normalizeFoodName,
  buildBarcodeDisplayName,
  SANITY_MAX_KCAL_PER_100G,
  SANITY_MAX_KCAL_PER_ITEM,
  SANITY_MAX_TOTAL_KCAL,
} from '../utils/foodScanner';

// ─── fingerprintBase64 ────────────────────────────────────────────────────────

describe('fingerprintBase64', () => {
  test('short input is returned as-is (with length prefix)', () => {
    expect(fingerprintBase64('abc')).toBe('3:abc');
    expect(fingerprintBase64('')).toBe('0:');
  });

  test('long input uses length + first/last 64 chars', () => {
    const long = 'a'.repeat(500);
    const fp = fingerprintBase64(long);
    expect(fp.startsWith('500:')).toBe(true);
    const parts = fp.split(':');
    expect(parts[1].length).toBe(64);
    expect(parts[2].length).toBe(64);
  });

  test('identical inputs produce identical fingerprints', () => {
    const b64 = 'x'.repeat(300) + 'y'.repeat(300);
    expect(fingerprintBase64(b64)).toBe(fingerprintBase64(b64));
  });

  test('fingerprints differ when prefix, suffix, or length differs', () => {
    const base = 'a'.repeat(256);
    const diffPrefix = 'b' + base.slice(1);
    const diffSuffix = base.slice(0, -1) + 'b';
    const diffLen = base + 'a';
    expect(fingerprintBase64(base)).not.toBe(fingerprintBase64(diffPrefix));
    expect(fingerprintBase64(base)).not.toBe(fingerprintBase64(diffSuffix));
    expect(fingerprintBase64(base)).not.toBe(fingerprintBase64(diffLen));
  });
});

// ─── flagSanity ───────────────────────────────────────────────────────────────

describe('flagSanity', () => {
  test('empty input produces no flags', () => {
    expect(flagSanity([])).toEqual([]);
  });

  test('normal meal produces no flags', () => {
    const items = [
      { calories: 350, weightGrams: 200 }, // grilled chicken
      { calories: 250, weightGrams: 150 }, // rice
      { calories: 80, weightGrams: 100 },  // cucumber
    ];
    expect(flagSanity(items)).toEqual([]);
  });

  test('flags item with too-high kcal/100g (e.g. AI mis-reading oil volume)', () => {
    const items = [{ calories: 2000, weightGrams: 100 }]; // 2000 kcal per 100g
    const flags = flagSanity(items);
    expect(flags).toContain('kcal_per_100g');
  });

  test('flags item over absolute per-item kcal limit', () => {
    const items = [{ calories: SANITY_MAX_KCAL_PER_ITEM + 100, weightGrams: 1000 }];
    expect(flagSanity(items)).toContain('kcal_per_item');
  });

  test('flags total over daily-calories threshold', () => {
    const items = [
      { calories: 2000, weightGrams: 500 },
      { calories: 2000, weightGrams: 500 },
      { calories: 2000, weightGrams: 500 },
    ];
    expect(flagSanity(items)).toContain('total_kcal');
  });

  test('skips kcal_per_100g check for items with zero weight (avoid divide-by-zero)', () => {
    const items = [{ calories: 5000, weightGrams: 0 }];
    const flags = flagSanity(items);
    expect(flags).not.toContain('kcal_per_100g');
    // But kcal_per_item still fires
    expect(flags).toContain('kcal_per_item');
  });

  test('can surface multiple flags simultaneously', () => {
    const items = [
      { calories: 3000, weightGrams: 100 }, // per-100g + per-item
      { calories: 3000, weightGrams: 100 }, // total
    ];
    const flags = flagSanity(items);
    expect(flags).toContain('kcal_per_100g');
    expect(flags).toContain('kcal_per_item');
    expect(flags).toContain('total_kcal');
  });

  test('threshold boundaries do not trip at exactly the limit', () => {
    expect(flagSanity([{ calories: SANITY_MAX_KCAL_PER_100G * 1, weightGrams: 100 }])).toEqual([]);
    expect(flagSanity([{ calories: SANITY_MAX_KCAL_PER_ITEM, weightGrams: 1000 }])).toEqual([]);
  });
});

// ─── confidenceBucket ─────────────────────────────────────────────────────────

describe('confidenceBucket', () => {
  test('null / undefined → low', () => {
    expect(confidenceBucket(undefined)).toBe('low');
    expect(confidenceBucket(null)).toBe('low');
  });

  test('≥ 0.8 → high', () => {
    expect(confidenceBucket(0.8)).toBe('high');
    expect(confidenceBucket(0.95)).toBe('high');
    expect(confidenceBucket(1)).toBe('high');
  });

  test('0.5–0.8 → medium', () => {
    expect(confidenceBucket(0.5)).toBe('medium');
    expect(confidenceBucket(0.65)).toBe('medium');
    expect(confidenceBucket(0.79)).toBe('medium');
  });

  test('< 0.5 → low', () => {
    expect(confidenceBucket(0.49)).toBe('low');
    expect(confidenceBucket(0)).toBe('low');
  });
});

// ─── extractKcal (OpenFoodFacts) ──────────────────────────────────────────────

describe('extractKcal', () => {
  test('prefers energy-kcal_100g when present', () => {
    expect(extractKcal({ 'energy-kcal_100g': 250, 'energy-kj_100g': 9999 })).toBe(250);
  });

  test('falls back to energy-kcal when _100g missing', () => {
    expect(extractKcal({ 'energy-kcal': 180 })).toBe(180);
  });

  test('converts kJ → kcal using 4.184 divisor', () => {
    // 1000 kJ ≈ 239 kcal
    expect(extractKcal({ 'energy-kj_100g': 1000 })).toBe(239);
  });

  test('uses energy_100g as last-resort (assumed kJ when > 100)', () => {
    expect(extractKcal({ 'energy_100g': 418 })).toBe(100); // 418 kJ → 100 kcal
  });

  test('returns 0 for empty / no-energy nutriments', () => {
    expect(extractKcal({})).toBe(0);
    expect(extractKcal({ proteins_100g: 5 })).toBe(0);
  });

  test('ignores zero / negative energy values', () => {
    expect(extractKcal({ 'energy-kcal_100g': 0, 'energy-kj_100g': 500 })).toBe(120);
  });
});

// ─── parseServingGrams ────────────────────────────────────────────────────────

describe('parseServingGrams', () => {
  test('parses "100g"', () => {
    expect(parseServingGrams('100g')).toBe(100);
  });

  test('parses "30 g"', () => {
    expect(parseServingGrams('30 g')).toBe(30);
  });

  test('parses "1 portion (45g)"', () => {
    expect(parseServingGrams('1 portion (45g)')).toBe(45);
  });

  test('parses ml as grams (for liquids)', () => {
    expect(parseServingGrams('250ml')).toBe(250);
  });

  test('accepts comma decimals', () => {
    expect(parseServingGrams('12,5 g')).toBe(13);
  });

  test('rejects out-of-range values (>2000g, <5g)', () => {
    expect(parseServingGrams('99999g')).toBeNull();
    expect(parseServingGrams('1g')).toBeNull();
  });

  test('rejects ml outside 5–500', () => {
    expect(parseServingGrams('2000ml')).toBeNull();
    expect(parseServingGrams('2ml')).toBeNull();
  });

  test('returns null for empty / unparsable strings', () => {
    expect(parseServingGrams('')).toBeNull();
    expect(parseServingGrams('one serving')).toBeNull();
  });

  test('does not match "gmbh" or similar word-boundaries', () => {
    // The "g" in "gmbh" should not be interpreted as grams
    expect(parseServingGrams('100 gmbh')).toBeNull();
  });
});

// ─── normalizeFoodName ────────────────────────────────────────────────────────

describe('normalizeFoodName', () => {
  test('lowercases + trims + collapses whitespace', () => {
    expect(normalizeFoodName('  Куриная   ГРУДКА  ')).toBe('куриная грудка');
  });

  test('strips trailing weight markers', () => {
    expect(normalizeFoodName('Куриная грудка (100г)')).toBe('куриная грудка');
    expect(normalizeFoodName('Salmon (200g)')).toBe('salmon');
    expect(normalizeFoodName('Milk (250ml)')).toBe('milk');
  });

  test('leaves mid-string parentheses alone', () => {
    expect(normalizeFoodName('Хлеб (ржаной) с маслом'))
      .toBe('хлеб (ржаной) с маслом');
  });

  test('empty / whitespace → empty', () => {
    expect(normalizeFoodName('')).toBe('');
    expect(normalizeFoodName('   ')).toBe('');
  });
});

// ─── findSavedFoodMatch ───────────────────────────────────────────────────────

describe('findSavedFoodMatch', () => {
  const savedFoods = [
    { id: '1', name: 'Куриная грудка', calories: 110, protein: 23, fats: 1, carbs: 0, weightGrams: 100 },
    { id: '2', name: 'Рис бурый (100г)', calories: 112, protein: 2.6, fats: 0.9, carbs: 22, weightGrams: 100 },
    { id: '3', name: 'Яблоко', calories: 52, protein: 0.3, fats: 0.2, carbs: 14, weightGrams: 100 },
  ];

  test('matches exactly (case-insensitive)', () => {
    const m = findSavedFoodMatch(savedFoods, 'куриная грудка');
    expect(m?.id).toBe('1');
  });

  test('matches with weight suffix in saved name', () => {
    const m = findSavedFoodMatch(savedFoods, 'Рис бурый');
    expect(m?.id).toBe('2');
  });

  test('returns undefined for non-match', () => {
    expect(findSavedFoodMatch(savedFoods, 'пицца')).toBeUndefined();
  });

  test('returns undefined for empty query', () => {
    expect(findSavedFoodMatch(savedFoods, '')).toBeUndefined();
    expect(findSavedFoodMatch(savedFoods, '   ')).toBeUndefined();
  });

  test('does NOT do fuzzy / partial match', () => {
    // "яблоко" vs "яблочное пюре" — macros differ, we want strict matching
    expect(findSavedFoodMatch(savedFoods, 'яблочное')).toBeUndefined();
    expect(findSavedFoodMatch(savedFoods, 'яблок')).toBeUndefined();
  });
});

// ─── buildBarcodeDisplayName ──────────────────────────────────────────────────

describe('buildBarcodeDisplayName', () => {
  test('prefers Russian name over English', () => {
    expect(buildBarcodeDisplayName({
      product_name: 'Classic Coke',
      product_name_ru: 'Кока-Кола Классик',
      product_name_en: 'Coca-Cola Classic',
    })).toContain('Кока-Кола');
  });

  test('prefixes brand when name is short and brand absent', () => {
    expect(buildBarcodeDisplayName({
      product_name_ru: 'Молоко',
      brands: 'Простоквашино',
    })).toBe('Простоквашино Молоко');
  });

  test('does NOT prefix brand if already in name', () => {
    expect(buildBarcodeDisplayName({
      product_name: 'Coca-Cola Vanilla',
      brands: 'Coca-Cola',
    })).toBe('Coca-Cola Vanilla');
  });

  test('does NOT prefix brand for long-name products', () => {
    // 3+ word names are assumed to already be specific enough
    const r = buildBarcodeDisplayName({
      product_name_ru: 'Шоколад тёмный с фундуком',
      brands: 'Alpen Gold',
    });
    expect(r).toBe('Шоколад тёмный с фундуком');
  });

  test('appends quantity when not already in name', () => {
    expect(buildBarcodeDisplayName({
      product_name: 'Greek Yogurt',
      quantity: '150g',
    })).toBe('Greek Yogurt (150g)');
  });

  test('does not double-append quantity that is already present', () => {
    expect(buildBarcodeDisplayName({
      product_name: 'Coke 0.5l',
      quantity: '0.5l',
    })).toBe('Coke 0.5l');
  });

  test('falls back to brand when no product name', () => {
    expect(buildBarcodeDisplayName({
      brands: 'Danone',
    })).toBe('Danone');
  });

  test('falls back to placeholder when nothing given', () => {
    expect(buildBarcodeDisplayName({})).toBe('Неизвестный продукт');
  });

  test('clamps length to 150 chars', () => {
    const long = 'x'.repeat(300);
    expect(buildBarcodeDisplayName({ product_name: long }).length).toBeLessThanOrEqual(150);
  });

  test('collapses internal whitespace', () => {
    expect(buildBarcodeDisplayName({
      product_name: '  Milk     Farm  ',
    })).toBe('Milk Farm');
  });
});

// ─── defaultMealType ──────────────────────────────────────────────────────────

describe('defaultMealType', () => {
  const at = (hour: number) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  test('breakfast before 11', () => {
    expect(defaultMealType(at(6))).toBe('breakfast');
    expect(defaultMealType(at(10))).toBe('breakfast');
  });

  test('lunch 11–14', () => {
    expect(defaultMealType(at(11))).toBe('lunch');
    expect(defaultMealType(at(14))).toBe('lunch');
  });

  test('dinner 15–19', () => {
    expect(defaultMealType(at(15))).toBe('dinner');
    expect(defaultMealType(at(19))).toBe('dinner');
  });

  test('snack after 20', () => {
    expect(defaultMealType(at(20))).toBe('snack');
    expect(defaultMealType(at(23))).toBe('snack');
  });
});
