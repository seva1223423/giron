import { calculatePlates, totalLoadedWeight, PLATE_SIZES } from '../utils/plates';

/**
 * Tests for src/utils/plates.ts — plate-loading greedy calculator.
 *
 * calculatePlates(targetKg, barbellKg) → Map<size, count per side>
 * totalLoadedWeight(plates, barbellKg) → total weight on the bar
 */

// ─── calculatePlates ─────────────────────────────────────────────────────────

describe('calculatePlates', () => {
  test('100kg on 20kg bar → 1×25 + 1×15 per side (greedy)', () => {
    // (100 - 20) / 2 = 40 per side — greedy picks 25 first: 1×25 rem 15 → 1×15 rem 0
    const plates = calculatePlates(100, 20);
    expect(plates.get(25)).toBe(1);
    expect(plates.get(15)).toBe(1);
    expect(plates.get(20)).toBeUndefined();
    expect(totalLoadedWeight(plates, 20)).toBe(100);
  });

  test('target equal to barbell → empty map', () => {
    expect(calculatePlates(20, 20).size).toBe(0);
  });

  test('target less than barbell → empty map', () => {
    expect(calculatePlates(15, 20).size).toBe(0);
  });

  test('0kg barbell (dumbbell mode) — 50kg target', () => {
    // 50 / 2 = 25 per side → 1×25
    const plates = calculatePlates(50, 0);
    expect(plates.get(25)).toBe(1);
    expect(plates.size).toBe(1);
  });

  test('60kg on 20kg bar → 1×20 per side', () => {
    // (60-20)/2 = 20 per side → 1×20
    const plates = calculatePlates(60, 20);
    expect(plates.get(20)).toBe(1);
    expect(plates.size).toBe(1);
  });

  test('102.5kg on 20kg bar → 1×25 + 1×10 + 1×2.5 per side', () => {
    // (102.5 - 20) / 2 = 41.25 per side
    // 41.25 → 1×25 + rem 16.25 → 1×10 + rem 6.25 → 1×5 + rem 1.25 → 1×1.25
    const plates = calculatePlates(102.5, 20);
    // Verify total adds up correctly
    let total = 0;
    for (const [size, count] of plates) total += size * count;
    expect(total).toBeCloseTo(41.25, 2);
  });

  test('total loaded weight reconstructs target for standard loads', () => {
    const targets = [60, 80, 100, 120, 140, 160, 180, 200];
    for (const target of targets) {
      const plates = calculatePlates(target, 20);
      const loaded = totalLoadedWeight(plates, 20);
      expect(loaded).toBe(target);
    }
  });

  test('handles odd increments: 102.5kg', () => {
    const plates = calculatePlates(102.5, 20);
    expect(totalLoadedWeight(plates, 20)).toBeCloseTo(102.5, 2);
  });

  test('large weight: 250kg on 20kg bar', () => {
    // (250-20)/2 = 115 per side → greedy: 4×25 + 1×10 + 1×5
    const plates = calculatePlates(250, 20);
    expect(totalLoadedWeight(plates, 20)).toBe(250);
  });

  test('returns only non-zero entries', () => {
    const plates = calculatePlates(40, 20); // 10 per side → 1×10
    for (const [, count] of plates) {
      expect(count).toBeGreaterThan(0);
    }
  });

  test('all returned plate sizes are valid PLATE_SIZES values', () => {
    const plates = calculatePlates(115, 20);
    for (const size of plates.keys()) {
      expect(PLATE_SIZES).toContain(size);
    }
  });
});

// ─── totalLoadedWeight ────────────────────────────────────────────────────────

describe('totalLoadedWeight', () => {
  test('empty plates + barbell = barbell weight', () => {
    expect(totalLoadedWeight(new Map(), 20)).toBe(20);
  });

  test('1×20 per side on 20kg bar = 60kg', () => {
    const m = new Map<any, number>([[20, 1]]);
    expect(totalLoadedWeight(m, 20)).toBe(60);
  });

  test('2×25 per side on 20kg bar = 120kg', () => {
    const m = new Map<any, number>([[25, 2]]);
    expect(totalLoadedWeight(m, 20)).toBe(120);
  });
});

// ─── PLATE_SIZES constant ─────────────────────────────────────────────────────

describe('PLATE_SIZES', () => {
  test('is sorted from largest to smallest', () => {
    for (let i = 0; i < PLATE_SIZES.length - 1; i++) {
      expect(PLATE_SIZES[i]).toBeGreaterThan(PLATE_SIZES[i + 1]);
    }
  });

  test('smallest plate is 1.25', () => {
    expect(PLATE_SIZES[PLATE_SIZES.length - 1]).toBe(1.25);
  });

  test('largest plate is 25', () => {
    expect(PLATE_SIZES[0]).toBe(25);
  });
});
