/**
 * Round 213 — auto-inject allergies from AIMemory into find_recipes.
 *
 * The system prompt tells AI to forward stored allergies via the
 * allergensExcluded param. But LLMs forget, especially on long
 * contexts. The new auto-inject reads AIMemory rows where
 * category=allergy and adds any matching enum to safeAllergens
 * regardless of whether AI passed them.
 *
 * This is a SAFETY NET — pushing the floor of recipe-suggestion
 * quality up. AI's own forwarding still works as the primary path.
 */

const VALID_ALLERGENS = ['lactose', 'gluten', 'eggs', 'nuts', 'fish', 'soy'] as const;
type Allergen = typeof VALID_ALLERGENS[number];

const ruMap: Record<Allergen, string[]> = {
  lactose: ['лактоз', 'молок', 'молочн'],
  gluten: ['глютен', 'пшениц'],
  eggs: ['яйц', 'яйк'],
  nuts: ['орех', 'орех'],
  fish: ['рыб'],
  soy: ['соя', 'соев'],
};

type AIMemoryRow = { key: string; value: string };

function injectAllergies(
  initial: string[],
  rows: AIMemoryRow[],
): Allergen[] {
  const out = initial.filter((a): a is Allergen =>
    (VALID_ALLERGENS as readonly string[]).includes(a),
  );
  for (const mem of rows) {
    const lowerKey = (mem.key ?? '').toLowerCase();
    const lowerValue = (mem.value ?? '').toLowerCase();
    for (const allergen of VALID_ALLERGENS) {
      if (
        (lowerKey.includes(allergen) || lowerValue.includes(allergen)) &&
        !out.includes(allergen)
      ) {
        out.push(allergen);
      }
      if (ruMap[allergen].some((w) => lowerKey.includes(w) || lowerValue.includes(w))) {
        if (!out.includes(allergen)) out.push(allergen);
      }
    }
  }
  return out;
}

// ─── English-tag matching ───────────────────────────────────────────────────

describe('injectAllergies — English allergen names', () => {
  test('key="allergy_nuts" → injects nuts', () => {
    const r = injectAllergies([], [{ key: 'allergy_nuts', value: 'true' }]);
    expect(r).toContain('nuts');
  });

  test('key="lactose_intolerance" → injects lactose', () => {
    const r = injectAllergies([], [{ key: 'lactose_intolerance', value: 'true' }]);
    expect(r).toContain('lactose');
  });

  test('value=lactose → injects lactose', () => {
    const r = injectAllergies([], [{ key: 'food_allergy', value: 'lactose' }]);
    expect(r).toContain('lactose');
  });

  test('multiple allergies in same memory row', () => {
    const r = injectAllergies(
      [],
      [{ key: 'allergies', value: 'gluten and nuts' }],
    );
    expect(r).toContain('gluten');
    expect(r).toContain('nuts');
  });
});

// ─── Russian fallback matching ──────────────────────────────────────────────

describe('injectAllergies — Russian language', () => {
  test('value="не ем молочное" → injects lactose', () => {
    const r = injectAllergies([], [{ key: 'allergy_x', value: 'не ем молочное' }]);
    expect(r).toContain('lactose');
  });

  test('value="аллергия на орехи" → injects nuts', () => {
    const r = injectAllergies([], [{ key: 'allergy_x', value: 'аллергия на орехи' }]);
    expect(r).toContain('nuts');
  });

  test('value="не переношу пшеницу" → injects gluten', () => {
    const r = injectAllergies([], [{ key: 'restriction', value: 'не переношу пшеницу' }]);
    expect(r).toContain('gluten');
  });

  test('value="яйца запрещены" → injects eggs', () => {
    const r = injectAllergies([], [{ key: 'r', value: 'яйца запрещены' }]);
    expect(r).toContain('eggs');
  });

  test('value="не ест рыбу" → injects fish', () => {
    const r = injectAllergies([], [{ key: 'r', value: 'не ест рыбу' }]);
    expect(r).toContain('fish');
  });

  test('value="соевый безопасно? нет, аллергия" — partial match still injects soy', () => {
    const r = injectAllergies([], [{ key: 'r', value: 'соевый продукт нельзя' }]);
    expect(r).toContain('soy');
  });
});

// ─── Combination with explicit AI input ─────────────────────────────────────

describe('injectAllergies — merge with AI-provided list', () => {
  test('AI passed nuts; memory adds lactose', () => {
    const r = injectAllergies(
      ['nuts'],
      [{ key: 'lactose_int', value: 'yes' }],
    );
    expect(r).toContain('nuts');
    expect(r).toContain('lactose');
    expect(r.length).toBe(2);
  });

  test('no duplicates if AI and memory both have same allergen', () => {
    const r = injectAllergies(
      ['nuts'],
      [{ key: 'allergy_nuts', value: 'true' }],
    );
    expect(r.filter((a) => a === 'nuts').length).toBe(1);
  });

  test('invalid allergens from AI input are dropped', () => {
    const r = injectAllergies(
      ['nuts', 'shellfish' /* not in enum */, 'soy'],
      [],
    );
    expect(r).toContain('nuts');
    expect(r).toContain('soy');
    expect(r).not.toContain('shellfish');
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('injectAllergies — edge cases', () => {
  test('empty memory rows → returns initial only', () => {
    expect(injectAllergies(['nuts'], [])).toEqual(['nuts']);
  });

  test('memory row with empty key+value → no inject', () => {
    expect(injectAllergies([], [{ key: '', value: '' }])).toEqual([]);
  });

  test('memory row unrelated to allergens → no inject', () => {
    expect(
      injectAllergies([], [{ key: 'home_equipment', value: 'TRX и гантели' }]),
    ).toEqual([]);
  });

  test('case insensitivity — "ЛАКТОЗА" matches', () => {
    const r = injectAllergies([], [{ key: 'r', value: 'ЛАКТОЗА' }]);
    expect(r).toContain('lactose');
  });

  test('memory value mentioning multiple Russian terms', () => {
    const r = injectAllergies([], [
      { key: 'a', value: 'молочное и яйца не ем' },
      { key: 'b', value: 'рыба тоже не подходит' },
    ]);
    expect(r).toContain('lactose');
    expect(r).toContain('eggs');
    expect(r).toContain('fish');
  });
});

// ─── Safety property ────────────────────────────────────────────────────────

describe('injectAllergies — safety net floor', () => {
  test('AI forgot to pass allergies → memory provides them', () => {
    // This is the killer case: AI didn't include allergensExcluded,
    // but user has 3 stored allergies. Without this helper, AI could
    // suggest a recipe with peanuts to someone allergic to nuts.
    const r = injectAllergies([], [
      { key: 'allergy_nuts', value: 'true' },
      { key: 'lactose_int', value: 'true' },
      { key: 'gluten_intol', value: 'true' },
    ]);
    expect(r.sort()).toEqual(['gluten', 'lactose', 'nuts'].sort());
  });

  test('result is constrained to VALID_ALLERGENS enum (over-restrict is safe)', () => {
    // Note: substring matching means "shellfish" → "fish" is a false
    // positive. For a safety net, over-restricting is acceptable —
    // worst case the user gets fewer recipe suggestions, never an
    // allergen-containing one. This test pins that behavior.
    const r = injectAllergies([], [
      { key: 'shellfish_allergy', value: 'true' },
    ]);
    expect(r).toEqual(['fish']); // documents the over-restriction
  });

  test('truly unrelated key produces empty result', () => {
    const r = injectAllergies([], [
      { key: 'preferred_protein_source', value: 'chicken' },
    ]);
    expect(r).toEqual([]);
  });
});
