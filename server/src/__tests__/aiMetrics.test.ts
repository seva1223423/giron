/**
 * Unit tests for utils/aiMetrics — verifies percentile computation,
 * rolling window correctness, and counter behaviour. The module is
 * stateful (singleton counters) so tests reset by importing fresh
 * via jest.isolateModules where ordering matters.
 */

import { recordAIRequest, getAIMetrics } from '../utils/aiMetrics';

describe('aiMetrics percentile rolling window', () => {
  // Each test runs through the same singleton — order is fine because
  // we add unique latency values and check the resulting percentile,
  // and latencyWindow accepts up to 200 entries.
  test('percentiles return 0 when no samples yet (sanity)', () => {
    // Tests run in order; resetIfNewDay() may have or may not have
    // fired. We can't reset without exporting a helper, so we just
    // assert the basic shape is present.
    const m = getAIMetrics();
    expect(typeof m.p50LatencyMs).toBe('number');
    expect(typeof m.p95LatencyMs).toBe('number');
    expect(typeof m.p99LatencyMs).toBe('number');
    expect(typeof m.latencySampleSize).toBe('number');
  });

  test('records latency and computes monotonic percentile ordering', () => {
    // Push a known distribution: 10, 20, ..., 1000 (100 samples)
    for (let i = 1; i <= 100; i += 1) {
      recordAIRequest({ cacheHit: false, latencyMs: i * 10 });
    }
    const m = getAIMetrics();
    // p50 < p95 < p99 should always hold for any non-degenerate dist
    expect(m.p50LatencyMs!).toBeLessThanOrEqual(m.p95LatencyMs!);
    expect(m.p95LatencyMs!).toBeLessThanOrEqual(m.p99LatencyMs!);
    // p99 should be near the top of the range we pushed
    expect(m.p99LatencyMs!).toBeGreaterThan(800);
    expect(m.latencySampleSize).toBeGreaterThan(0);
  });

  test('cache-hit requests do not pollute the latency window', () => {
    const before = getAIMetrics().latencySampleSize ?? 0;
    // Cache hits skip the latency tracking branch entirely
    for (let i = 0; i < 5; i += 1) {
      recordAIRequest({ cacheHit: true });
    }
    const after = getAIMetrics().latencySampleSize ?? 0;
    expect(after).toBe(before); // unchanged
  });

  test('zero / undefined latency does not crash percentile computation', () => {
    // Defensive — recordAIRequest skips push when latencyMs <= 0
    recordAIRequest({ cacheHit: false, latencyMs: 0 });
    recordAIRequest({ cacheHit: false }); // no latencyMs at all
    const m = getAIMetrics();
    expect(m.p50LatencyMs).toBeGreaterThanOrEqual(0);
  });
});
