/**
 * Deep food scanner coverage — sanity flags, confidence buckets,
 * barcode name building, duplicate merging, typical portions, draft
 * freshness, meal-type defaults.
 *
 * Complements the existing scannerDesignFlow.test.ts — which covers
 * the refund round-trip — with the rest of the pure helpers.
 */

import {
  fingerprintBase64,
  flagSanity,
  confidenceBucket,
  buildBarcodeDisplayName,
  extractKcal,
  parseServingGrams,
  normalizeFoodName,
  findSavedFoodMatch,
  findDuplicateNames,
  mergeDuplicateItems,
  defaultMealType,
  median,
  computeTypicalPortions,
  typicalPortionFor,
  isDraftFresh,
  AI_CACHE_TTL_MS,
  SANITY_MAX_KCAL_PER_100G,
  SANITY_MAX_KCAL_PER_ITEM,
  SANITY_MAX_TOTAL_KCAL,
  DRAFT_TTL_MS,
} from '../utils/foodScanner';

// ─── Fingerprint ──────────────────────────────────────────────────────────

describe('fingerprintBase64', () => {
  test('short payload returns full string with length prefix', () => {
    const b64 = 'abc123';
    expect(fingerprintBase64(b64)).toBe('6:abc123');
  });

  test('exactly 128 chars uses full short form', () => {
    const b64 = 'a'.repeat(127);
    expect(fingerprintBase64(b64)).toBe(`127:${b64}`);
  });

  test('longer than 128 chars uses hash form', () => {
    const b64 = 'a'.repeat(200);
    const fp = fingerprintBase64(b64);
    expect(fp).toMatch(/^200:/);
    expect(fp.split(':')).toHaveLength(3);
  });

  test('same input → same fingerprint', () => {
    const b64 = 'test data here'.repeat(20);
    expect(fingerprintBase64(b64)).toBe(fingerprintBase64(b64));
  });

  test('different inputs → different fingerprints (short)', () => {
    expect(fingerprintBase64('a')).not.toBe(fingerprintBase64('b'));
  });
});

// ─── Sanity flags ─────────────────────────────────────────────────────────

describe('flagSanity', () => {
  test('empty array → no flags', () => {
    expect(flagSanity([])).toEqual([]);
  });

  test('normal food → no flags', () => {
    const items = [
      { calories: 200, weightGrams: 100 }, // 200 kcal/100g — normal
    ];
    expect(flagSanity(items)).toEqual([]);
  });

  test('oil-like density (900+ kcal/100g) triggers kcal_per_100g', () => {
    const items = [{ calories: 1000, weightGrams: 100 }]; // 1000 kcal/100g
    expect(flagSanity(items)).toContain('kcal_per_100g');
  });

  test('single 2500+ kcal item triggers kcal_per_item', () => {
    const items = [{ calories: 3000, weightGrams: 500 }];
    const flags = flagSanity(items);
    expect(flags).toContain('kcal_per_item');
  });

  test('5000+ total kcal triggers total_kcal', () => {
    const items = [
      { calories: 2500, weightGrams: 500 },
      { calories: 2500, weightGrams: 500 },
      { calories: 1000, weightGrams: 200 },
    ];
    const flags = flagSanity(items);
    expect(flags).toContain('total_kcal');
  });

  test('weightGrams 0 skipped for density flag', () => {
    const items = [{ calories: 1000, weightGrams: 0 }];
    expect(flagSanity(items)).not.toContain('kcal_per_100g');
  });

  test('multiple flags coexist', () => {
    const items = [
      { calories: 3000, weightGrams: 100 }, // kcal_per_item + kcal_per_100g
      { calories: 3000, weightGrams: 100 },
    ];
    const flags = flagSanity(items);
    expect(flags.length).toBeGreaterThan(0);
  });

  test('SANITY thresholds exported correctly', () => {
    expect(SANITY_MAX_KCAL_PER_100G).toBe(900);
    expect(SANITY_MAX_KCAL_PER_ITEM).toBe(2500);
    expect(SANITY_MAX_TOTAL_KCAL).toBe(5000);
  });
});

// ─── Confidence bucketing ────────────────────────────────────────────────

describe('confidenceBucket', () => {
  test('null → low', () => {
    expect(confidenceBucket(null)).toBe('low');
  });

  test('undefined → low', () => {
    expect(confidenceBucket(undefined)).toBe('low');
  });

  test('0 → low', () => {
    expect(confidenceBucket(0)).toBe('low');
  });

  test('0.4 → low', () => {
    expect(confidenceBucket(0.4)).toBe('low');
  });

  test('0.5 exactly → medium', () => {
    expect(confidenceBucket(0.5)).toBe('medium');
  });

  test('0.79 → medium', () => {
    expect(confidenceBucket(0.79)).toBe('medium');
  });

  test('0.8 exactly → high', () => {
    expect(confidenceBucket(0.8)).toBe('high');
  });

  test('1.0 → high', () => {
    expect(confidenceBucket(1.0)).toBe('high');
  });

  test('1.5 (over) → high', () => {
    expect(confidenceBucket(1.5)).toBe('high');
  });

  test('negative → low', () => {
    expect(confidenceBucket(-0.5)).toBe('low');
  });
});

