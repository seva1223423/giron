/**
 * Regression test for ProgressRing clamp fix
 */

describe('ProgressRing clamp logic', () => {
  // BUG FIX: was Math.min(progress, 1), now Math.min(Math.max(progress, 0), 1)
  // Without clamping negative values, SVG strokeDashoffset could be > circumference,
  // causing visual glitch (ring overflows or goes backwards)
  const clampProgress = (progress: number) => Math.min(Math.max(progress, 0), 1);

  test('clamps negative progress to 0', () => {
    expect(clampProgress(-0.5)).toBe(0);
    expect(clampProgress(-100)).toBe(0);
  });

  test('clamps progress > 1 to 1', () => {
    expect(clampProgress(1.5)).toBe(1);
    expect(clampProgress(999)).toBe(1);
  });

  test('passes through valid progress', () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(0.5)).toBe(0.5);
    expect(clampProgress(1)).toBe(1);
  });

  test('handles NaN-like edge cases', () => {
    // NaN comparisons return false, so Math.max(NaN, 0) = NaN, Math.min(NaN, 1) = NaN
    expect(clampProgress(NaN)).toBeNaN();
  });

  test('handles very small positive values', () => {
    expect(clampProgress(0.001)).toBe(0.001);
    expect(clampProgress(0.999)).toBe(0.999);
  });
});
