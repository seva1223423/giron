/**
 * Round 196 — weight projection sanity tests.
 *
 * computeWeightTrend + validateWeightClaim are the core of
 * grounding AI's weight statements in user data. These tests
 * verify edge cases (no data, single sample, all-equal, sign
 * mismatch, divergence threshold).
 */

import {
  computeWeightTrend,
  validateWeightClaim,
  formatTrendForPrompt,
  type WeightSample,
} from '../ai/weightProjection';

const sample = (date: string, weightKg: number): WeightSample => ({ date, weightKg });

// ─── computeWeightTrend ─────────────────────────────────────────────────────

describe('computeWeightTrend — insufficient data', () => {
  test('empty array → insufficient_data', () => {
    expect(computeWeightTrend([]).trend).toBe('insufficient_data');
  });

  test('1 sample → insufficient_data', () => {
    expect(computeWeightTrend([sample('2024-05-01', 80)]).trend).toBe('insufficient_data');
  });

  test('3 samples (less than 4) → insufficient_data', () => {
    expect(
      computeWeightTrend([
        sample('2024-05-01', 80),
        sample('2024-05-04', 79.8),
        sample('2024-05-08', 79.5),
      ]).trend,
    ).toBe('insufficient_data');
  });

  test('4 samples within 6 days → insufficient_data (need ≥7 days)', () => {
    expect(
      computeWeightTrend([
        sample('2024-05-01', 80),
        sample('2024-05-02', 80.1),
        sample('2024-05-04', 79.9),
        sample('2024-05-06', 79.8),
      ]).trend,
    ).toBe('insufficient_data');
  });

  test('all-NaN/garbage filtered out — leaves 0 valid → insufficient', () => {
    expect(
      computeWeightTrend([
        sample('2024-05-01', NaN),
        sample('2024-05-02', 0),
        sample('2024-05-03', -5),
        sample('2024-05-04', 1000),
      ]).trend,
    ).toBe('insufficient_data');
  });
});

describe('computeWeightTrend — stable', () => {
  test('all-equal weights → stable, weeklyDelta ~ 0', () => {
    const r = computeWeightTrend([
      sample('2024-05-01', 80),
      sample('2024-05-04', 80),
      sample('2024-05-08', 80),
      sample('2024-05-12', 80),
      sample('2024-05-15', 80),
    ]);
    expect(r.trend).toBe('stable');
    expect(Math.abs(r.weeklyDeltaKg)).toBeLessThan(0.15);
  });

  test('tiny noise (<0.15 kg/wk) → stable', () => {
    const r = computeWeightTrend([
      sample('2024-05-01', 80.0),
      sample('2024-05-04', 80.1),
      sample('2024-05-08', 79.9),
      sample('2024-05-12', 80.0),
      sample('2024-05-15', 80.05),
    ]);
    expect(r.trend).toBe('stable');
  });
});

describe('computeWeightTrend — gain', () => {
  test('clear weight gain → trend=gain, positive weekly', () => {
    const r = computeWeightTrend([
      sample('2024-05-01', 80.0),
      sample('2024-05-04', 80.4),
      sample('2024-05-08', 80.8),
      sample('2024-05-12', 81.2),
      sample('2024-05-15', 81.5),
    ]);
    expect(r.trend).toBe('gain');
    expect(r.weeklyDeltaKg).toBeGreaterThan(0.5);
    expect(r.totalDeltaKg).toBeCloseTo(1.5, 1);
    expect(r.sampleCount).toBe(5);
    expect(r.daysSpan).toBe(14);
  });
});

describe('computeWeightTrend — loss', () => {
  test('clear weight loss → trend=loss, negative weekly', () => {
    const r = computeWeightTrend([
      sample('2024-05-01', 85.0),
      sample('2024-05-04', 84.5),
      sample('2024-05-08', 84.0),
      sample('2024-05-12', 83.5),
      sample('2024-05-15', 83.0),
    ]);
    expect(r.trend).toBe('loss');
    expect(r.weeklyDeltaKg).toBeLessThan(-0.5);
    expect(r.totalDeltaKg).toBeCloseTo(-2.0, 1);
  });
});

describe('computeWeightTrend — least-squares stability', () => {
  test('outlier in middle does not flip the trend', () => {
    const r = computeWeightTrend([
      sample('2024-05-01', 85.0),
      sample('2024-05-04', 84.5),
      sample('2024-05-08', 86.0), // outlier (water retention?)
      sample('2024-05-12', 84.0),
      sample('2024-05-15', 83.5),
    ]);
    // Net trend is loss — least-squares should still pick that up
    expect(r.trend).toBe('loss');
  });

  test('handles unsorted input', () => {
    const r = computeWeightTrend([
      sample('2024-05-15', 83.0),
      sample('2024-05-01', 85.0),
      sample('2024-05-08', 84.0),
      sample('2024-05-04', 84.5),
      sample('2024-05-12', 83.5),
    ]);
    expect(r.trend).toBe('loss');
    expect(r.daysSpan).toBe(14);
  });
});

// ─── validateWeightClaim ────────────────────────────────────────────────────

