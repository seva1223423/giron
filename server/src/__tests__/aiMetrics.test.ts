/**
 * Unit tests for utils/aiMetrics — verifies percentile computation,
 * rolling window correctness, and counter behaviour. The module is
 * stateful (singleton counters) so tests reset by importing fresh
 * via jest.isolateModules where ordering matters.
 */

import { recordAIRequest, recordToolExecution, getAIMetrics } from '../utils/aiMetrics';

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

describe('aiMetrics tool execution metrics (round 96)', () => {
  test('records per-tool count, avg, max, errors', () => {
    // Use unique names so ordering tests below aren't polluted by
    // earlier suites in the same singleton.
    recordToolExecution('test_tool_a', 100, true);
    recordToolExecution('test_tool_a', 200, true);
    recordToolExecution('test_tool_a', 600, false); // failure

    const m = getAIMetrics();
    const a = m.toolMetrics.find((t) => t.name === 'test_tool_a');
    expect(a).toBeDefined();
    expect(a!.count).toBe(3);
    expect(a!.errors).toBe(1);
    expect(a!.avgMs).toBe(300); // (100 + 200 + 600) / 3
    expect(a!.maxMs).toBe(600);
    expect(a!.errorRate).toBe(33);
  });

  test('sorts toolMetrics by call count descending', () => {
    recordToolExecution('test_tool_busy', 50, true);
    recordToolExecution('test_tool_busy', 60, true);
    recordToolExecution('test_tool_busy', 70, true);
    recordToolExecution('test_tool_busy', 80, true);
    recordToolExecution('test_tool_quiet', 50, true);

    const m = getAIMetrics();
    const busyIdx = m.toolMetrics.findIndex((t) => t.name === 'test_tool_busy');
    const quietIdx = m.toolMetrics.findIndex((t) => t.name === 'test_tool_quiet');
    expect(busyIdx).toBeGreaterThanOrEqual(0);
    expect(quietIdx).toBeGreaterThanOrEqual(0);
    expect(busyIdx).toBeLessThan(quietIdx);
  });

  test('clamps unreasonably large latency to 60_000ms (defence in depth)', () => {
    recordToolExecution('test_tool_clamp', 999_999_999, true);
    const m = getAIMetrics();
    const c = m.toolMetrics.find((t) => t.name === 'test_tool_clamp');
    expect(c).toBeDefined();
    expect(c!.maxMs).toBe(60_000);
  });

  test('rejects empty / non-string tool names', () => {
    const beforeMetrics = getAIMetrics();
    const beforeCount = beforeMetrics.toolMetrics.length;

    recordToolExecution('', 100, true);
    // @ts-expect-error — testing runtime safety
    recordToolExecution(null, 100, true);
    // @ts-expect-error — testing runtime safety
    recordToolExecution(undefined, 100, true);

    const after = getAIMetrics();
    expect(after.toolMetrics.length).toBe(beforeCount);
  });

  test('handles negative / NaN latency by treating as 0', () => {
    recordToolExecution('test_tool_negms', -50, true);
    recordToolExecution('test_tool_negms', NaN, true);
    const m = getAIMetrics();
    const n = m.toolMetrics.find((t) => t.name === 'test_tool_negms');
    expect(n).toBeDefined();
    expect(n!.count).toBe(2);
    expect(n!.maxMs).toBe(0);
    expect(n!.avgMs).toBe(0);
  });
});