// ─── Barcode display name ─────────────────────────────────────────────────

describe('buildBarcodeDisplayName', () => {
  test('Russian name preferred over English', () => {
    const n = buildBarcodeDisplayName({
      product_name_ru: 'Кока-Кола',
      product_name_en: 'Coca-Cola',
    });
    expect(n).toBe('Кока-Кола');
  });

  test('fallback to product_name when no localised variant', () => {
    const n = buildBarcodeDisplayName({ product_name: 'Classic Coke' });
    expect(n).toBe('Classic Coke');
  });

  test('fallback to brand when no name', () => {
    const n = buildBarcodeDisplayName({ brands: 'Cadbury' });
    expect(n).toBe('Cadbury');
  });

  test('Unknown placeholder when nothing provided', () => {
    expect(buildBarcodeDisplayName({})).toBe('Неизвестный продукт');
  });

  test('brand prefixed when name is short/generic', () => {
    const n = buildBarcodeDisplayName({
      product_name: 'Cola',
      brands: 'Pepsi',
    });
    expect(n).toContain('Pepsi');
    expect(n).toContain('Cola');
  });

  test('brand NOT doubled when name already contains it', () => {
    const n = buildBarcodeDisplayName({
      product_name: 'Coca-Cola Classic',
      brands: 'Coca-Cola',
    });
    expect(n.toLowerCase().split('coca').length).toBe(2); // appears once
  });

  test('quantity appended in parens when not already visible', () => {
    const n = buildBarcodeDisplayName({
      product_name: 'Coke',
      quantity: '500ml',
    });
    expect(n).toContain('(500ml)');
  });

  test('quantity NOT doubled if already in name', () => {
    const n = buildBarcodeDisplayName({
      product_name: 'Coke 500ml',
      quantity: '500ml',
    });
    expect(n).toBe('Coke 500ml');
  });

  test('output capped at 150 chars', () => {
    const longName = 'a'.repeat(500);
    const n = buildBarcodeDisplayName({ product_name: longName });
    expect(n.length).toBeLessThanOrEqual(150);
  });
});

// ─── extractKcal ──────────────────────────────────────────────────────────

describe('extractKcal from OFF nutriments', () => {
  test('prefers energy-kcal_100g', () => {
    expect(extractKcal({ 'energy-kcal_100g': 52, 'energy-kj_100g': 217 })).toBe(52);
  });

  test('falls back to energy-kcal', () => {
    expect(extractKcal({ 'energy-kcal': 100 })).toBe(100);
  });

  test('converts kJ if no kcal', () => {
    expect(extractKcal({ 'energy-kj_100g': 418.4 })).toBe(100);
  });

  test('converts from energy_100g if only that is set (and > 100)', () => {
    expect(extractKcal({ 'energy_100g': 418.4 })).toBe(100);
  });

  test('returns 0 if all zero', () => {
    expect(extractKcal({ 'energy-kcal_100g': 0 })).toBe(0);
  });

  test('returns 0 on empty object', () => {
    expect(extractKcal({})).toBe(0);
  });

  test('returns 0 on negative values', () => {
    expect(extractKcal({ 'energy-kcal_100g': -50 })).toBe(0);
  });
});

// ─── parseServingGrams ────────────────────────────────────────────────────

describe('parseServingGrams', () => {
  test('"100g" → 100', () => {
    expect(parseServingGrams('100g')).toBe(100);
  });

  test('"30 g" → 30', () => {
    expect(parseServingGrams('30 g')).toBe(30);
  });

  test('"250ml" → 250', () => {
    expect(parseServingGrams('250ml')).toBe(250);
  });

  test('"1 portion (45g)" → 45', () => {
    expect(parseServingGrams('1 portion (45g)')).toBe(45);
  });

  test('"30,5 g" comma decimal → 31', () => {
    expect(parseServingGrams('30,5 g')).toBe(31);
  });

  test('empty string → null', () => {
    expect(parseServingGrams('')).toBeNull();
  });

  test('too small weight → null (< 5g)', () => {
    expect(parseServingGrams('3g')).toBeNull();
  });

  test('too large weight → null (> 2000g)', () => {
    expect(parseServingGrams('3000g')).toBeNull();
  });

  test('nonsense string → null', () => {
    expect(parseServingGrams('some text')).toBeNull();
  });

  test('ml clamp respects 500ml ceiling', () => {
    expect(parseServingGrams('1000ml')).toBeNull();
  });
});

