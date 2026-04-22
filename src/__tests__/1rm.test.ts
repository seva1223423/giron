/**
 * Tests for 1RM formulas used throughout Iron Gym:
 *  - Epley   (achievements.ts, SetRow, ExerciseProgressionModal, RecordsTab)
 *  - Brzycki (OneRMCalculatorTab)
 *  - Lander  (OneRMCalculatorTab)
 *  - Average (OneRMCalculatorTab)
 *  - ONE_RM_PERCENTAGES training load table (OneRMCalculatorTab)
 */

// ─── Epley ────────────────────────────────────────────────────────────────────
// Formula: weight * (1 + reps / 30)
// Used in achievements.ts, RecordsTab, SetRow, ExerciseProgressionModal

describe('1RM Epley formula', () => {
  // The calc1RM variant used in achievements uses Math.round
  const calc1RM = (weight: number, reps: number) => Math.round(weight * (1 + reps / 30));

  test('1 rep = weight * 1.033', () => {
    expect(calc1RM(100, 1)).toBe(103); // 100 * 1.033
  });

  test('10 reps at 80kg', () => {
    expect(calc1RM(80, 10)).toBe(107); // 80 * 1.333
  });

  test('5 reps at 100kg', () => {
    expect(calc1RM(100, 5)).toBe(117); // 100 * 1.167
  });

  test('0 weight returns 0', () => {
    expect(calc1RM(0, 10)).toBe(0);
  });

  test('0 reps returns weight', () => {
    expect(calc1RM(100, 0)).toBe(100);
  });

  test('heavy single at 200kg', () => {
    expect(calc1RM(200, 1)).toBe(207);
  });

  test('high reps at low weight', () => {
    expect(calc1RM(40, 20)).toBe(67); // 40 * 1.667
  });
});

// ─── Brzycki ──────────────────────────────────────────────────────────────────
// Formula: r === 1 → w, r >= 37 → w (singularity guard), else w * (36 / (37 - r))
// Source: OneRMCalculatorTab.tsx

describe('1RM Brzycki formula', () => {
  const calcBrzycki = (w: number, r: number) =>
    r === 1 ? w : r >= 37 ? w : w * (36 / (37 - r));

  test('1 rep is a direct 1RM — returns weight unchanged', () => {
    expect(calcBrzycki(100, 1)).toBe(100);
    expect(calcBrzycki(200, 1)).toBe(200);
  });

  test('5 reps at 100kg', () => {
    // 100 * (36 / 32) = 112.5
    expect(calcBrzycki(100, 5)).toBeCloseTo(112.5);
  });

  test('10 reps at 80kg', () => {
    // 80 * (36 / 27) ≈ 106.67
    expect(calcBrzycki(80, 10)).toBeCloseTo(106.67, 1);
  });

  test('3 reps at 120kg', () => {
    // 120 * (36 / 34) ≈ 127.06
    expect(calcBrzycki(120, 3)).toBeCloseTo(127.06, 1);
  });

  test('0 weight returns 0', () => {
    expect(calcBrzycki(0, 5)).toBe(0);
  });

  test('36 reps (last valid) returns weight * (36/1) = weight * 36', () => {
    // r=36 → 36/(37-36) = 36 — extreme but mathematically valid per the formula
    expect(calcBrzycki(100, 36)).toBeCloseTo(3600);
  });

  test('37+ reps hit singularity guard — returns weight unchanged', () => {
    expect(calcBrzycki(100, 37)).toBe(100);
    expect(calcBrzycki(100, 40)).toBe(100);
    expect(calcBrzycki(100, 50)).toBe(100);
  });
});

// ─── Lander ───────────────────────────────────────────────────────────────────
// Formula: r === 1 → w, r >= 38 → w (singularity guard),
//          else (100 * w) / (101.3 - 2.67123 * r)
// Source: OneRMCalculatorTab.tsx

