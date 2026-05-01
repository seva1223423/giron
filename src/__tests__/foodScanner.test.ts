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
  findDuplicateNames,
  mergeDuplicateItems,
  normalizeFoodName,
  buildBarcodeDisplayName,
  median,
  computeTypicalPortions,
  typicalPortionFor,
  isDraftFresh,
  DRAFT_TTL_MS,
  SANITY_MAX_KCAL_PER_100G,
  SANITY_MAX_KCAL_PER_ITEM,
  SANITY_MAX_TOTAL_KCAL,
  sanitizeBarcode,
  verifyEan13Checksum,
  isRussianBarcode,
  isOFFDataPlausible,
  OFF_HOSTS,
  type ScannerDraft,
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

// ─── findDuplicateNames ───────────────────────────────────────────────────────

describe('findDuplicateNames', () => {
  test('returns empty set when no duplicates', () => {
    const dups = findDuplicateNames([{ name: 'Яблоко' }, { name: 'Рис' }, { name: 'Курица' }]);
    expect(dups.size).toBe(0);
  });

  test('detects exact duplicates (same casing)', () => {
    const dups = findDuplicateNames([{ name: 'Яблоко' }, { name: 'Яблоко' }]);
    expect(dups.has('яблоко')).toBe(true);
    expect(dups.size).toBe(1);
  });

  test('normalizes case and weight suffix when detecting duplicates', () => {
    const dups = findDuplicateNames([
      { name: 'Яблоко' },
      { name: 'яблоко (100г)' },
      { name: 'ЯБЛОКО' },
    ]);
    expect(dups.has('яблоко')).toBe(true);
    expect(dups.size).toBe(1);
  });

  test('skips empty / whitespace-only names', () => {
    const dups = findDuplicateNames([{ name: '' }, { name: '   ' }, { name: 'Курица' }]);
    expect(dups.size).toBe(0);
  });

  test('handles mixed duplicates + uniques', () => {
    const dups = findDuplicateNames([
      { name: 'Яблоко' },
      { name: 'яблоко' },
      { name: 'Курица' },
      { name: 'Рис' },
      { name: 'рис (200г)' },
    ]);
    expect(dups.size).toBe(2);
    expect(dups.has('яблоко')).toBe(true);
    expect(dups.has('рис')).toBe(true);
    expect(dups.has('курица')).toBe(false);
  });
});

// ─── mergeDuplicateItems ──────────────────────────────────────────────────────