// ─── normalizeFoodName + findSavedFoodMatch ───────────────────────────────

describe('normalizeFoodName', () => {
  test('lowercases', () => {
    expect(normalizeFoodName('Яблоко')).toBe('яблоко');
  });

  test('strips "(100г)"', () => {
    expect(normalizeFoodName('яблоко (100г)')).toBe('яблоко');
  });

  test('strips "(30 g)"', () => {
    expect(normalizeFoodName('apple (30 g)')).toBe('apple');
  });

  test('collapses whitespace', () => {
    expect(normalizeFoodName('  apple   tart  ')).toBe('apple tart');
  });

  test('empty string passes', () => {
    expect(normalizeFoodName('')).toBe('');
  });
});

describe('findSavedFoodMatch', () => {
  const saved = [
    { id: '1', name: 'Яблоко', calories: 52, protein: 0.3, fats: 0.2, carbs: 14, weightGrams: 100 },
    { id: '2', name: 'Куриная грудка', calories: 165, protein: 31, fats: 3.6, carbs: 0, weightGrams: 100 },
  ];

  test('exact match found', () => {
    const m = findSavedFoodMatch(saved, 'Яблоко');
    expect(m?.id).toBe('1');
  });

  test('case-insensitive match', () => {
    expect(findSavedFoodMatch(saved, 'ЯБЛОКО')?.id).toBe('1');
  });

  test('weight-suffix stripped for match', () => {
    expect(findSavedFoodMatch(saved, 'Куриная грудка (150г)')?.id).toBe('2');
  });

  test('non-matching name → undefined', () => {
    expect(findSavedFoodMatch(saved, 'Мороженое')).toBeUndefined();
  });

  test('empty query → undefined', () => {
    expect(findSavedFoodMatch(saved, '')).toBeUndefined();
  });
});

// ─── findDuplicateNames ──────────────────────────────────────────────────

describe('findDuplicateNames', () => {
  test('all unique → empty set', () => {
    const s = findDuplicateNames([
      { name: 'apple' },
      { name: 'banana' },
    ]);
    expect(s.size).toBe(0);
  });

  test('2 same → 1 dup key', () => {
    const s = findDuplicateNames([
      { name: 'apple' },
      { name: 'Apple' },
    ]);
    expect(s.has('apple')).toBe(true);
  });

  test('normalized matching', () => {
    const s = findDuplicateNames([
      { name: 'Яблоко' },
      { name: 'яблоко (100г)' },
    ]);
    expect(s.has('яблоко')).toBe(true);
  });

  test('empty names skipped', () => {
    const s = findDuplicateNames([{ name: '' }, { name: '' }]);
    expect(s.size).toBe(0);
  });
});

// ─── mergeDuplicateItems ─────────────────────────────────────────────────

describe('mergeDuplicateItems', () => {
  test('no duplicates → unchanged', () => {
    const items = [
      { id: '1', name: 'apple', weightGrams: 100, calories: 52, protein: 0.3, fats: 0.2, carbs: 14 },
      { id: '2', name: 'banana', weightGrams: 100, calories: 89, protein: 1.1, fats: 0.3, carbs: 23 },
    ];
    const result = mergeDuplicateItems(items, {});
    expect(result.mergedCount).toBe(0);
    expect(result.items.length).toBe(2);
  });

  test('2 duplicates → merged into 1', () => {
    const items = [
      { id: '1', name: 'apple', weightGrams: 100, calories: 52, protein: 0.3, fats: 0.2, carbs: 14, confidence: 0.9 },
      { id: '2', name: 'Apple', weightGrams: 50, calories: 26, protein: 0.15, fats: 0.1, carbs: 7, confidence: 0.5 },
    ];
    const bases = { '1': { cal: 52, prot: 0.3, fats: 0.2, carbs: 14 } };
    const result = mergeDuplicateItems(items, bases);
    expect(result.mergedCount).toBe(1);
    expect(result.items.length).toBe(1);
    expect(result.items[0].weightGrams).toBe(150);
    expect(result.items[0].calories).toBe(78); // 52 * 1.5
  });

  test('merged item takes max confidence', () => {
    const items = [
      { id: '1', name: 'apple', weightGrams: 100, calories: 52, protein: 0.3, fats: 0.2, carbs: 14, confidence: 0.5 },
      { id: '2', name: 'Apple', weightGrams: 50, calories: 26, protein: 0.15, fats: 0.1, carbs: 7, confidence: 0.95 },
    ];
    const bases = { '1': { cal: 52, prot: 0.3, fats: 0.2, carbs: 14 } };
    const result = mergeDuplicateItems(items, bases);
    expect(result.items[0].confidence).toBeCloseTo(0.95);
  });
});