describe('validateWeightClaim — happy path', () => {
  test('no claim to validate → ok', () => {
    const trend = computeWeightTrend([]);
    expect(validateWeightClaim(undefined, trend)).toEqual({ ok: true });
    expect(validateWeightClaim(null as any, trend)).toEqual({ ok: true });
    expect(validateWeightClaim(NaN, trend)).toEqual({ ok: true });
  });

  test('insufficient data → no_data flag', () => {
    const trend = computeWeightTrend([sample('2024-05-01', 80)]);
    expect(validateWeightClaim(-0.5, trend)).toEqual({ ok: 'no_data' });
  });

  test('claim within ±50% of actual → ok', () => {
    const trend = computeWeightTrend([
      sample('2024-05-01', 85),
      sample('2024-05-04', 84.5),
      sample('2024-05-08', 84),
      sample('2024-05-12', 83.5),
      sample('2024-05-15', 83),
    ]);
    // Actual loss ~ -1 kg/week; claim of -0.7 within tolerance
    expect(validateWeightClaim(-0.7, trend)).toEqual({ ok: true });
    expect(validateWeightClaim(-1.0, trend)).toEqual({ ok: true });
    expect(validateWeightClaim(-1.3, trend)).toEqual({ ok: true });
  });
});

describe('validateWeightClaim — divergence detection', () => {
  test('claim 0.5 when actual is 0.05 (10x off) → reject', () => {
    const trend = computeWeightTrend([
      sample('2024-05-01', 80),
      sample('2024-05-04', 80.01),
      sample('2024-05-08', 80.02),
      sample('2024-05-12', 80.03),
      sample('2024-05-15', 80.04),
    ]);
    const r = validateWeightClaim(0.5, trend);
    if (r.ok !== false) throw new Error('expected rejection');
    expect(r.reason).toMatch(/расхождение/);
  });

  test('claim 2 when actual is -0.5 (sign mismatch) → reject', () => {
    const trend = computeWeightTrend([
      sample('2024-05-01', 85),
      sample('2024-05-04', 84.7),
      sample('2024-05-08', 84.5),
      sample('2024-05-12', 84.3),
      sample('2024-05-15', 84),
    ]);
    const r = validateWeightClaim(2, trend);
    if (r.ok !== false) throw new Error('expected rejection');
    expect(r.reason).toMatch(/направление противоположное/);
  });

  test('claim -1 when actual is +1 → sign mismatch reject', () => {
    const trend = computeWeightTrend([
      sample('2024-05-01', 80),
      sample('2024-05-04', 80.4),
      sample('2024-05-08', 80.8),
      sample('2024-05-12', 81.2),
      sample('2024-05-15', 81.5),
    ]);
    const r = validateWeightClaim(-1, trend);
    if (r.ok !== false) throw new Error('expected rejection');
    expect(r.reason).toMatch(/набор|потер/);
  });
});

// ─── formatTrendForPrompt ───────────────────────────────────────────────────

describe('formatTrendForPrompt', () => {
  test('insufficient_data → empty string', () => {
    expect(formatTrendForPrompt(computeWeightTrend([]))).toBe('');
  });

  test('loss → contains "потеря" and weekly value', () => {
    const trend = computeWeightTrend([
      sample('2024-05-01', 85),
      sample('2024-05-04', 84.5),
      sample('2024-05-08', 84),
      sample('2024-05-12', 83.5),
      sample('2024-05-15', 83),
    ]);
    const out = formatTrendForPrompt(trend);
    expect(out).toMatch(/потеря/);
    expect(out).toMatch(/кг\/нед/);
  });

  test('gain → contains "набор"', () => {
    const trend = computeWeightTrend([
      sample('2024-05-01', 80),
      sample('2024-05-04', 80.5),
      sample('2024-05-08', 81),
      sample('2024-05-12', 81.5),
      sample('2024-05-15', 82),
    ]);
    expect(formatTrendForPrompt(trend)).toMatch(/набор/);
  });

  test('stable → contains "стабильно"', () => {
    const trend = computeWeightTrend([
      sample('2024-05-01', 80),
      sample('2024-05-04', 80.05),
      sample('2024-05-08', 79.95),
      sample('2024-05-12', 80),
      sample('2024-05-15', 80),
    ]);
    expect(formatTrendForPrompt(trend)).toMatch(/стабильно/);
  });

  test('contains instruction telling AI to use this number, not invent', () => {
    const trend = computeWeightTrend([
      sample('2024-05-01', 85),
      sample('2024-05-04', 84.5),
      sample('2024-05-08', 84),
      sample('2024-05-12', 83.5),
      sample('2024-05-15', 83),
    ]);
    expect(formatTrendForPrompt(trend)).toMatch(/не выдумывай|на эту цифру/i);
  });
});

// ─── Integration scenarios ──────────────────────────────────────────────────

describe('Integration: AI hallucination prevention scenarios', () => {
  test('user lost 0 kg, AI says "теряешь 0.5 кг/нед" → caught', () => {
    const trend = computeWeightTrend([
      sample('2024-05-01', 80),
      sample('2024-05-04', 80),
      sample('2024-05-08', 80),
      sample('2024-05-12', 80),
      sample('2024-05-15', 80),
    ]);
    const claim = validateWeightClaim(-0.5, trend);
    expect(claim).not.toEqual({ ok: true });
  });

  test('user GAINING during cut, AI assumes loss → caught', () => {
    const trend = computeWeightTrend([
      sample('2024-05-01', 80),
      sample('2024-05-04', 80.3),
      sample('2024-05-08', 80.6),
      sample('2024-05-12', 80.9),
      sample('2024-05-15', 81.0),
    ]);
    const claim = validateWeightClaim(-0.5, trend);
    if (claim.ok !== false) throw new Error('expected sign-mismatch reject');
  });

  test('user has only 1 weight, AI claims projection → handled', () => {
    const trend = computeWeightTrend([sample('2024-05-15', 80)]);
    const claim = validateWeightClaim(-0.5, trend);
    expect(claim).toEqual({ ok: 'no_data' });
  });
});