describe('mergeDuplicateItems', () => {
  const itemFactory = (id: string, name: string, weightGrams: number, calPer100: number = 100) => ({
    id,
    name,
    weightGrams,
    calories: Math.round((calPer100 * weightGrams) / 100),
    protein: 1,
    fats: 1,
    carbs: 1,
    confidence: 0.9 as number | undefined,
  });

  test('no duplicates — returns originals with mergedCount 0', () => {
    const items = [itemFactory('a', 'Яблоко', 100), itemFactory('b', 'Рис', 200)];
    const bases = {
      a: { cal: 52, prot: 0.3, fats: 0.2, carbs: 14 },
      b: { cal: 112, prot: 2.6, fats: 0.9, carbs: 22 },
    };
    const result = mergeDuplicateItems(items, bases);
    expect(result.mergedCount).toBe(0);
    expect(result.items).toBe(items); // referentially same array on no-op
    expect(result.bases).toEqual(bases);
  });

  test('merges two duplicates — weights summed, macros recomputed from first base', () => {
    const items = [
      itemFactory('a', 'Яблоко', 150),
      itemFactory('b', 'яблоко', 100),
    ];
    const bases = {
      a: { cal: 52, prot: 0.3, fats: 0.2, carbs: 14 },
      b: { cal: 52, prot: 0.3, fats: 0.2, carbs: 14 },
    };
    const result = mergeDuplicateItems(items, bases);
    expect(result.mergedCount).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('a');
    expect(result.items[0].weightGrams).toBe(250);
    // 52 kcal/100g × 250g = 130 kcal
    expect(result.items[0].calories).toBe(130);
    // Base for dropped id 'b' is pruned
    expect(result.bases).toEqual({ a: bases.a });
  });

  test('three duplicates collapse into one', () => {
    const items = [
      itemFactory('a', 'Рис', 100),
      itemFactory('b', 'Рис', 200),
      itemFactory('c', 'рис (300г)', 50),
    ];
    const bases = {
      a: { cal: 130, prot: 2.7, fats: 0.3, carbs: 28 },
      b: { cal: 130, prot: 2.7, fats: 0.3, carbs: 28 },
      c: { cal: 130, prot: 2.7, fats: 0.3, carbs: 28 },
    };
    const result = mergeDuplicateItems(items, bases);
    expect(result.mergedCount).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].weightGrams).toBe(350);
    // 130 × 350 / 100 = 455
    expect(result.items[0].calories).toBe(455);
  });

  test('mixed duplicates + uniques keeps uniques untouched', () => {
    const items = [
      itemFactory('a', 'Яблоко', 100),
      itemFactory('b', 'Рис', 200),
      itemFactory('c', 'яблоко', 150),
      itemFactory('d', 'Курица', 180),
    ];
    const bases = {
      a: { cal: 52, prot: 0.3, fats: 0.2, carbs: 14 },
      b: { cal: 112, prot: 2.6, fats: 0.9, carbs: 22 },
      c: { cal: 52, prot: 0.3, fats: 0.2, carbs: 14 },
      d: { cal: 165, prot: 31, fats: 3.6, carbs: 0 },
    };
    const result = mergeDuplicateItems(items, bases);
    expect(result.mergedCount).toBe(1);
    expect(result.items).toHaveLength(3);
    const byId = Object.fromEntries(result.items.map((i) => [i.id, i]));
    expect(byId.a.weightGrams).toBe(250); // 100 + 150
    expect(byId.b.weightGrams).toBe(200);
    expect(byId.d.weightGrams).toBe(180);
    expect(byId.c).toBeUndefined();
  });

  test('items without a base fall through with weight-only merge', () => {
    const items = [
      itemFactory('a', 'Яблоко', 100),
      itemFactory('b', 'яблоко', 50),
    ];
    const bases: Record<string, any> = {
      // Intentionally no base for 'a' — expected to sum weight but leave
      // the original cal/prot/fats/carbs untouched.
    };
    const result = mergeDuplicateItems(items, bases);
    expect(result.mergedCount).toBe(1);
    expect(result.items[0].weightGrams).toBe(150);
    expect(result.items[0].calories).toBe(items[0].calories); // unchanged
  });

  test('empty-name items are left alone', () => {
    const items = [
      itemFactory('a', '', 100),
      itemFactory('b', '', 100),
      itemFactory('c', 'Рис', 200),
    ];
    const bases = {
      a: { cal: 50, prot: 1, fats: 1, carbs: 1 },
      b: { cal: 50, prot: 1, fats: 1, carbs: 1 },
      c: { cal: 112, prot: 2.6, fats: 0.9, carbs: 22 },
    };
    const result = mergeDuplicateItems(items, bases);
    // Empty names can't be grouped → no merges
    expect(result.mergedCount).toBe(0);
    expect(result.items).toHaveLength(3);
  });

  test('merge promotes kept item confidence to group max', () => {
    const items = [
      { ...itemFactory('a', 'Рис', 100), confidence: 0.4 },
      { ...itemFactory('b', 'рис', 200), confidence: 0.95 },
    ];
    const bases = {
      a: { cal: 130, prot: 2.7, fats: 0.3, carbs: 28 },
      b: { cal: 130, prot: 2.7, fats: 0.3, carbs: 28 },
    };
    const result = mergeDuplicateItems(items, bases);
    expect(result.items).toHaveLength(1);
    // Kept item had conf 0.4; merged item had 0.95 — result should be 0.95
    // so the confidence dot flips from red to green after merging.
    expect(result.items[0].confidence).toBe(0.95);
  });

  test('merge keeps kept confidence when kept is higher', () => {
    const items = [
      { ...itemFactory('a', 'Рис', 100), confidence: 0.9 },
      { ...itemFactory('b', 'рис', 200), confidence: 0.4 },
    ];
    const bases = {
      a: { cal: 130, prot: 2.7, fats: 0.3, carbs: 28 },
      b: { cal: 130, prot: 2.7, fats: 0.3, carbs: 28 },
    };
    const result = mergeDuplicateItems(items, bases);
    expect(result.items[0].confidence).toBe(0.9);
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

// ─── median ───────────────────────────────────────────────────────────────────

describe('median', () => {
  test('empty array → 0', () => {
    expect(median([])).toBe(0);
  });

  test('single value', () => {
    expect(median([42])).toBe(42);
  });

  test('odd-length array returns middle element', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
    expect(median([5, 1, 3, 2, 4])).toBe(3); // unsorted input
  });

  test('even-length array averages the two middles', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([4, 2, 1, 3])).toBe(2.5);
  });

  test('robust against a single outlier (vs mean)', () => {
    // mean would be 210, median 150 — proves that an outlier family-dinner
    // portion doesn't pull the suggestion away from the user's typical.
    expect(median([150, 150, 160, 150, 440])).toBe(150);
  });
});

