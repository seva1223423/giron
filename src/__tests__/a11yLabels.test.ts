/**
 * Smoke coverage for accessibility label helpers and Russian plural
 * correctness for VO copy.
 *
 * The RN accessibility layer is tested through screen-level integration
 * tests elsewhere. Here we just assert the helpers that build label
 * strings stay correct.
 */

import { pluralizeDaysRu } from '../utils/layout';
import { buildSetEyebrow } from '../screens/tracker/components/heroLogic';
import { formatDateMetaRu } from '../utils/date';
import type { WorkoutExercise, WorkoutSet } from '../types';

// ─── Screen-reader friendly streak labels ───────────────────────────────────

describe('Streak VO-friendly labels', () => {
  // The HomeHeader / StreakPRGrid build labels like "47 дней". VoiceOver
  // should read this correctly — testing the plural helper covers it.
  test('single-day streak reads "1 день"', () => {
    expect(`1 ${pluralizeDaysRu(1)}`).toBe('1 день');
  });

  test('2-day streak reads "2 дня"', () => {
    expect(`2 ${pluralizeDaysRu(2)}`).toBe('2 дня');
  });

  test('11-day streak reads "11 дней" (not "11 дня")', () => {
    expect(`11 ${pluralizeDaysRu(11)}`).toBe('11 дней');
  });

  test('21-day streak reads "21 день"', () => {
    expect(`21 ${pluralizeDaysRu(21)}`).toBe('21 день');
  });

  test('100-day streak reads "100 дней"', () => {
    expect(`100 ${pluralizeDaysRu(100)}`).toBe('100 дней');
  });
});

// ─── Set-eyebrow copy stays readable by VO ──────────────────────────────────

describe('Set-eyebrow copy for VO', () => {
  const makeEx = (types: Array<'warmup' | 'normal' | 'dropset'>): WorkoutExercise => ({
    id: 'ex',
    exerciseId: 'bench',
    sets: types.map((t, i) => ({ id: `${i}`, setNumber: i + 1, type: t, completed: false } as WorkoutSet)),
    order: 0,
  } as any);

  test('warmup eyebrow starts with cyrillic "Разминка"', () => {
    const ex = makeEx(['warmup', 'warmup', 'normal']);
    expect(buildSetEyebrow(ex, 0)).toMatch(/^Разминка/);
  });

  test('working eyebrow format: "Подход N из M · рабочий"', () => {
    const ex = makeEx(['warmup', 'normal', 'normal', 'normal']);
    const s = buildSetEyebrow(ex, 1);
    expect(s).toMatch(/^Подход \d+ из \d+ · рабочий$/);
  });

  test('dropset rendered as "рабочий" for simplicity (not confusing VO)', () => {
    const ex = makeEx(['normal', 'dropset']);
    expect(buildSetEyebrow(ex, 1)).toContain('рабочий');
  });
});

// ─── Date meta label for VO ─────────────────────────────────────────────────

describe('Date meta label VO readability', () => {
  test('label is fully lowercase (header CSS uses textTransform: uppercase)', () => {
    const d = new Date(2026, 3, 22);
    const s = formatDateMetaRu(d);
    expect(s).toBe(s.toLowerCase());
  });

  test('label uses natural word ordering: weekday then day then month', () => {
    const d = new Date(2026, 3, 22);
    const s = formatDateMetaRu(d);
    // "среда · 22 апреля" — cyrillic dot-separator in the middle
    expect(s.split(' · ')).toHaveLength(2);
    const [weekday, rest] = s.split(' · ');
    expect(weekday).toMatch(/^[а-яё]+$/);
    expect(rest).toMatch(/^\d+\s[а-яё]+$/);
  });
});
