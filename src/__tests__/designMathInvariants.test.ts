/**
 * Final round: fuzz-style invariants across the design math.
 *
 * For each of the design helpers, we run random inputs and check that
 * the output stays within documented bounds. If a refactor breaks the
 * bounds, we catch it here even if we didn't add a specific case.
 */

import { clampProgress, normalizeWeekDots, pluralizeDaysRu } from '../utils/layout';
import {
  calorieDayProgress,
  todayMondayIndex,
  buildWeekDotsFromHistory,
  findHeaviestPR,
} from '../utils/homeDerivations';
import { rpeFillRatio, findLiveSet } from '../screens/tracker/components/heroLogic';

// ─── clampProgress fuzz ────────────────────────────────────────────────────

describe('clampProgress — fuzz invariants', () => {
  test('output always in [0, 1]', () => {
    for (let i = 0; i < 1000; i++) {
      const input = (Math.random() - 0.5) * 1000; // -500..500
      const out = clampProgress(input);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(1);
    }
  });

  test('output is finite for every finite or non-finite input', () => {
    const inputs = [0, 1, -0, -Infinity, Infinity, NaN, 1e20, -1e20];
    for (const i of inputs) {
      expect(isFinite(clampProgress(i))).toBe(true);
    }
  });
});

// ─── normalizeWeekDots fuzz ────────────────────────────────────────────────

describe('normalizeWeekDots — fuzz invariants', () => {
  test('always returns array of length 7', () => {
    for (let i = 0; i < 100; i++) {
      const len = Math.floor(Math.random() * 20);
      const input = Array.from({ length: len }, () => (Math.random() > 0.5 ? 1 : 0));
      expect(normalizeWeekDots(input).length).toBe(7);
    }
  });

  test('output only contains 0 or 1', () => {
    const weirdInputs = [
      [true, false, null, undefined, 'yes', 'no', 2, 0.5],
      [NaN, Infinity, -1, 1],
      [[], {}, () => 1, true],
    ];
    for (const input of weirdInputs) {
      const dots = normalizeWeekDots(input);
      for (const d of dots) expect([0, 1]).toContain(d);
    }
  });
});

// ─── pluralizeDaysRu fuzz ──────────────────────────────────────────────────

describe('pluralizeDaysRu — fuzz invariants', () => {
  test('output always one of "день", "дня", "дней"', () => {
    const valid = ['день', 'дня', 'дней'];
    for (let i = 0; i < 1000; i++) {
      const n = Math.floor(Math.random() * 1000);
      expect(valid).toContain(pluralizeDaysRu(n));
    }
  });

  test('handles negative safely', () => {
    for (let i = 0; i < 100; i++) {
      const n = -Math.floor(Math.random() * 1000);
      expect(['день', 'дня', 'дней']).toContain(pluralizeDaysRu(n));
    }
  });
});

// ─── calorieDayProgress fuzz ───────────────────────────────────────────────

describe('calorieDayProgress — fuzz invariants', () => {
  test('output always >= 0 (no negative progress)', () => {
    for (let i = 0; i < 1000; i++) {
      const calNow = (Math.random() - 0.2) * 3000; // allow negative
      const calTarget = (Math.random() - 0.2) * 3000;
      const out = calorieDayProgress(calNow, calTarget);
      expect(out).toBeGreaterThanOrEqual(0);
    }
  });

  test('output always finite', () => {
    const wild = [NaN, Infinity, -Infinity, 0, 1e20];
    for (const now of wild) {
      for (const target of wild) {
        expect(isFinite(calorieDayProgress(now, target))).toBe(true);
      }
    }
  });
});

// ─── todayMondayIndex fuzz ─────────────────────────────────────────────────

describe('todayMondayIndex — fuzz invariants', () => {
  test('always in 0..6 for every second across 1 year of dates', () => {
    const start = new Date(2026, 0, 1);
    for (let d = 0; d < 366; d++) {
      const date = new Date(start);
      date.setDate(date.getDate() + d);
      const idx = todayMondayIndex(date);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(6);
      expect(Number.isInteger(idx)).toBe(true);
    }
  });
});

// ─── rpeFillRatio fuzz ─────────────────────────────────────────────────────

describe('rpeFillRatio — fuzz invariants', () => {
  test('output always in [0, 1]', () => {
    for (let i = 0; i < 1000; i++) {
      const r = rpeFillRatio(Math.random() * 20 - 5); // -5..15
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});

// ─── findLiveSet fuzz ──────────────────────────────────────────────────────

describe('findLiveSet — fuzz invariants', () => {
  test('never throws, always returns null or { index, set }', () => {
    for (let i = 0; i < 100; i++) {
      const len = Math.floor(Math.random() * 20);
      const sets = Array.from({ length: len }, (_, n) => ({
        id: `s${n}`,
        setNumber: n + 1,
        type: 'normal' as const,
        completed: Math.random() > 0.5,
      } as any));
      const r = findLiveSet(sets);
      if (r) {
        expect(r.index).toBeGreaterThanOrEqual(0);
        expect(r.index).toBeLessThan(sets.length);
        expect(r.set).toBeDefined();
      }
    }
  });
});

// ─── buildWeekDotsFromHistory fuzz ────────────────────────────────────────

describe('buildWeekDotsFromHistory — fuzz invariants', () => {
  test('always 7 cells regardless of history shape', () => {
    for (let i = 0; i < 50; i++) {
      const len = Math.floor(Math.random() * 30);
      const history = Array.from({ length: len }, () => ({
        completedAt: Math.random() > 0.2
          ? new Date(Date.now() - Math.random() * 1e10).toISOString()
          : null,
      }));
      expect(buildWeekDotsFromHistory(history)).toHaveLength(7);
    }
  });

  test('only 0 or 1 in output cells', () => {
    for (let i = 0; i < 50; i++) {
      const history = Array.from({ length: 30 }, () => ({
        completedAt: new Date(Date.now() - Math.random() * 1e10).toISOString(),
      }));
      const dots = buildWeekDotsFromHistory(history);
      for (const d of dots) expect([0, 1]).toContain(d);
    }
  });
});

// ─── findHeaviestPR fuzz ──────────────────────────────────────────────────

describe('findHeaviestPR — fuzz invariants', () => {
  test('kg >= 0 always', () => {
    for (let i = 0; i < 100; i++) {
      const history = Array.from({ length: Math.floor(Math.random() * 10) }, () => ({
        exercises: [
          {
            exercise: { name: 'X' },
            sets: [
              { completed: Math.random() > 0.5, weight: Math.random() * 300 - 50 },
              { completed: true, weight: Math.random() * 300 },
            ],
          },
        ],
      } as any));
      const pr = findHeaviestPR(history);
      expect(pr.kg).toBeGreaterThanOrEqual(0);
      expect(typeof pr.exerciseName).toBe('string');
      expect(pr.exerciseName.length).toBeGreaterThan(0);
    }
  });
});