describe('1RM Lander formula', () => {
  const calcLander = (w: number, r: number) =>
    r === 1 ? w : r >= 38 ? w : (100 * w) / (101.3 - 2.67123 * r);

  test('1 rep is a direct 1RM — returns weight unchanged', () => {
    expect(calcLander(100, 1)).toBe(100);
    expect(calcLander(150, 1)).toBe(150);
  });

  test('5 reps at 100kg', () => {
    // (100 * 100) / (101.3 - 13.356) ≈ 100 / 87.944 ≈ 113.71
    expect(calcLander(100, 5)).toBeCloseTo(113.71, 1);
  });

  test('10 reps at 80kg', () => {
    // (100 * 80) / (101.3 - 26.7123) ≈ 8000 / 74.5877 ≈ 107.25
    expect(calcLander(80, 10)).toBeCloseTo(107.25, 1);
  });

  test('3 reps at 120kg', () => {
    // (100 * 120) / (101.3 - 8.01369) ≈ 12000 / 93.286 ≈ 128.63
    expect(calcLander(120, 3)).toBeCloseTo(128.63, 1);
  });

  test('0 weight returns 0', () => {
    expect(calcLander(0, 5)).toBe(0);
  });

  test('38+ reps hit singularity guard — returns weight unchanged', () => {
    expect(calcLander(100, 38)).toBe(100);
    expect(calcLander(100, 50)).toBe(100);
  });
});

// ─── Average (Epley + Brzycki + Lander) ──────────────────────────────────────
// The calculator shows avg for a balanced estimate

describe('1RM average formula', () => {
  const calcEpley  = (w: number, r: number) => r === 1 ? w : w * (1 + r / 30);
  const calcBrzycki = (w: number, r: number) => r === 1 ? w : r >= 37 ? w : w * (36 / (37 - r));
  const calcLander  = (w: number, r: number) => r === 1 ? w : r >= 38 ? w : (100 * w) / (101.3 - 2.67123 * r);
  const calcAvg = (w: number, r: number) => (calcEpley(w, r) + calcBrzycki(w, r) + calcLander(w, r)) / 3;

  test('1 rep at any weight → all three agree → avg = weight', () => {
    expect(calcAvg(100, 1)).toBe(100);
    expect(calcAvg(200, 1)).toBe(200);
  });

  test('5 reps at 100kg — avg is close to individual estimates', () => {
    const avg = calcAvg(100, 5);
    // Epley≈116.67, Brzycki=112.5, Lander≈113.71 → avg≈114.29
    expect(avg).toBeGreaterThan(112);
    expect(avg).toBeLessThan(117);
  });

  test('all three formulas agree within 10% for typical sets (3-10 reps)', () => {
    const weights = [60, 80, 100, 120];
    const reps    = [3, 5, 6, 8, 10];
    for (const w of weights) {
      for (const r of reps) {
        const e = calcEpley(w, r);
        const b = calcBrzycki(w, r);
        const l = calcLander(w, r);
        const max = Math.max(e, b, l);
        const min = Math.min(e, b, l);
        // Divergence < 10% of max value — formulas converge in practical range
        expect((max - min) / max).toBeLessThan(0.1);
      }
    }
  });
});

// ─── ONE_RM_PERCENTAGES table ─────────────────────────────────────────────────
// Used in OneRMCalculatorTab to show training load percentages.
// The table must be strictly descending from 100 down to 50.

describe('ONE_RM_PERCENTAGES training load table', () => {
  const ONE_RM_PERCENTAGES = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];

  test('has 11 entries (100% down to 50% in 5% steps)', () => {
    expect(ONE_RM_PERCENTAGES).toHaveLength(11);
  });

  test('starts at 100% and ends at 50%', () => {
    expect(ONE_RM_PERCENTAGES[0]).toBe(100);
    expect(ONE_RM_PERCENTAGES[ONE_RM_PERCENTAGES.length - 1]).toBe(50);
  });

  test('is strictly descending', () => {
    for (let i = 1; i < ONE_RM_PERCENTAGES.length; i++) {
      expect(ONE_RM_PERCENTAGES[i]).toBeLessThan(ONE_RM_PERCENTAGES[i - 1]);
    }
  });

  test('each step is exactly 5%', () => {
    for (let i = 1; i < ONE_RM_PERCENTAGES.length; i++) {
      expect(ONE_RM_PERCENTAGES[i - 1] - ONE_RM_PERCENTAGES[i]).toBe(5);
    }
  });

  test('all values are in valid percentage range [0, 100]', () => {
    for (const p of ONE_RM_PERCENTAGES) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  test('can compute training weight from 1RM at each percentage', () => {
    const oneRM = 100; // kg
    const trainingWeights = ONE_RM_PERCENTAGES.map((p) => Math.round((oneRM * p) / 100));
    expect(trainingWeights[0]).toBe(100); // 100% = full 1RM
    expect(trainingWeights[1]).toBe(95);  // 95%
    expect(trainingWeights[ONE_RM_PERCENTAGES.length - 1]).toBe(50); // 50%
  });
});
