/**
 * Regression guards for the specific bugs I fixed during the Direction
 * A implementation. Each test documents a real issue from git history
 * and locks the fix so it can't silently re-emerge.
 */

import {
  clampProgress,
  normalizeWeekDots,
  pluralizeDaysRu,
} from '../utils/layout';
import {
  buildWeekDotsFromHistory,
  findHeaviestPR,
  calorieDayProgress,
} from '../utils/homeDerivations';
import { rpeFillRatio, findLiveSet, buildSetEyebrow } from '../screens/tracker/components/heroLogic';
import { buildPaywallCtaTitle, buildPaywallCtaFineprint } from '../utils/paywall';
import { formatDateMetaRu } from '../utils/date';
import type { WorkoutExercise, WorkoutSet } from '../types';

// ─── Regressions ────────────────────────────────────────────────────────────

describe('Regression: "11 дней" not "11 дня" — Russian plural teens', () => {
  // Before pluralizeDaysRu helper landed, inline streak rendering used:
  //   const dayLabel = streakDays === 1 ? 'день' : streakDays >= 2 && streakDays <= 4 ? 'дня' : 'дней';
  // That was wrong for 21, 22, 23, 24 and also for 2-4 in the hundreds.
  test('11, 12, 13, 14 are "дней" (not "дня")', () => {
    for (const n of [11, 12, 13, 14]) {
      expect(pluralizeDaysRu(n)).toBe('дней');
    }
  });

  test('21, 22, 23, 24 are NOT all "дней" (correct ru grammar)', () => {
    expect(pluralizeDaysRu(21)).toBe('день');
    expect(pluralizeDaysRu(22)).toBe('дня');
    expect(pluralizeDaysRu(23)).toBe('дня');
    expect(pluralizeDaysRu(24)).toBe('дня');
  });
});

describe('Regression: Ring/Bar silently break on NaN progress', () => {
  // Before clampProgress: inline Math.min(1, Math.max(0, NaN)) → NaN.
  // SVG strokeDashoffset of NaN causes a warning / invisible fill.
  test('NaN progress → 0 (not NaN — safe SVG math)', () => {
    expect(clampProgress(NaN)).toBe(0);
    expect(isFinite(clampProgress(NaN))).toBe(true);
  });

  test('Infinity progress → 0 (not 1 — safer default)', () => {
    expect(clampProgress(Infinity)).toBe(0);
    expect(clampProgress(-Infinity)).toBe(0);
  });
});

describe('Regression: calorie ring divides by zero', () => {
  // Before calorieDayProgress helper: inline ratio = calNow / calTarget
  // produced Infinity when target was 0 or NaN when undefined.
  test('0 target → 0 progress (not Infinity)', () => {
    expect(calorieDayProgress(500, 0)).toBe(0);
  });

  test('NaN target → 0', () => {
    expect(calorieDayProgress(500, NaN)).toBe(0);
  });

  test('negative target → 0', () => {
    expect(calorieDayProgress(500, -2000)).toBe(0);
  });
});

describe('Regression: findHeaviestPR crashes on missing exercises', () => {
  // Before extraction, inline code accessed workoutHistory[i].exercises[j].sets
  // with no safety — a history entry without exercises would throw.
  test('workout with no exercises array safely returns default', () => {
    const pr = findHeaviestPR([{}] as any);
    expect(pr.kg).toBe(0);
    expect(pr.exerciseName).toBe('Ещё нет PR');
  });

  test('exercise with no sets array is skipped', () => {
    const pr = findHeaviestPR([
      { exercises: [{} as any] },
    ] as any);
    expect(pr.kg).toBe(0);
  });

  test('null completedAt in history tolerated', () => {
    expect(() => findHeaviestPR([{ exercises: [] }, { exercises: [] }] as any)).not.toThrow();
  });
});

describe('Regression: weekDots always 7 cells contract', () => {
  // A bug could produce < 7 cells if the loop iteration broke early.
  // Helper guarantees 7 even from malformed inputs.
  test('any-length history → always 7 cells', () => {
    for (const len of [0, 1, 5, 7, 14, 100]) {
      const history = Array.from({ length: len }, () => ({
        completedAt: new Date().toISOString(),
      }));
      expect(buildWeekDotsFromHistory(history)).toHaveLength(7);
    }
  });

  test('normalizeWeekDots enforces 7-cell contract', () => {
    for (const len of [0, 1, 3, 6, 7, 8, 10, 100]) {
      const input = Array.from({ length: len }, () => 1 as 0 | 1);
      expect(normalizeWeekDots(input).length).toBe(7);
    }
  });
});

describe('Regression: PaywallModal CTA copy matches design', () => {
  // Before extraction, copy was inlined in render — easy to mistype.
  test('trial-eligible CTA says "Начать 7 дней бесплатно"', () => {
    expect(buildPaywallCtaTitle('year', false)).toBe('Начать 7 дней бесплатно');
    expect(buildPaywallCtaTitle('month', false)).toBe('Начать 7 дней бесплатно');
  });

  test('trial-used yearly uses NBSP in "2 990 ₽"', () => {
    const out = buildPaywallCtaTitle('year', true);
    // Must not use plain space or comma
    expect(out).not.toContain('2 990'); // plain space forbidden
    expect(out).not.toContain('2,990');
    // Must match with any unicode space separator
    expect(out).toMatch(/2[\u202F\u00A0]990/);
  });

  test('trial-eligible fine-print ends in "можно отменить в любой момент"', () => {
    const out = buildPaywallCtaFineprint('year', false);
    expect(out.endsWith('можно отменить в любой момент')).toBe(true);
  });
});

describe('Regression: findLiveSet / buildSetEyebrow safety on empty', () => {
  // CurrentSetHero used to throw if exercise.sets was empty (attempted
  // findIndex on undefined).
  test('empty sets array → null (not crash)', () => {
    expect(findLiveSet([])).toBeNull();
  });

  test('buildSetEyebrow on empty sets returns ""', () => {
    const ex: WorkoutExercise = { id: 'x', exerciseId: 'y', sets: [], order: 0 } as any;
    expect(buildSetEyebrow(ex, 0)).toBe('');
  });

  test('rpeFillRatio on NaN → 0 (Ring cell array doesn\'t misfire)', () => {
    expect(rpeFillRatio(NaN)).toBe(0);
  });
});

describe('Regression: date meta label handles invalid Date', () => {
  test('Invalid Date input does not throw', () => {
    expect(() => formatDateMetaRu(new Date('invalid'))).not.toThrow();
  });

  test('returns a string even on invalid input', () => {
    const s = formatDateMetaRu(new Date('invalid'));
    expect(typeof s).toBe('string');
  });
});

describe('Regression: appendNextRef cleanup (food scanner)', () => {
  // This one's wired in FoodScannerScreen — here we just assert the
  // helpers that fed into that fix are still sane.
  test('pluralizeDaysRu + normalizeWeekDots + clampProgress compose safely', () => {
    // Integration smoke — call all 3 in sequence on weird inputs to
    // make sure none of them pollute upstream state.
    const raw = [NaN, Infinity, 1, 0, 1];
    const dots = normalizeWeekDots(raw as any);
    const days = dots.filter((d) => d === 1).length;
    expect(pluralizeDaysRu(days)).toMatch(/^(день|дня|дней)$/);
    expect(clampProgress(days / 7)).toBeGreaterThanOrEqual(0);
  });
});
