/**
 * Plate calculator edge cases — the greedy algorithm must produce
 * physically-loadable combinations for all realistic targets, and
 * handle float drift without returning 0.02kg fractional pieces.
 */

import { calculatePlates, totalLoadedWeight, PLATE_SIZES } from '../utils/plates';

describe('calculatePlates — standard targets', () => {
  test('target = barbell (no plates needed)', () => {
    const plates = calculatePlates(20, 20);
    expect(plates.size).toBe(0);
  });

  test('target < barbell (no plates, silent)', () => {
    const plates = calculatePlates(15, 20);
    expect(plates.size).toBe(0);
  });

  test('100kg target / 20kg bar → 40kg/side = 25+15', () => {
    const plates = calculatePlates(100, 20);
    expect(plates.get(25)).toBe(1);
    expect(plates.get(15)).toBe(1);
  });

  test('60kg / 20kg bar → 20kg/side = 1x20', () => {
    const plates = calculatePlates(60, 20);
    expect(plates.get(20)).toBe(1);
  });

  test('50kg / 20kg bar → 15/side = 15', () => {
    const plates = calculatePlates(50, 20);
    expect(plates.get(15)).toBe(1);
  });

  test('42.5kg / 20kg bar → 11.25/side = 10+1.25', () => {
    const plates = calculatePlates(42.5, 20);
    expect(plates.get(10)).toBe(1);
    expect(plates.get(1.25)).toBe(1);
  });

  test('140kg (heavy) / 20kg bar → 60/side = 25+25+10', () => {
    const plates = calculatePlates(140, 20);
    expect(plates.get(25)).toBe(2);
    expect(plates.get(10)).toBe(1);
  });

  test('220kg (very heavy) / 20kg bar → 100/side = 4x25', () => {
    const plates = calculatePlates(220, 20);
    expect(plates.get(25)).toBe(4);
  });
});

// ─── Drifting-float resistance ─────────────────────────────────────────────

describe('calculatePlates — float drift resistance', () => {
  test('30kg / 20kg → 5/side = 1x5 (no ghost 2.5+1.25+1.25)', () => {
    const plates = calculatePlates(30, 20);
    expect(plates.get(5)).toBe(1);
    expect(plates.get(2.5)).toBeUndefined();
  });

  test('22.5kg / 20kg → 1.25/side = 1x1.25', () => {
    const plates = calculatePlates(22.5, 20);
    expect(plates.get(1.25)).toBe(1);
  });

  test('27.5kg / 20kg → 3.75/side = 2.5+1.25', () => {
    const plates = calculatePlates(27.5, 20);
    expect(plates.get(2.5)).toBe(1);
    expect(plates.get(1.25)).toBe(1);
  });

  test('65kg / 20kg → 22.5/side = 20+2.5', () => {
    const plates = calculatePlates(65, 20);
    expect(plates.get(20)).toBe(1);
    expect(plates.get(2.5)).toBe(1);
  });

  test('120kg / 20kg → 50/side = 25+25', () => {
    const plates = calculatePlates(120, 20);
    expect(plates.get(25)).toBe(2);
  });
});

// ─── Women\'s bar (15kg) ──────────────────────────────────────────────────

describe('Women\'s bar 15kg', () => {
  test('45kg / 15kg → 15/side', () => {
    const plates = calculatePlates(45, 15);
    expect(plates.get(15)).toBe(1);
  });

  test('75kg / 15kg → 30/side = 25+5', () => {
    const plates = calculatePlates(75, 15);
    expect(plates.get(25)).toBe(1);
    expect(plates.get(5)).toBe(1);
  });
});

// ─── Edge: tiny bar for kettlebell / fixed ─────────────────────────────

describe('Light bar variations', () => {
  test('10kg bar target 30kg → 10/side', () => {
    const plates = calculatePlates(30, 10);
    expect(plates.get(10)).toBe(1);
  });
});

// ─── Round-trip to totalLoadedWeight ──────────────────────────────────────

describe('calculatePlates round-trips via totalLoadedWeight', () => {
  const cases = [60, 80, 100, 120, 140, 160, 180, 200];

  test.each(cases)('target %dkg round-trips exactly', (target) => {
    const bar = 20;
    const plates = calculatePlates(target, bar);
    expect(totalLoadedWeight(plates, bar)).toBe(target);
  });

  test.each([42.5, 47.5, 62.5, 87.5])('fractional target %dkg round-trips', (target) => {
    const bar = 20;
    const plates = calculatePlates(target, bar);
    expect(totalLoadedWeight(plates, bar)).toBe(target);
  });
});

// ─── Plate size constraints ───────────────────────────────────────────────

describe('PLATE_SIZES constant', () => {
  test('descending order (for greedy algorithm)', () => {
    for (let i = 1; i < PLATE_SIZES.length; i++) {
      expect(PLATE_SIZES[i]).toBeLessThan(PLATE_SIZES[i - 1]);
    }
  });

  test('includes the standard Olympic set', () => {
    expect(PLATE_SIZES).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
  });

  test('all plates positive', () => {
    for (const p of PLATE_SIZES) {
      expect(p).toBeGreaterThan(0);
    }
  });

  test('smallest plate = 1.25kg (micro loading)', () => {
    expect(Math.min(...PLATE_SIZES)).toBe(1.25);
  });

  test('largest plate = 25kg', () => {
    expect(Math.max(...PLATE_SIZES)).toBe(25);
  });
});

// ─── Greedy failure modes ────────────────────────────────────────────────

describe('Edge cases for greedy', () => {
  test('non-representable target (0.1kg/side after full decomposition) returns partial', () => {
    // 40.1 / 20 → 10.05/side. Plate-set doesn't go below 1.25, so the .05
    // can't be loaded. Result: 10kg/side loaded (=40kg total), caller can
    // warn user.
    const plates = calculatePlates(40.1, 20);
    expect(plates.get(10)).toBe(1);
  });

  test('exactly at bar + smallest plate (22.5)', () => {
    const plates = calculatePlates(22.5, 20);
    expect(plates.get(1.25)).toBe(1);
    expect(totalLoadedWeight(plates, 20)).toBe(22.5);
  });
});

// ─── Realistic gym scenarios (multi-exercise) ────────────────────────────

describe('Realistic scenarios', () => {
  const scenarios: Array<[string, number, number, Array<[number, number]>]> = [
    ['Squat 100kg', 100, 20, [[25, 1], [15, 1]]],
    ['Bench 80kg', 80, 20, [[25, 1], [5, 1]]],
    ['Deadlift 180kg', 180, 20, [[25, 3], [5, 1]]],
    ['Overhead 40kg', 40, 20, [[10, 1]]],
  ];

  test.each(scenarios)('%s', (label, target, bar, expected) => {
    const plates = calculatePlates(target, bar);
    for (const [size, count] of expected) {
      expect(plates.get(size as any)).toBe(count);
    }
  });
});
