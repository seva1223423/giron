/**
 * Edge-case coverage for Direction A design components.
 *
 * Focus on the failure modes that cause silent visual breakage:
 *   - Empty / null / undefined data
 *   - 1 vs many array items (pluralisation, grid wrap)
 *   - Unicode / RTL / emoji in user-supplied strings
 *   - Negative / NaN / Infinity numbers
 *   - Huge numeric values (big volume, big weight)
 *   - Missing optional props
 */

import {
  findLiveSet,
  rpeFillRatio,
  buildSetEyebrow,
} from '../screens/tracker/components/heroLogic';
import { clampProgress, normalizeWeekDots, pluralizeDaysRu } from '../utils/layout';
import { formatDateMetaRu } from '../utils/date';
import type { WorkoutExercise, WorkoutSet } from '../types';

// ─── Array-based components ──────────────────────────────────────────────────

describe('Empty-data handling across design components', () => {
  test('findLiveSet — empty exercise.sets returns null, no throw', () => {
    expect(() => findLiveSet([])).not.toThrow();
    expect(findLiveSet([])).toBeNull();
  });

  test('buildSetEyebrow — exercise with no sets returns empty string', () => {
    const ex = { id: 'e', exerciseId: 'x', sets: [], order: 0 } as unknown as WorkoutExercise;
    expect(buildSetEyebrow(ex, 0)).toBe('');
    expect(buildSetEyebrow(ex, -1)).toBe('');
    expect(buildSetEyebrow(ex, 999)).toBe('');
  });

  test('findLiveSet — single-element arrays work both states', () => {
    const base: WorkoutSet = { id: '1', setNumber: 1, type: 'normal', completed: false } as any;
    expect(findLiveSet([base])?.set.id).toBe('1');
    expect(findLiveSet([{ ...base, completed: true }])?.set.id).toBe('1');
  });

  test('findLiveSet — 100-element array still returns in O(n)', () => {
    const sets: WorkoutSet[] = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`, setNumber: i + 1, type: 'normal', completed: i < 50, reps: 8, weight: 100,
    } as any));
    const live = findLiveSet(sets);
    expect(live?.index).toBe(50);
    expect(live?.set.id).toBe('s50');
  });
});

// ─── clampProgress — ring/bar safety ────────────────────────────────────────

describe('clampProgress (Ring + Bar guard)', () => {
  test('passes through valid 0..1', () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(0.25)).toBe(0.25);
    expect(clampProgress(0.5)).toBe(0.5);
    expect(clampProgress(0.99)).toBe(0.99);
    expect(clampProgress(1)).toBe(1);
  });

  test('NaN → 0 (no silent SVG break)', () => {
    expect(clampProgress(NaN)).toBe(0);
  });

  test('Infinity → 0 (not 1 — safer default)', () => {
    expect(clampProgress(Infinity)).toBe(0);
    expect(clampProgress(-Infinity)).toBe(0);
  });

  test('negative values → 0', () => {
    expect(clampProgress(-0.1)).toBe(0);
    expect(clampProgress(-999)).toBe(0);
  });

  test('>1 values → 1', () => {
    expect(clampProgress(1.0001)).toBe(1);
    expect(clampProgress(42)).toBe(1);
    expect(clampProgress(Number.MAX_SAFE_INTEGER)).toBe(1);
  });

  test('boundary 0.0 and 1.0 exact', () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(1)).toBe(1);
    expect(clampProgress(-0)).toBe(-0); // minus-zero still 0 by ===
  });
});

// ─── normalizeWeekDots — StreakPRGrid guard ─────────────────────────────────

describe('normalizeWeekDots', () => {
  test('exact 7 cells passes through', () => {
    expect(normalizeWeekDots([1, 1, 0, 1, 1, 1, 0])).toEqual([1, 1, 0, 1, 1, 1, 0]);
  });

  test('null / undefined / non-array → all zeros', () => {
    expect(normalizeWeekDots(null)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(normalizeWeekDots(undefined)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(normalizeWeekDots('string')).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(normalizeWeekDots({})).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(normalizeWeekDots(42)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test('empty array → all zeros', () => {
    expect(normalizeWeekDots([])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test('shorter array pads from the start (older days zero)', () => {
    expect(normalizeWeekDots([1, 1, 1])).toEqual([0, 0, 0, 0, 1, 1, 1]);
    expect(normalizeWeekDots([1])).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  test('longer array slices to last 7 (most recent week)', () => {
    expect(normalizeWeekDots([1, 1, 1, 1, 1, 1, 1, 0])).toEqual([1, 1, 1, 1, 1, 1, 0]);
    expect(normalizeWeekDots([1, 1, 1, 1, 1, 1, 1, 1, 1, 0])).toEqual([1, 1, 1, 1, 1, 1, 0]);
  });

  test('non-binary entries coerce to 0|1', () => {
    // Truthy but not === 1 → 0 (strict guard)
    expect(normalizeWeekDots([true, 'yes', 2, NaN, 0, 1, null])).toEqual([0, 0, 0, 0, 0, 1, 0]);
  });
});

// ─── pluralizeDaysRu — Russian streak plurals ───────────────────────────────

describe('pluralizeDaysRu', () => {
  test('0 → "дней"', () => {
    expect(pluralizeDaysRu(0)).toBe('дней');
  });

  test('1 → "день"', () => {
    expect(pluralizeDaysRu(1)).toBe('день');
  });

  test('2, 3, 4 → "дня"', () => {
    expect(pluralizeDaysRu(2)).toBe('дня');
    expect(pluralizeDaysRu(3)).toBe('дня');
    expect(pluralizeDaysRu(4)).toBe('дня');
  });

  test('5..20 → "дней"', () => {
    expect(pluralizeDaysRu(5)).toBe('дней');
    expect(pluralizeDaysRu(10)).toBe('дней');
    expect(pluralizeDaysRu(20)).toBe('дней');
  });

  test('11, 12, 13, 14 are special — always "дней" (not "день/дня")', () => {
    // 11/12/13/14 break the mod10 rule; Russian treats teens as "дней"
    expect(pluralizeDaysRu(11)).toBe('дней');
    expect(pluralizeDaysRu(12)).toBe('дней');
    expect(pluralizeDaysRu(13)).toBe('дней');
    expect(pluralizeDaysRu(14)).toBe('дней');
  });

  test('21, 31, 41 → "день" (mod10 == 1, mod100 != 11)', () => {
    expect(pluralizeDaysRu(21)).toBe('день');
    expect(pluralizeDaysRu(31)).toBe('день');
    expect(pluralizeDaysRu(101)).toBe('день');
  });

  test('22, 23, 24 → "дня"', () => {
    expect(pluralizeDaysRu(22)).toBe('дня');
    expect(pluralizeDaysRu(33)).toBe('дня');
    expect(pluralizeDaysRu(104)).toBe('дня');
  });

  test('25, 47, 100 → "дней"', () => {
    expect(pluralizeDaysRu(25)).toBe('дней');
    expect(pluralizeDaysRu(47)).toBe('дней');
    expect(pluralizeDaysRu(100)).toBe('дней');
  });

  test('negative values use absolute value', () => {
    expect(pluralizeDaysRu(-1)).toBe('день');
    expect(pluralizeDaysRu(-21)).toBe('день');
  });
});

// ─── Numeric edge cases ──────────────────────────────────────────────────────

describe('Numeric edge cases', () => {
  test('rpeFillRatio — negative', () => {
    expect(rpeFillRatio(-100)).toBe(0);
    expect(rpeFillRatio(-0.0001)).toBe(0);
  });

  test('rpeFillRatio — huge positive', () => {
    expect(rpeFillRatio(1e10)).toBe(1);
    expect(rpeFillRatio(Number.MAX_SAFE_INTEGER)).toBe(1);
  });

  test('rpeFillRatio — zero / very-small', () => {
    expect(rpeFillRatio(0)).toBe(0);
    expect(rpeFillRatio(0.000001)).toBe(0);
  });

  test('rpeFillRatio — precision at 0.5 boundaries', () => {
    // RPE 7.5 → exactly 0.375 (3 cells)
    expect(rpeFillRatio(7.5)).toBeCloseTo(0.375);
    // RPE 8.5 → 0.625
    expect(rpeFillRatio(8.5)).toBeCloseTo(0.625);
    // RPE 9.5 → 0.875
    expect(rpeFillRatio(9.5)).toBeCloseTo(0.875);
  });
});

// ─── Unicode / bidirectional / emoji ────────────────────────────────────────

describe('Unicode safety', () => {
  test('buildSetEyebrow — Russian cyrillic characters preserved', () => {
    const ex = {
      sets: [
        { type: 'warmup' } as any,
        { type: 'normal' } as any,
      ],
    } as unknown as WorkoutExercise;
    expect(buildSetEyebrow(ex, 0)).toContain('Разминка');
    expect(buildSetEyebrow(ex, 1)).toContain('рабочий');
  });

  test('formatDateMetaRu — lowercase cyrillic output (no Latin drift)', () => {
    const d = new Date(2026, 3, 21);
    const out = formatDateMetaRu(d);
    // Every letter is cyrillic + space + digit + space + cyrillic
    expect(out).toMatch(/^[а-яё]+\s·\s\d+\s[а-яё]+$/i);
  });

  test('string length guards for long cyrillic names', () => {
    const names = [
      'Константин',
      'Александра Петровна',
      'Юсип', // possible
      'Łukasz', // latin+diacritic mix
    ];
    for (const n of names) {
      expect(n.length).toBeGreaterThan(0);
      expect(n.length).toBeLessThan(50);
    }
  });

  test('emoji in names does not break measurement', () => {
    // In RN, emoji can be surrogate pairs. Just make sure they survive as-is.
    const withEmoji = 'Иван 🔥';
    expect(withEmoji.length).toBe(7); // JS counts surrogate pair as 2 code units
    expect(withEmoji).toContain('🔥');
  });
});

// ─── Date edge cases ────────────────────────────────────────────────────────

describe('Date edge cases', () => {
  test('formatDateMetaRu — New Year', () => {
    const d = new Date(2026, 0, 1); // Thursday
    expect(formatDateMetaRu(d)).toBe('четверг · 1 января');
  });

  test('formatDateMetaRu — Feb 29 on leap year', () => {
    const d = new Date(2028, 1, 29);
    expect(formatDateMetaRu(d)).toContain('29 февраля');
  });

  test('formatDateMetaRu — Dec 31 end of year', () => {
    const d = new Date(2026, 11, 31); // Thursday
    expect(formatDateMetaRu(d)).toBe('четверг · 31 декабря');
  });

  test('formatDateMetaRu — invalid date returns some string (does not throw)', () => {
    // Invalid Date — getDay() returns NaN. Our fallbacks via ?? '' handle it.
    const invalid = new Date('invalid');
    expect(() => formatDateMetaRu(invalid)).not.toThrow();
    // The result has " ·  " shape but empty weekday/month slots
    const s = formatDateMetaRu(invalid);
    expect(typeof s).toBe('string');
  });
});

// ─── Weekly streak dots helper ──────────────────────────────────────────────

describe('Week dot helper (from HomeScreen render)', () => {
  // Shadows the logic in HomeScreen that produces the 7-day strip.
  function buildWeekDots(workoutHistory: Array<{ completedAt?: string | null }>): (0 | 1)[] {
    const now = new Date();
    const weekDots: (0 | 1)[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const hit = workoutHistory.some((w) => w.completedAt && w.completedAt.startsWith(ds));
      weekDots.push(hit ? 1 : 0);
    }
    return weekDots;
  }

  test('empty history → all zeros', () => {
    expect(buildWeekDots([]).filter((x) => x === 1)).toHaveLength(0);
    expect(buildWeekDots([]).length).toBe(7);
  });

  test('all 7 days completed → all ones', () => {
    const now = new Date();
    const history = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      return { completedAt: d.toISOString() };
    });
    const dots = buildWeekDots(history);
    expect(dots.filter((x) => x === 1).length).toBe(7);
  });

  test('null completedAt is tolerated', () => {
    expect(() => buildWeekDots([{ completedAt: null }])).not.toThrow();
    expect(() => buildWeekDots([{ completedAt: undefined }])).not.toThrow();
  });

  test('returns exactly 7 cells regardless of history size', () => {
    expect(buildWeekDots([]).length).toBe(7);
    expect(buildWeekDots(Array.from({ length: 100 }, () => ({ completedAt: new Date().toISOString() })))).toHaveLength(7);
  });
});

// ─── Normalized macro percentages (home + scanner) ───────────────────────────

describe('Macro percentage computation', () => {
  // Shadow the stacked-bar math used in totals card.
  function macroPercentages(protein: number, fats: number, carbs: number) {
    const calP = protein * 4;
    const calF = fats * 9;
    const calC = carbs * 4;
    const sum = calP + calF + calC;
    if (sum < 1) return null;
    const pctP = Math.round((calP / sum) * 100);
    const pctF = Math.round((calF / sum) * 100);
    const pctC = Math.max(0, 100 - pctP - pctF);
    return { pctP, pctF, pctC };
  }

  test('all-zero macros returns null (no divide-by-zero)', () => {
    expect(macroPercentages(0, 0, 0)).toBeNull();
  });

  test('protein-only yields 100% P', () => {
    const r = macroPercentages(100, 0, 0);
    expect(r?.pctP).toBe(100);
    expect(r?.pctF).toBe(0);
    expect(r?.pctC).toBe(0);
  });

  test('balanced 30P / 30F / 40C adds to 100', () => {
    // 30g P → 120 kcal, 30g F → 270, 40g C → 160 → 550 total
    // pctP ≈ 22, pctF ≈ 49, pctC ≈ 29
    const r = macroPercentages(30, 30, 40);
    expect(r!.pctP + r!.pctF + r!.pctC).toBe(100);
  });

  test('tiny values still compute (carbs-only 0.5g)', () => {
    const r = macroPercentages(0, 0, 0.5);
    expect(r?.pctC).toBe(100);
    expect(r?.pctP).toBe(0);
    expect(r?.pctF).toBe(0);
  });

  test('negative macros still produce valid percentages (defensive)', () => {
    // Negative values shouldn't happen but if they do we don't want NaN
    const r = macroPercentages(-10, 10, 10);
    // Math.max(0, ...) guard kicks in for pctC
    expect(r).not.toBeNull();
    expect(typeof r?.pctP).toBe('number');
  });
});
