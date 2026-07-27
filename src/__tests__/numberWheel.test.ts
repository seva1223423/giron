/**
 * Wheel arithmetic.
 *
 * The wheel replaces every ± button pair in the app, so its maths has to be
 * exact: a drifting float would render "102.50000000000001" as a weight, and
 * a wrong index would open the sheet on the wrong number. Both helpers are
 * pure, so they are tested directly rather than through a rendered list.
 */

import { wheelOptions, wheelIndexOf, buildPresets } from '../utils/wheel';

describe('wheelOptions', () => {
  test('a 2.5 kg step stays exact across the whole range', () => {
    const opts = wheelOptions(0, 500, 2.5);
    // Accumulating += 2.5 drifts; deriving from the index does not.
    expect(opts).toContain(102.5);
    expect(opts).toContain(347.5);
    expect(opts.every((v) => Number.isFinite(v))).toBe(true);
    expect(opts.some((v) => String(v).length > 6)).toBe(false); // no 102.50000000000001
  });

  test('endpoints are included and ordered', () => {
    const opts = wheelOptions(0, 10, 2.5);
    expect(opts).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  test('integer step (reps) produces integers', () => {
    const opts = wheelOptions(1, 50, 1);
    expect(opts[0]).toBe(1);
    expect(opts[opts.length - 1]).toBe(50);
    expect(opts.every(Number.isInteger)).toBe(true);
  });

  test('a range that does not divide evenly stops below max, never above', () => {
    const opts = wheelOptions(0, 9, 2.5); // 0, 2.5, 5, 7.5 — 10 would exceed
    expect(opts[opts.length - 1]).toBe(7.5);
  });

  test('degenerate range still yields one option instead of crashing', () => {
    expect(wheelOptions(5, 5, 2.5)).toEqual([5]);
  });
});

describe('wheelIndexOf', () => {
  const count = wheelOptions(0, 500, 2.5).length;

  test('an on-grid value maps to its own index', () => {
    expect(wheelIndexOf(0, 0, 2.5, count)).toBe(0);
    expect(wheelIndexOf(100, 0, 2.5, count)).toBe(40);
  });

  test('an off-grid value snaps to the nearest option, not off the wheel', () => {
    // 103 is not a multiple of 2.5 — a set saved before the step changed.
    expect(wheelIndexOf(103, 0, 2.5, count)).toBe(41); // 102.5
    expect(wheelIndexOf(104, 0, 2.5, count)).toBe(42); // 105
  });

  test('values outside the range clamp to the ends', () => {
    expect(wheelIndexOf(-50, 0, 2.5, count)).toBe(0);
    expect(wheelIndexOf(9999, 0, 2.5, count)).toBe(count - 1);
  });

  test('junk input resolves to the first option instead of NaN', () => {
    expect(wheelIndexOf(Number.NaN, 0, 2.5, count)).toBe(0);
    expect(wheelIndexOf(Number.POSITIVE_INFINITY, 0, 2.5, count)).toBe(0);
  });
});

describe('buildPresets', () => {
  test('offers the values around the current one, one tap each', () => {
    expect(buildPresets(100, 2.5)).toEqual([95, 97.5, 100, 102.5, 105]);
  });

  test('never offers a value below the minimum', () => {
    // A 2.5 kg lift has no meaningful -5 kg neighbour.
    expect(buildPresets(2.5, 2.5, 0)).toEqual([0, 2.5, 5, 7.5]);
  });

  test('keeps reps whole', () => {
    expect(buildPresets(8, 1, 1)).toEqual([6, 7, 8, 9, 10]);
  });
});