// ─── computeTypicalPortions / typicalPortionFor ───────────────────────────────

describe('computeTypicalPortions', () => {
  const meal = (items: Array<{ name: string; weightGrams: number }>) => ({ items });

  test('returns empty map for empty history', () => {
    expect(computeTypicalPortions([]).size).toBe(0);
  });

  test('requires minSamples (default 2) observations per food', () => {
    const m = computeTypicalPortions([meal([{ name: 'Рис', weightGrams: 150 }])]);
    expect(m.size).toBe(0);
  });

  test('groups items by normalized name across meals and returns median', () => {
    const m = computeTypicalPortions([
      meal([{ name: 'Куриная грудка', weightGrams: 150 }]),
      meal([{ name: 'куриная  грудка', weightGrams: 160 }]),
      meal([{ name: 'Куриная грудка (200г)', weightGrams: 200 }]),
    ]);
    expect(m.get('куриная грудка')).toBe(160); // median of 150, 160, 200
  });

  test('ignores zero / negative / non-finite weights', () => {
    const m = computeTypicalPortions([
      meal([{ name: 'Рис', weightGrams: 0 }]),
      meal([{ name: 'Рис', weightGrams: -100 }]),
      meal([{ name: 'Рис', weightGrams: NaN }]),
    ]);
    expect(m.size).toBe(0);
  });

  test('custom minSamples can be lowered for sparse users', () => {
    const m = computeTypicalPortions([meal([{ name: 'Творог', weightGrams: 200 }])], 1);
    expect(m.get('творог')).toBe(200);
  });
});

describe('typicalPortionFor', () => {
  test('returns the median for a known normalized name', () => {
    const map = new Map([['куриная грудка', 150]]);
    expect(typicalPortionFor(map, 'Куриная грудка (100г)')).toBe(150);
  });

  test('returns undefined for unknown food', () => {
    expect(typicalPortionFor(new Map(), 'пицца')).toBeUndefined();
  });
});

// ─── isDraftFresh ─────────────────────────────────────────────────────────────

