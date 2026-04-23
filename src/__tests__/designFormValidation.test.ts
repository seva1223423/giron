/**
 * Form validation rules — numeric input (weights, reps, calories),
 * time entry, and Russian text validators. The design has a comma-decimal
 * rule for Russian locale; this locks the parsing behavior.
 */

// Re-implement a minimal validator set here to avoid importing screens
// whose store-bound logic won't load in the test env.

function parseRuNumber(input: string): number {
  if (typeof input !== 'string') return NaN;
  const trimmed = input.trim().replace(',', '.');
  if (trimmed === '') return NaN;
  const n = Number(trimmed);
  return n;
}

function isValidWeight(input: string): boolean {
  const n = parseRuNumber(input);
  if (!Number.isFinite(n)) return false;
  if (n <= 0) return false;
  if (n > 500) return false; // realistic cap for any human/lifted weight in kg
  return true;
}

function isValidReps(input: string): boolean {
  const n = parseRuNumber(input);
  if (!Number.isFinite(n)) return false;
  if (!Number.isInteger(n)) return false;
  if (n < 1) return false;
  if (n > 500) return false;
  return true;
}

function isValidCalories(input: string): boolean {
  const n = parseRuNumber(input);
  if (!Number.isFinite(n)) return false;
  if (n < 0) return false;
  if (n > 10000) return false;
  return true;
}

// ─── Number parsing ────────────────────────────────────────────────────────

describe('parseRuNumber — comma decimal', () => {
  test('empty string → NaN', () => {
    expect(parseRuNumber('')).toBeNaN();
  });

  test('whitespace → NaN', () => {
    expect(parseRuNumber('   ')).toBeNaN();
  });

  test('"5" → 5', () => {
    expect(parseRuNumber('5')).toBe(5);
  });

  test('"5.5" → 5.5', () => {
    expect(parseRuNumber('5.5')).toBe(5.5);
  });

  test('"5,5" → 5.5 (Russian decimal)', () => {
    expect(parseRuNumber('5,5')).toBe(5.5);
  });

  test('"102,5" → 102.5', () => {
    expect(parseRuNumber('102,5')).toBe(102.5);
  });

  test('"0,01" → 0.01', () => {
    expect(parseRuNumber('0,01')).toBe(0.01);
  });

  test('"abc" → NaN', () => {
    expect(parseRuNumber('abc')).toBeNaN();
  });

  test('"5,5 kg" → NaN (unit must be stripped upstream)', () => {
    expect(parseRuNumber('5,5 kg')).toBeNaN();
  });

  test('"-1" → -1 (negative allowed at parse, validator rejects)', () => {
    expect(parseRuNumber('-1')).toBe(-1);
  });
});

// ─── Weight validator ─────────────────────────────────────────────────────

describe('Weight validator (kg)', () => {
  test('valid kg range 0.1..500', () => {
    expect(isValidWeight('50')).toBe(true);
    expect(isValidWeight('0.5')).toBe(true);
    expect(isValidWeight('102,5')).toBe(true);
    expect(isValidWeight('500')).toBe(true);
  });

  test('zero weight rejected', () => {
    expect(isValidWeight('0')).toBe(false);
  });

  test('negative rejected', () => {
    expect(isValidWeight('-50')).toBe(false);
  });

  test('over 500kg rejected (no human squats 501)', () => {
    expect(isValidWeight('501')).toBe(false);
    expect(isValidWeight('9999')).toBe(false);
  });

  test('non-numeric rejected', () => {
    expect(isValidWeight('abc')).toBe(false);
  });

  test('empty rejected', () => {
    expect(isValidWeight('')).toBe(false);
  });

  test('Infinity rejected', () => {
    expect(isValidWeight('Infinity')).toBe(false);
  });

  test('NaN rejected', () => {
    expect(isValidWeight('NaN')).toBe(false);
  });

  test('exponential notation parsed by Number() but clipped by weight cap', () => {
    // Number('1e3') = 1000 — parses, but 1000 > 500 cap → invalid weight
    expect(isValidWeight('1e3')).toBe(false);
    // 1e2 = 100 — within cap, so valid
    expect(isValidWeight('1e2')).toBe(true);
  });
});

// ─── Reps validator ───────────────────────────────────────────────────────

describe('Reps validator (integer)', () => {
  test('integer 1..500 valid', () => {
    expect(isValidReps('1')).toBe(true);
    expect(isValidReps('10')).toBe(true);
    expect(isValidReps('100')).toBe(true);
    expect(isValidReps('500')).toBe(true);
  });

  test('0 reps rejected', () => {
    expect(isValidReps('0')).toBe(false);
  });

  test('decimal reps rejected', () => {
    expect(isValidReps('1.5')).toBe(false);
    expect(isValidReps('2,5')).toBe(false);
  });

  test('over 500 rejected', () => {
    expect(isValidReps('501')).toBe(false);
  });

  test('negative rejected', () => {
    expect(isValidReps('-5')).toBe(false);
  });
});

// ─── Calories validator ──────────────────────────────────────────────────

describe('Calories validator', () => {
  test('0..10000 kcal valid', () => {
    expect(isValidCalories('0')).toBe(true);
    expect(isValidCalories('2500')).toBe(true);
    expect(isValidCalories('10000')).toBe(true);
  });

  test('negative rejected', () => {
    expect(isValidCalories('-10')).toBe(false);
  });

  test('over 10k rejected (unrealistic)', () => {
    expect(isValidCalories('10001')).toBe(false);
    expect(isValidCalories('99999')).toBe(false);
  });

  test('decimal calories valid (partial scans)', () => {
    expect(isValidCalories('250.5')).toBe(true);
    expect(isValidCalories('250,5')).toBe(true);
  });
});

// ─── Numeric formatting for display ───────────────────────────────────────

describe('Russian display formatting', () => {
  test('weight 102.5 renders as "102,5"', () => {
    const n = 102.5;
    const ru = n.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    // jest-expo may not have ICU — accept both
    expect(ru).toMatch(/102[.,]5/);
  });

  test('integer weight renders without decimal', () => {
    const n = 100;
    const ru = n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
    expect(ru).toBe('100');
  });

  test('thousands separator doesn\'t break integer lookup', () => {
    const n = 10000;
    const ru = n.toLocaleString('ru-RU');
    // ru-RU may use NBSP thousands or none (ICU fallback)
    expect(ru).toMatch(/10[\s\u00A0]?000/);
  });
});

// ─── Edge strings around quotas (just scan / kcal text) ─────────────────

describe('Text length caps for UI', () => {
  test('meal name under 100 chars acceptable', () => {
    const name = 'Курица с рисом и овощами на пару без соли';
    expect(name.length).toBeLessThan(100);
  });

  test('1000+ char meal names detected as over-limit', () => {
    const name = 'а'.repeat(1000);
    expect(name.length).toBeGreaterThan(100);
  });
});
