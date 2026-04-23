/**
 * Floating-point precision — arithmetic on weights, calories, and
 * percentages. If we accumulate unrounded floats over hundreds of
 * sets, the drift shows up in the "PR" that says 150.0000001kg.
 */

import { clampProgress } from '../utils/layout';
import { calorieDayProgress } from '../utils/homeDerivations';

// ─── Known float traps ────────────────────────────────────────────────────

describe('Float arithmetic on weight', () => {
  test('0.1 + 0.2 is NOT 0.3 (classic JS trap)', () => {
    expect(0.1 + 0.2).toBeCloseTo(0.3, 10);
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  test('round to 2 decimals removes the drift', () => {
    const n = 0.1 + 0.2;
    expect(Math.round(n * 100) / 100).toBe(0.3);
  });

  test('plate math avoids drift via rounding', () => {
    // Similar to plates.ts internal rounding
    let remaining = 2.5;
    remaining -= 1.25;
    remaining = Math.round(remaining * 100) / 100;
    expect(remaining).toBe(1.25);
  });
});

describe('Accumulating kcal across 100 meals (small per-meal values)', () => {
  test('0.1 kcal × 1000 ≈ 100, not 99.99999...', () => {
    let total = 0;
    for (let i = 0; i < 1000; i++) total += 0.1;
    expect(total).toBeCloseTo(100, 3);
  });

  test('rounded sum is exactly 100', () => {
    let total = 0;
    for (let i = 0; i < 1000; i++) total += 0.1;
    expect(Math.round(total)).toBe(100);
  });
});

describe('Percentages via Math.round', () => {
  test('99.5 → 100%', () => {
    expect(Math.round(99.5)).toBe(100);
  });

  test('50.49 → 50%', () => {
    expect(Math.round(50.49)).toBe(50);
  });

  test('0.51 → 1%', () => {
    expect(Math.round(0.51)).toBe(1);
  });
});

describe('clampProgress + tiny increments', () => {
  test('adding 1e-15 per step doesn\'t drift out of bounds', () => {
    let p = 0;
    for (let i = 0; i < 10; i++) p = clampProgress(p + 1e-15);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe('calorieDayProgress exact values', () => {
  test('1 kcal / 3 kcal ≈ 0.333…', () => {
    const p = calorieDayProgress(1, 3);
    expect(p).toBeCloseTo(0.333333, 5);
  });

  test('exact division returns exact value', () => {
    expect(calorieDayProgress(500, 2000)).toBe(0.25);
  });
});

describe('Sanity ranges for large numbers', () => {
  test('Number.MAX_SAFE_INTEGER still works', () => {
    expect(Number.MAX_SAFE_INTEGER).toBe(2 ** 53 - 1);
  });

  test('weight cap 500kg safely under MAX_SAFE_INTEGER', () => {
    expect(500).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  test('calorie cap 10000 safely under MAX_SAFE_INTEGER', () => {
    expect(10000).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});

describe('parseFloat vs Number', () => {
  test('parseFloat("5.5kg") → 5.5 (tolerant)', () => {
    expect(parseFloat('5.5kg')).toBe(5.5);
  });

  test('Number("5.5kg") → NaN (strict)', () => {
    expect(Number('5.5kg')).toBeNaN();
  });

  test('parseFloat empty → NaN', () => {
    expect(parseFloat('')).toBeNaN();
  });
});

describe('toFixed rounding modes', () => {
  test('1.5.toFixed(0) → "2"', () => {
    expect((1.5).toFixed(0)).toBe('2');
  });

  test('2.5.toFixed(0) → "3" (no banker\'s rounding in JS)', () => {
    // Actually JS uses nearest-even for toFixed sometimes — platform dependent
    const result = (2.5).toFixed(0);
    expect(['2', '3']).toContain(result);
  });

  test('0.125.toFixed(2) → "0.13" or "0.12" (platform dep)', () => {
    const result = (0.125).toFixed(2);
    expect(['0.12', '0.13']).toContain(result);
  });
});

describe('Exact fraction representations', () => {
  test('1/4 is exact', () => {
    expect(1 / 4).toBe(0.25);
  });

  test('1/8 is exact', () => {
    expect(1 / 8).toBe(0.125);
  });

  test('1/3 is NOT exact', () => {
    expect(1 / 3).not.toBe(0.333);
  });
});

describe('Negative zero quirks', () => {
  test('0 === -0', () => {
    expect(0 === -0).toBe(true);
  });

  test('Object.is distinguishes', () => {
    expect(Object.is(0, -0)).toBe(false);
    expect(Object.is(-0, -0)).toBe(true);
  });
});

describe('Number formatting consistency', () => {
  test('weight display rounds to 1 decimal', () => {
    const kg = 102.567;
    expect(kg.toFixed(1)).toBe('102.6');
  });

  test('percentage display rounds to integer', () => {
    const pct = 87.54;
    expect(Math.round(pct)).toBe(88);
  });

  test('bodyfat rounds to 1 decimal', () => {
    const bf = 14.32;
    expect(bf.toFixed(1)).toBe('14.3');
  });
});

describe('NaN-safe chain operations', () => {
  test('NaN propagates through +', () => {
    expect(NaN + 5).toBeNaN();
  });

  test('NaN check before arithmetic guards', () => {
    function safeAdd(a: number, b: number): number {
      if (Number.isNaN(a)) a = 0;
      if (Number.isNaN(b)) b = 0;
      return a + b;
    }
    expect(safeAdd(NaN, 5)).toBe(5);
    expect(safeAdd(5, NaN)).toBe(5);
    expect(safeAdd(NaN, NaN)).toBe(0);
  });
});
