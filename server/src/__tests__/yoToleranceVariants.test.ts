/**
 * Round 218 — ё↔е variant generation for exercise search.
 *
 * Seed data has canonical Russian names with ё ("Жим штанги лёжа"),
 * but users routinely type without ё ("жим лежа"). Postgres ILIKE
 * doesn't normalize, so contains searches fail. The fix: generate
 * both variants of the query and OR them.
 *
 * Re-implementation of the variant logic so we can pin its behavior.
 * If ai.ts changes, update here.
 */

function buildYoVariants(input: string): string[] {
  const variants = [input];
  if (input.includes('ё') || input.includes('Ё')) {
    variants.push(input.replace(/ё/g, 'е').replace(/Ё/g, 'Е'));
  }
  if (input.includes('е') || input.includes('Е')) {
    variants.push(input.replace(/е/g, 'ё').replace(/Е/g, 'Ё'));
  }
  return variants;
}

describe('buildYoVariants — single direction', () => {
  test('input has ё → adds е variant', () => {
    const v = buildYoVariants('жим лёжа');
    expect(v).toContain('жим лёжа');
    expect(v).toContain('жим лежа');
  });

  test('input has е → adds ё variant', () => {
    const v = buildYoVariants('жим лежа');
    expect(v).toContain('жим лежа');
    expect(v).toContain('жим лёжа');
  });

  test('input has Ё (uppercase) → adds Е variant', () => {
    const v = buildYoVariants('Ёлка');
    expect(v).toContain('Ёлка');
    expect(v).toContain('Елка');
  });

  test('input has Е (uppercase) → adds Ё variant', () => {
    const v = buildYoVariants('Ель');
    expect(v).toContain('Ель');
    expect(v).toContain('Ёль');
  });
});

// ─── Both directions when both letters present ──────────────────────────────

describe('buildYoVariants — mixed', () => {
  test('input has both ё and е → 3 variants total', () => {
    // "ёе" → ['ёе', 'ее', 'ёё'] (ё→е replaces only ё; е→ё replaces only е)
    const v = buildYoVariants('ёе');
    expect(v.length).toBe(3);
    expect(v).toContain('ёе');
    expect(v).toContain('ее');
    expect(v).toContain('ёё');
  });
});

// ─── No variants when no Russian e/yo present ───────────────────────────────

describe('buildYoVariants — no e/yo letters', () => {
  test('English input → just original', () => {
    expect(buildYoVariants('bench press')).toEqual(['bench press']);
  });

  test('Russian without ё but with е → adds ё variant (over-generation OK)', () => {
    // "приседания" contains "е" so we generate "присёдания" too. That's
    // not a real word, but DB row matching filters out false positives.
    // Documenting the over-generation pattern.
    const v = buildYoVariants('приседания');
    expect(v).toContain('приседания');
    expect(v.length).toBe(2);
  });

  test('Russian with no е/ё at all → just original', () => {
    // Hard test: word with no Cyrillic e/yo letters at all
    expect(buildYoVariants('становая тяга')).toEqual(['становая тяга']);
  });

  test('digits and punctuation → just original', () => {
    expect(buildYoVariants('100kg×10')).toEqual(['100kg×10']);
  });
});

// ─── Real-world exercise names ──────────────────────────────────────────────

describe('buildYoVariants — exercise names', () => {
  test('"Жим штанги лёжа" → variant matches "жим штанги лежа"', () => {
    const v = buildYoVariants('Жим штанги лёжа');
    expect(v).toContain('Жим штанги лежа');
  });

  test('"приседания со штангой на плечах" → over-generates plöchakh variant (harmless)', () => {
    // "приседания" has е, "плечах" has е. e→ё creates "присёдания со
    // штангой на плёчах" — not a real word, but harmless because DB
    // rows must contain the variant for a match. Documenting the
    // over-generation pattern: false positives in variant generation
    // don't harm; false negatives (missing variant) DO harm.
    const v = buildYoVariants('приседания со штангой на плечах');
    expect(v).toContain('приседания со штангой на плечах');
    expect(v.length).toBe(2);
  });

  test('"Подъём на бицепс" → adds "Подъем на бицепс"', () => {
    const v = buildYoVariants('Подъём на бицепс');
    expect(v).toContain('Подъем на бицепс');
  });

  test('"Тяга в наклоне" → also tries "Тяга в наклонё"', () => {
    // Both е→ё variants are tried even if some are nonsense — DB
    // matching filters them out.
    const v = buildYoVariants('Тяга в наклоне');
    expect(v).toContain('Тяга в наклонё');
  });
});

// ─── Empty / boundary ─────────────────────────────────────────────────────

describe('buildYoVariants — empty input', () => {
  test('empty string → just empty', () => {
    expect(buildYoVariants('')).toEqual(['']);
  });

  test('single character ё', () => {
    const v = buildYoVariants('ё');
    expect(v).toContain('ё');
    expect(v).toContain('е');
  });
});