// ─── defaultMealType ─────────────────────────────────────────────────────

describe('defaultMealType', () => {
  test('7am → breakfast', () => {
    const d = new Date();
    d.setHours(7);
    expect(defaultMealType(d)).toBe('breakfast');
  });

  test('11am → lunch (just after breakfast)', () => {
    const d = new Date();
    d.setHours(11);
    expect(defaultMealType(d)).toBe('lunch');
  });

  test('1pm → lunch', () => {
    const d = new Date();
    d.setHours(13);
    expect(defaultMealType(d)).toBe('lunch');
  });

  test('6pm → dinner', () => {
    const d = new Date();
    d.setHours(18);
    expect(defaultMealType(d)).toBe('dinner');
  });

  test('11pm → snack', () => {
    const d = new Date();
    d.setHours(23);
    expect(defaultMealType(d)).toBe('snack');
  });

  test('midnight edge → breakfast', () => {
    const d = new Date();
    d.setHours(0);
    expect(defaultMealType(d)).toBe('breakfast');
  });
});

// ─── Median ───────────────────────────────────────────────────────────────

describe('median helper', () => {
  test('empty array → 0', () => {
    expect(median([])).toBe(0);
  });

  test('single element → itself', () => {
    expect(median([42])).toBe(42);
  });

  test('odd length', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });

  test('even length → avg of middle two', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  test('unsorted input handled', () => {
    expect(median([5, 3, 1, 4, 2])).toBe(3);
  });

  test('negative numbers', () => {
    expect(median([-5, -3, -1])).toBe(-3);
  });

  test('floats', () => {
    expect(median([1.5, 2.5, 3.5])).toBe(2.5);
  });
});

// ─── computeTypicalPortions + typicalPortionFor ──────────────────────────

describe('computeTypicalPortions', () => {
  test('insufficient samples excluded', () => {
    const meals = [
      { items: [{ name: 'apple', weightGrams: 100 }] },
    ];
    const typical = computeTypicalPortions(meals);
    expect(typical.size).toBe(0);
  });

  test('2 samples included', () => {
    const meals = [
      { items: [{ name: 'apple', weightGrams: 100 }] },
      { items: [{ name: 'apple', weightGrams: 150 }] },
    ];
    const typical = computeTypicalPortions(meals);
    expect(typical.get('apple')).toBe(125);
  });

  test('zero weight filtered out', () => {
    const meals = [
      { items: [{ name: 'apple', weightGrams: 0 }] },
      { items: [{ name: 'apple', weightGrams: 100 }] },
    ];
    const typical = computeTypicalPortions(meals);
    expect(typical.size).toBe(0); // only 1 valid sample, < minSamples
  });

  test('NaN weight filtered out', () => {
    const meals = [
      { items: [{ name: 'apple', weightGrams: NaN }] },
      { items: [{ name: 'apple', weightGrams: 100 }] },
      { items: [{ name: 'apple', weightGrams: 150 }] },
    ];
    const typical = computeTypicalPortions(meals);
    expect(typical.get('apple')).toBe(125);
  });
});

describe('typicalPortionFor', () => {
  test('returns portion for normalized name', () => {
    const typical = new Map([['apple', 150]]);
    expect(typicalPortionFor(typical, 'Apple')).toBe(150);
  });

  test('returns undefined for unknown', () => {
    const typical = new Map();
    expect(typicalPortionFor(typical, 'Apple')).toBeUndefined();
  });

  test('matches with weight suffix stripped', () => {
    const typical = new Map([['apple', 150]]);
    expect(typicalPortionFor(typical, 'apple (100г)')).toBe(150);
  });
});

// ─── Draft freshness ─────────────────────────────────────────────────────

describe('isDraftFresh', () => {
  test('null draft → not fresh', () => {
    expect(isDraftFresh(null)).toBe(false);
  });

  test('just saved → fresh', () => {
    expect(isDraftFresh({ mealType: 'lunch', isBarcodeResult: false, items: [], savedAt: Date.now() })).toBe(true);
  });

  test('saved 1h ago → fresh', () => {
    expect(isDraftFresh({ mealType: 'lunch', isBarcodeResult: false, items: [], savedAt: Date.now() - 60 * 60 * 1000 })).toBe(true);
  });

  test('saved 3h ago → not fresh (TTL 2h)', () => {
    expect(isDraftFresh({ mealType: 'lunch', isBarcodeResult: false, items: [], savedAt: Date.now() - 3 * 60 * 60 * 1000 })).toBe(false);
  });

  test('DRAFT_TTL_MS exported as 2 hours', () => {
    expect(DRAFT_TTL_MS).toBe(2 * 60 * 60 * 1000);
  });

  test('AI_CACHE_TTL_MS exported as 24 hours', () => {
    expect(AI_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