describe('isDraftFresh', () => {
  const mkDraft = (ageMs: number): ScannerDraft => ({
    mealType: 'lunch',
    isBarcodeResult: false,
    items: [{ name: 'a', calories: 1, protein: 1, fats: 1, carbs: 1, weightGrams: 100 }],
    savedAt: Date.now() - ageMs,
  });

  test('null / undefined → false', () => {
    expect(isDraftFresh(null)).toBe(false);
    expect(isDraftFresh(undefined)).toBe(false);
  });

  test('draft within TTL → true', () => {
    expect(isDraftFresh(mkDraft(0))).toBe(true);
    expect(isDraftFresh(mkDraft(DRAFT_TTL_MS - 1000))).toBe(true);
  });

  test('draft older than TTL → false', () => {
    expect(isDraftFresh(mkDraft(DRAFT_TTL_MS + 1))).toBe(false);
    expect(isDraftFresh(mkDraft(7 * 24 * 60 * 60 * 1000))).toBe(false);
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

// ─── verifyEan13Checksum ──────────────────────────────────────────────────────

describe('verifyEan13Checksum', () => {
  test('accepts a known-valid EAN-13 (Coca-Cola RU 0.5L)', () => {
    // 5449000000996 — Coca-Cola classic, widely scannable in RF
    expect(verifyEan13Checksum('5449000000996')).toBe(true);
  });

  test('accepts a known-valid 460-prefix RU EAN-13', () => {
    // 4607034570316 — Простоквашино молоко, standard RF SKU
    expect(verifyEan13Checksum('4607034570316')).toBe(true);
  });

  test('rejects EAN-13 with bad check digit', () => {
    // Last digit changed from 6 → 0 — should fail checksum
    expect(verifyEan13Checksum('5449000000990')).toBe(false);
  });

  test('rejects wrong-length input', () => {
    expect(verifyEan13Checksum('123')).toBe(false);
    expect(verifyEan13Checksum('12345678901234')).toBe(false);
  });

  test('rejects non-digit input', () => {
    expect(verifyEan13Checksum('abcdefghijklm')).toBe(false);
    expect(verifyEan13Checksum('5449000-00996')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(verifyEan13Checksum('')).toBe(false);
  });
});

// ─── sanitizeBarcode ──────────────────────────────────────────────────────────

describe('sanitizeBarcode', () => {
  test('strips whitespace and returns clean digits', () => {
    expect(sanitizeBarcode('  5449000000996 ')).toBe('5449000000996');
  });

  test('strips embedded non-digits (e.g. control bytes from decoder)', () => {
    expect(sanitizeBarcode('5449\x00000000996')).toBe('5449000000996');
    expect(sanitizeBarcode('5449-0000-0099-6')).toBe('5449000000996');
  });

  test('accepts EAN-8 (8 digits, no checksum check on this length)', () => {
    expect(sanitizeBarcode('12345670')).toBe('12345670');
  });

  test('accepts UPC-A (12 digits)', () => {
    expect(sanitizeBarcode('012345678905')).toBe('012345678905');
  });

  test('accepts GTIN-14 (14 digits)', () => {
    expect(sanitizeBarcode('00012345678905')).toBe('00012345678905');
  });

  test('rejects EAN-13 with invalid checksum', () => {
    expect(sanitizeBarcode('5449000000990')).toBeNull();
  });

  test('accepts EAN-13 with valid checksum', () => {
    expect(sanitizeBarcode('5449000000996')).toBe('5449000000996');
  });

  test('rejects malformed lengths (partial reads from creased labels)', () => {
    expect(sanitizeBarcode('1234')).toBeNull();
    expect(sanitizeBarcode('12345678901')).toBeNull(); // 11 digits
    expect(sanitizeBarcode('123456789012345')).toBeNull(); // 15 digits
  });

  test('rejects empty / whitespace-only', () => {
    expect(sanitizeBarcode('')).toBeNull();
    expect(sanitizeBarcode('    ')).toBeNull();
    expect(sanitizeBarcode('---')).toBeNull();
  });
});

// ─── isRussianBarcode ─────────────────────────────────────────────────────────

describe('isRussianBarcode', () => {
  test('detects 460 prefix (RU)', () => {
    expect(isRussianBarcode('4607034570316')).toBe(true);
  });

  test('detects 469 prefix (RU)', () => {
    // Synthetic — sum check designed to pass: digits 4,6,9,0,0,0,0,0,0,0,0,0
    // Use a real valid 469-prefix instead: 4690228000004 (some RU local SKU
    // pattern). Verify it passes EAN-13 first or just check that prefix
    // detection works regardless of checksum.
    // Note: isRussianBarcode internally requires 13 digits and digit-only.
    // It does NOT require checksum to pass — it just inspects the prefix.
    // So we can use any 469-prefix synthetic string.
    expect(isRussianBarcode('4690000000000')).toBe(true);
  });

  test('rejects non-RU prefixes', () => {
    expect(isRussianBarcode('5449000000996')).toBe(false); // BE Coca-Cola
    expect(isRussianBarcode('4012345678901')).toBe(false); // DE 401
    expect(isRussianBarcode('4590000000000')).toBe(false); // 459 — just under
    expect(isRussianBarcode('4700000000000')).toBe(false); // 470 — just over
  });

  test('rejects wrong-length input (sanity)', () => {
    expect(isRussianBarcode('46012345')).toBe(false);
    expect(isRussianBarcode('4607034570316123')).toBe(false);
    expect(isRussianBarcode('')).toBe(false);
  });
});

// ─── OFF_HOSTS ordering ───────────────────────────────────────────────────────

describe('OFF_HOSTS', () => {
  test('ru.openfoodfacts.org is the primary endpoint', () => {
    // Order matters — fetchBarcodeFromOFF iterates in array order, so
    // the first entry is the one we hit on the happy path. Locking the
    // RU mirror first protects RF users from RKN-style block events
    // that have hit the world. domain in the past.
    expect(OFF_HOSTS[0]).toBe('ru.openfoodfacts.org');
    expect(OFF_HOSTS[1]).toBe('world.openfoodfacts.org');
  });
});

// ─── isOFFDataPlausible ───────────────────────────────────────────────────────

describe('isOFFDataPlausible', () => {
  test('accepts a typical real-world product (apple)', () => {
    expect(isOFFDataPlausible(52, 0.3, 0.2, 14)).toBe(true);
  });

  test('accepts pure olive oil (near the natural ceiling)', () => {
    expect(isOFFDataPlausible(884, 0, 100, 0)).toBe(true);
  });

  test('accepts whey protein isolate (high protein, normal kcal)', () => {
    expect(isOFFDataPlausible(380, 90, 5, 4)).toBe(true);
  });

  test('rejects kJ-as-kcal mistake (1500+ kcal/100g)', () => {
    // Common OFF data-entry error: contributor pasted kJ value into
    // the kcal field. 1500 kcal/100g exceeds any real food.
    expect(isOFFDataPlausible(1500, 5, 5, 70)).toBe(false);
  });

  test('rejects per-serving values posted as per-100g', () => {
    // 350g of protein per 100g would mean a 30g sachet contains
    // 105g of protein. Physically impossible — a typical mis-post.
    expect(isOFFDataPlausible(380, 350, 5, 4)).toBe(false);
  });

  test('rejects when macros sum exceeds 1100 kcal/100g', () => {
    // p=50, f=50, c=50 → 4*50 + 9*50 + 4*50 = 600 — fine.
    // p=80, f=80, c=80 → 4*80 + 9*80 + 4*80 = 1360 — impossible.
    expect(isOFFDataPlausible(800, 80, 80, 80)).toBe(false);
  });

  test('allows 10% slack on carbs (rounding noise on isomalt-heavy)', () => {
    // 105g/100g carbs is rounding noise on certain sweeteners.
    expect(isOFFDataPlausible(420, 0, 0, 105)).toBe(true);
    // 115g is past the slack — reject.
    expect(isOFFDataPlausible(460, 0, 0, 115)).toBe(false);
  });

  test('boundary: exactly 900 kcal/100g passes', () => {
    expect(isOFFDataPlausible(900, 0, 100, 0)).toBe(true);
  });

  test('boundary: 901 kcal/100g rejected', () => {
    expect(isOFFDataPlausible(901, 0, 100, 0)).toBe(false);
  });

  test('rejects single-macro overflow', () => {
    expect(isOFFDataPlausible(500, 101, 5, 5)).toBe(false);
    expect(isOFFDataPlausible(500, 5, 101, 5)).toBe(false);
  });
});
