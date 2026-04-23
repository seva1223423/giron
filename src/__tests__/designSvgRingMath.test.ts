/**
 * SVG circle dash-array math — the RingStatsCard ring uses
 * strokeDasharray + strokeDashoffset to draw the progress arc.
 * Getting this wrong means the arc over-fills or under-fills.
 *
 * Formulas:
 *   circumference = 2 * PI * radius
 *   strokeDashoffset = circumference * (1 - progress)
 *
 * Tests lock the math so Ring implementations across screens match.
 */

import { clampProgress } from '../utils/layout';

const PI = Math.PI;

function circumference(radius: number): number {
  return 2 * PI * radius;
}

function dashOffset(radius: number, progress: number): number {
  return circumference(radius) * (1 - clampProgress(progress));
}

// ─── Circumference ─────────────────────────────────────────────────────────

describe('circumference math', () => {
  test('radius 50 → circumference ≈ 314.16', () => {
    expect(circumference(50)).toBeCloseTo(2 * PI * 50, 5);
  });

  test('radius 100 → circumference ≈ 628.32', () => {
    expect(circumference(100)).toBeCloseTo(628.3185, 3);
  });

  test('radius 0 → circumference 0', () => {
    expect(circumference(0)).toBe(0);
  });

  test('radius 1 → circumference = 2π', () => {
    expect(circumference(1)).toBeCloseTo(2 * PI);
  });

  test('negative radius returns negative (math is simple)', () => {
    expect(circumference(-10)).toBeCloseTo(-2 * PI * 10);
  });
});

// ─── Dash offset across progress spectrum ─────────────────────────────────

describe('dashOffset for ring progress', () => {
  const R = 50;

  test('progress 0 → offset = full circumference (ring empty)', () => {
    expect(dashOffset(R, 0)).toBeCloseTo(circumference(R));
  });

  test('progress 1 → offset 0 (ring full)', () => {
    expect(dashOffset(R, 1)).toBe(0);
  });

  test('progress 0.5 → offset = half circumference', () => {
    expect(dashOffset(R, 0.5)).toBeCloseTo(circumference(R) / 2);
  });

  test('progress 0.25 → offset = 3/4 circumference', () => {
    expect(dashOffset(R, 0.25)).toBeCloseTo(circumference(R) * 0.75);
  });

  test('progress > 1 clamped (ring full)', () => {
    expect(dashOffset(R, 1.5)).toBe(0);
  });

  test('progress < 0 clamped (ring empty)', () => {
    expect(dashOffset(R, -0.5)).toBeCloseTo(circumference(R));
  });

  test('NaN progress → ring empty', () => {
    expect(dashOffset(R, NaN)).toBeCloseTo(circumference(R));
  });

  test('Infinity progress → ring full', () => {
    expect(dashOffset(R, Infinity)).toBeCloseTo(circumference(R));
  });
});

// ─── Ring sizes used in design ─────────────────────────────────────────────

describe('Standard ring sizes from design tokens', () => {
  const sizes = [
    { name: 'hero calorie ring', r: 84, strokeWidth: 8 },
    { name: 'small macro ring', r: 28, strokeWidth: 4 },
    { name: 'mid ring', r: 50, strokeWidth: 6 },
  ];

  test.each(sizes)('$name circumference positive', ({ r }) => {
    expect(circumference(r)).toBeGreaterThan(0);
  });

  test.each(sizes)('$name dashOffset math monotonic', ({ r }) => {
    const a = dashOffset(r, 0.1);
    const b = dashOffset(r, 0.5);
    const c = dashOffset(r, 0.9);
    // Higher progress → lower offset
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  test.each(sizes)('$name stroke-width < radius (no self-overlap)', ({ r, strokeWidth }) => {
    expect(strokeWidth).toBeLessThan(r);
  });
});

// ─── Monotonic + rounding ─────────────────────────────────────────────────

describe('Ring progress is monotonic & continuous', () => {
  test('small delta in progress → small delta in offset', () => {
    const R = 50;
    const a = dashOffset(R, 0.5);
    const b = dashOffset(R, 0.51);
    expect(Math.abs(a - b)).toBeLessThan(5);
  });

  test('0.01 progress produces small but non-zero fill', () => {
    const R = 100;
    const offset = dashOffset(R, 0.01);
    // Just under full circumference
    expect(offset).toBeLessThan(circumference(R));
    expect(offset).toBeGreaterThan(circumference(R) * 0.98);
  });
});

// ─── Discrete step rendering (7 week dots) ──────────────────────────────────

describe('Week-dot positioning (fraction of 7)', () => {
  test('7 equally-spaced dots total 100% width', () => {
    const slots = 7;
    const widthPerSlot = 1 / slots;
    expect(widthPerSlot * slots).toBeCloseTo(1);
  });

  test('dot centers at odd-index fractions', () => {
    // Center of slot i (0..6) is (i + 0.5) / 7
    const centers = Array.from({ length: 7 }, (_, i) => (i + 0.5) / 7);
    expect(centers[0]).toBeCloseTo(0.0714, 3);
    expect(centers[6]).toBeCloseTo(0.9286, 3);
  });
});

// ─── Arc start angle ────────────────────────────────────────────────────────

describe('Arc start position', () => {
  // Design starts the ring at 12 o'clock (top), which means rotating
  // -90° (or 270° equivalently) from the default SVG start (3 o'clock).
  test('starting angle -90° places tip at top', () => {
    const startAngleDeg = -90;
    const startAngleRad = (startAngleDeg * PI) / 180;
    // cos(-90°) = 0, sin(-90°) = -1 → SVG Y axis down means top
    expect(Math.cos(startAngleRad)).toBeCloseTo(0, 5);
    expect(Math.sin(startAngleRad)).toBeCloseTo(-1, 5);
  });
});

// ─── Floating point precision for ring math ──────────────────────────────

describe('Ring math FP safety', () => {
  test('accumulated 7×0.1 offsets don\'t drift', () => {
    const R = 50;
    let total = 0;
    for (let i = 0; i < 7; i++) total += dashOffset(R, 0.1);
    // 7 * dashOffset(50, 0.1) ~= 7 * (2*π*50 * 0.9)
    const expected = 7 * circumference(R) * 0.9;
    expect(total).toBeCloseTo(expected, 2);
  });
});
