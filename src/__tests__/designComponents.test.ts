/**
 * Unit tests for the pure logic inside Direction A design components.
 *
 * These components (CurrentSetHero, HomeHeader, StreakPRGrid, etc.)
 * are rendered via store-connected screens, so full render tests are
 * brittle. The approach: extract the non-trivial logic into pure
 * functions in utils or alongside the component, then lock its
 * behaviour with these tests.
 */

import { formatDateMetaRu } from '../utils/date';
import {
  findLiveSet,
  rpeFillRatio,
  buildSetEyebrow,
} from '../screens/tracker/components/heroLogic';
import type { WorkoutExercise, WorkoutSet } from '../types';

// ─── formatDateMetaRu ────────────────────────────────────────────────────────

describe('formatDateMetaRu', () => {
  test('formats Tuesday 22 April as "вторник · 22 апреля"', () => {
    // 2026-04-22 is a Wednesday per JS Date, 2026-04-21 was a Tuesday
    const tues = new Date(2026, 3, 21); // month is 0-indexed: 3 = April
    expect(formatDateMetaRu(tues)).toBe('вторник · 21 апреля');
  });

  test('handles all 7 weekdays', () => {
    // Pick a week and verify every day
    const base = new Date(2026, 3, 20); // Monday
    const expected = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const s = formatDateMetaRu(d);
      expect(s.startsWith(expected[i])).toBe(true);
    }
  });

  test('handles all 12 months', () => {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    for (let m = 0; m < 12; m++) {
      const d = new Date(2026, m, 15);
      expect(formatDateMetaRu(d)).toContain(months[m]);
    }
  });

  test('single-digit day has no leading zero', () => {
    const d = new Date(2026, 3, 5);
    expect(formatDateMetaRu(d)).toBe('воскресенье · 5 апреля');
  });

  test('two-digit day renders as-is', () => {
    const d = new Date(2026, 3, 30);
    expect(formatDateMetaRu(d)).toBe('четверг · 30 апреля');
  });

  test('uses now() when no date passed', () => {
    // Just asserts the function returns a well-formed string — can't lock
    // current date. Checks the "word · Nd word" shape.
    const s = formatDateMetaRu();
    expect(s).toMatch(/^[а-я]+\s·\s\d{1,2}\s[а-я]+$/);
  });
});

// ─── findLiveSet ─────────────────────────────────────────────────────────────

const set = (over: Partial<WorkoutSet>): WorkoutSet => ({
  id: 's',
  setNumber: 1,
  type: 'normal',
  reps: 8,
  weight: 100,
  completed: false,
  ...over,
});

describe('findLiveSet', () => {
  test('returns null for empty list', () => {
    expect(findLiveSet([])).toBeNull();
  });

  test('returns null for null/undefined list safely', () => {
    // Force unknown to test defensive behaviour
    expect(findLiveSet(undefined as unknown as WorkoutSet[])).toBeNull();
    expect(findLiveSet(null as unknown as WorkoutSet[])).toBeNull();
  });

  test('picks first uncompleted when no set is done', () => {
    const sets = [set({ id: 'a' }), set({ id: 'b' }), set({ id: 'c' })];
    const live = findLiveSet(sets);
    expect(live?.index).toBe(0);
    expect(live?.set.id).toBe('a');
  });

  test('picks first uncompleted after completions', () => {
    const sets = [
      set({ id: 'a', completed: true }),
      set({ id: 'b', completed: true }),
      set({ id: 'c' }),
      set({ id: 'd' }),
    ];
    const live = findLiveSet(sets);
    expect(live?.index).toBe(2);
    expect(live?.set.id).toBe('c');
  });

  test('falls back to last set when all completed', () => {
    const sets = [
      set({ id: 'a', completed: true }),
      set({ id: 'b', completed: true }),
      set({ id: 'c', completed: true }),
    ];
    const live = findLiveSet(sets);
    expect(live?.index).toBe(2);
    expect(live?.set.id).toBe('c');
  });

  test('handles single-set list', () => {
    const sets = [set({ id: 'only' })];
    expect(findLiveSet(sets)?.index).toBe(0);
  });
});

// ─── rpeFillRatio ────────────────────────────────────────────────────────────

describe('rpeFillRatio', () => {
  test('RPE 6 → 0 (empty scale)', () => {
    expect(rpeFillRatio(6)).toBe(0);
  });

  test('RPE 10 → 1 (full scale)', () => {
    expect(rpeFillRatio(10)).toBe(1);
  });

  test('RPE 8 → 0.5 (half)', () => {
    expect(rpeFillRatio(8)).toBe(0.5);
  });

  test('RPE 7.5 → 0.375', () => {
    expect(rpeFillRatio(7.5)).toBe(0.375);
  });

  test('clamps below 6 to 0', () => {
    expect(rpeFillRatio(0)).toBe(0);
    expect(rpeFillRatio(-5)).toBe(0);
    expect(rpeFillRatio(5.5)).toBe(0);
  });

  test('clamps above 10 to 1', () => {
    expect(rpeFillRatio(11)).toBe(1);
    expect(rpeFillRatio(100)).toBe(1);
  });

  test('NaN → 0 (guarded)', () => {
    expect(rpeFillRatio(NaN)).toBe(0);
  });

  test('Infinity → 0 (guarded)', () => {
    expect(rpeFillRatio(Infinity)).toBe(0);
    expect(rpeFillRatio(-Infinity)).toBe(0);
  });
});

// ─── buildSetEyebrow ─────────────────────────────────────────────────────────

describe('buildSetEyebrow', () => {
  const exercise = (sets: WorkoutSet[]): WorkoutExercise => ({
    id: 'ex',
    exerciseId: 'bench',
    exercise: {
      id: 'bench',
      name: 'Bench',
      primaryMuscles: ['chest'],
      secondaryMuscles: [],
      equipment: 'barbell',
      category: 'strength',
    } as any,
    sets,
    order: 0,
    restSeconds: 120,
  });

  test('returns "" for invalid index', () => {
    const ex = exercise([set({})]);
    expect(buildSetEyebrow(ex, 99)).toBe('');
  });

  test('warmup set shows Разминка eyebrow', () => {
    const ex = exercise([
      set({ type: 'warmup', id: 'a' }),
      set({ type: 'warmup', id: 'b' }),
      set({ type: 'normal', id: 'c' }),
    ]);
    expect(buildSetEyebrow(ex, 0)).toBe('Разминка · подход 1');
    expect(buildSetEyebrow(ex, 1)).toBe('Разминка · подход 2');
  });

  test('working set shows "Подход W из N · рабочий"', () => {
    const ex = exercise([
      set({ type: 'warmup', id: 'w' }),
      set({ type: 'normal', id: 'a' }),
      set({ type: 'normal', id: 'b' }),
      set({ type: 'normal', id: 'c' }),
      set({ type: 'normal', id: 'd' }),
    ]);
    expect(buildSetEyebrow(ex, 1)).toBe('Подход 1 из 4 · рабочий');
    expect(buildSetEyebrow(ex, 3)).toBe('Подход 3 из 4 · рабочий');
    expect(buildSetEyebrow(ex, 4)).toBe('Подход 4 из 4 · рабочий');
  });

  test('dropset counted as working (type !== warmup)', () => {
    const ex = exercise([
      set({ type: 'normal', id: 'a' }),
      set({ type: 'dropset', id: 'b' }),
    ]);
    expect(buildSetEyebrow(ex, 1)).toBe('Подход 2 из 2 · рабочий');
  });
});
