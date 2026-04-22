/**
 * Tests for HomeScreen derivation helpers. These are pure functions so
 * they can be exercised without rendering the store-connected screen.
 *
 * Locks:
 *   - findHeaviestPR safe across empty / malformed histories
 *   - buildWeekDotsFromHistory always 7 cells, correct "today" slot
 *   - todayMondayIndex returns 0..6 for every JS weekday value
 *   - calorieDayProgress divides safely
 */

import {
  buildWeekDotsFromHistory,
  findHeaviestPR,
  todayMondayIndex,
  calorieDayProgress,
  deriveWeekPlanDays,
  RU_DAY_LABELS,
} from '../utils/homeDerivations';

// ─── buildWeekDotsFromHistory ───────────────────────────────────────────────

describe('buildWeekDotsFromHistory', () => {
  test('always returns 7 cells', () => {
    expect(buildWeekDotsFromHistory([])).toHaveLength(7);
    expect(buildWeekDotsFromHistory([{ completedAt: '2026-04-22T10:00:00Z' }])).toHaveLength(7);
    const many = Array.from({ length: 50 }, () => ({ completedAt: new Date().toISOString() }));
    expect(buildWeekDotsFromHistory(many)).toHaveLength(7);
  });

  test('empty history → all zeros', () => {
    const dots = buildWeekDotsFromHistory([]);
    expect(dots.every((d) => d === 0)).toBe(true);
  });

  test('today (index 6) = 1 when today has a completion', () => {
    const now = new Date('2026-04-22T10:00:00Z');
    const dots = buildWeekDotsFromHistory(
      [{ completedAt: '2026-04-22T09:30:00Z' }],
      now,
    );
    expect(dots[6]).toBe(1);
    // Other days should be 0
    expect(dots.slice(0, 6).every((d) => d === 0)).toBe(true);
  });

  test('6 days ago (index 0) = 1', () => {
    const now = new Date('2026-04-22T10:00:00Z');
    const dots = buildWeekDotsFromHistory(
      [{ completedAt: '2026-04-16T09:30:00Z' }],
      now,
    );
    expect(dots[0]).toBe(1);
    expect(dots[6]).toBe(0);
  });

  test('null / undefined completedAt ignored safely', () => {
    expect(() => buildWeekDotsFromHistory([{ completedAt: null }])).not.toThrow();
    expect(() => buildWeekDotsFromHistory([{ completedAt: undefined }])).not.toThrow();
    const dots = buildWeekDotsFromHistory([
      { completedAt: null },
      { completedAt: undefined },
    ] as any);
    expect(dots).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test('completedAt not starting with YYYY-MM-DD still safe', () => {
    // Unusual formats (e.g. "Wed Apr 22 ...") don't match any dot but
    // shouldn't crash
    expect(() => buildWeekDotsFromHistory([{ completedAt: 'not-a-date' }])).not.toThrow();
  });

  test('7 completions across 7 consecutive days → all ones', () => {
    const now = new Date('2026-04-22T10:00:00Z');
    const history = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      history.push({ completedAt: d.toISOString() });
    }
    const dots = buildWeekDotsFromHistory(history, now);
    expect(dots.every((d) => d === 1)).toBe(true);
  });
});

// ─── findHeaviestPR ─────────────────────────────────────────────────────────

describe('findHeaviestPR', () => {
  test('empty history → 0 kg and default label', () => {
    const pr = findHeaviestPR([]);
    expect(pr.kg).toBe(0);
    expect(pr.exerciseName).toBe('Ещё нет PR');
  });

  test('undefined / null input safely produces default', () => {
    expect(() => findHeaviestPR(undefined as any)).not.toThrow();
    expect(() => findHeaviestPR(null as any)).not.toThrow();
  });

  test('workouts with no exercises array → default', () => {
    expect(findHeaviestPR([{}, {}, {}] as any).kg).toBe(0);
  });

  test('picks heaviest completed set across exercises', () => {
    const pr = findHeaviestPR([
      {
        exercises: [
          {
            exercise: { name: 'Squat' } as any,
            sets: [
              { completed: true, weight: 100 } as any,
              { completed: true, weight: 110 } as any,
            ],
          },
          {
            exercise: { name: 'Bench' } as any,
            sets: [
              { completed: true, weight: 90 } as any,
              { completed: true, weight: 95 } as any,
            ],
          },
        ],
      },
    ] as any);
    expect(pr.kg).toBe(110);
    expect(pr.exerciseName).toBe('Squat');
  });

  test('ignores non-completed sets', () => {
    const pr = findHeaviestPR([
      {
        exercises: [
          {
            exercise: { name: 'Deadlift' } as any,
            sets: [
              { completed: false, weight: 250 } as any, // heavier but not done
              { completed: true, weight: 180 } as any,
            ],
          },
        ],
      },
    ] as any);
    expect(pr.kg).toBe(180);
    expect(pr.exerciseName).toBe('Deadlift');
  });

  test('guards against missing weight / NaN', () => {
    const pr = findHeaviestPR([
      {
        exercises: [
          {
            exercise: { name: 'X' } as any,
            sets: [
              { completed: true, weight: NaN } as any,
              { completed: true, weight: undefined } as any,
              { completed: true, weight: Infinity } as any,
              { completed: true, weight: 50 } as any,
            ],
          },
        ],
      },
    ] as any);
    expect(pr.kg).toBe(50);
  });

  test('missing exercise name falls back to "Рекорд"', () => {
    const pr = findHeaviestPR([
      {
        exercises: [
          {
            sets: [{ completed: true, weight: 120 }],
          },
        ],
      },
    ] as any);
    expect(pr.kg).toBe(120);
    expect(pr.exerciseName).toBe('Рекорд');
  });
});

// ─── todayMondayIndex ───────────────────────────────────────────────────────

describe('todayMondayIndex', () => {
  test('Monday is 0', () => {
    const mon = new Date(2026, 3, 20); // 2026-04-20 was a Monday
    expect(todayMondayIndex(mon)).toBe(0);
  });

  test('Tuesday is 1', () => {
    const tue = new Date(2026, 3, 21);
    expect(todayMondayIndex(tue)).toBe(1);
  });

  test('Wednesday is 2', () => {
    const wed = new Date(2026, 3, 22);
    expect(todayMondayIndex(wed)).toBe(2);
  });

  test('Saturday is 5', () => {
    const sat = new Date(2026, 3, 25);
    expect(todayMondayIndex(sat)).toBe(5);
  });

  test('Sunday is 6 (not -1, not 0)', () => {
    const sun = new Date(2026, 3, 26);
    expect(todayMondayIndex(sun)).toBe(6);
  });

  test('stays in 0..6 for any date', () => {
    for (let days = 0; days < 365; days++) {
      const d = new Date(2026, 0, 1);
      d.setDate(d.getDate() + days);
      const idx = todayMondayIndex(d);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(6);
    }
  });
});

// ─── calorieDayProgress ─────────────────────────────────────────────────────

describe('calorieDayProgress', () => {
  test('normal case: 1200 / 2000 = 0.6', () => {
    expect(calorieDayProgress(1200, 2000)).toBeCloseTo(0.6);
  });

  test('over-target: 2400 / 2000 = 1.2 (uncapped — caller clamps)', () => {
    expect(calorieDayProgress(2400, 2000)).toBeCloseTo(1.2);
  });

  test('zero target → 0 (no divide-by-zero)', () => {
    expect(calorieDayProgress(500, 0)).toBe(0);
  });

  test('negative target → 0', () => {
    expect(calorieDayProgress(500, -100)).toBe(0);
  });

  test('negative now → 0', () => {
    expect(calorieDayProgress(-10, 2000)).toBe(0);
  });

  test('NaN target → 0', () => {
    expect(calorieDayProgress(500, NaN)).toBe(0);
  });

  test('NaN now → 0', () => {
    expect(calorieDayProgress(NaN, 2000)).toBe(0);
  });

  test('Infinity now → 0', () => {
    expect(calorieDayProgress(Infinity, 2000)).toBe(0);
  });
});

// ─── deriveWeekPlanDays ─────────────────────────────────────────────────────

describe('RU_DAY_LABELS constant', () => {
  test('has 7 Monday-first labels', () => {
    expect(RU_DAY_LABELS).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
  });
});

describe('deriveWeekPlanDays', () => {
  // Use a fixed Monday so the logic is deterministic regardless of
  // when the suite runs.
  const MON = new Date(2026, 3, 20); // 2026-04-20 is a Monday
  const TUE = new Date(2026, 3, 21);
  const SUN = new Date(2026, 3, 26);

  test('returns exactly 7 days', () => {
    const out = deriveWeekPlanDays({}, [], MON);
    expect(out).toHaveLength(7);
  });

  test('each day has dayLabel, title, active, done', () => {
    const out = deriveWeekPlanDays({}, [], MON);
    for (const d of out) {
      expect(d).toHaveProperty('dayLabel');
      expect(d).toHaveProperty('title');
      expect(d).toHaveProperty('active');
      expect(d).toHaveProperty('done');
    }
  });

  test('Monday today → index 0 active + "Сегодня"', () => {
    const out = deriveWeekPlanDays({}, [], MON);
    expect(out[0].active).toBe(true);
    expect(out[0].title).toBe('Сегодня');
    expect(out[0].dayLabel).toBe('Пн');
    // Others not active
    for (let i = 1; i < 7; i++) expect(out[i].active).toBe(false);
  });

  test('Sunday today → index 6 active', () => {
    const out = deriveWeekPlanDays({}, [], SUN);
    expect(out[6].active).toBe(true);
    expect(out[6].title).toBe('Сегодня');
    for (let i = 0; i < 6; i++) expect(out[i].active).toBe(false);
  });

  test('weekPlan name used for non-today days', () => {
    const plan = {
      0: null,
      1: { name: 'Ноги' },
      3: { name: 'Грудь + трицепс' },
    };
    const out = deriveWeekPlanDays(plan as any, [], TUE);
    // Today (tuesday=1) has "Сегодня"
    expect(out[1].title).toBe('Сегодня');
    // Other days show the plan name or default
    expect(out[0].title).toBe('Отдых'); // null
    expect(out[3].title).toBe('Грудь + трицепс');
    expect(out[5].title).toBe('Отдых'); // missing key
  });

  test('done = true for past day with matching completion in history', () => {
    const wed = new Date(2026, 3, 22); // Wednesday
    const history = [{ completedAt: new Date(2026, 3, 20, 10).toISOString() }]; // Monday workout
    const out = deriveWeekPlanDays({}, history, wed);
    expect(out[0].done).toBe(true); // Monday done
    expect(out[1].done).toBe(false); // Tuesday not
  });

  test('done = false for current and future days', () => {
    const mon = MON;
    const history = [{ completedAt: mon.toISOString() }];
    const out = deriveWeekPlanDays({}, history, mon);
    // Today is not "done" — we're live
    expect(out[0].done).toBe(false);
    // Future days also not done
    expect(out[6].done).toBe(false);
  });

  test('handles invalid completedAt gracefully', () => {
    const history = [
      { completedAt: 'not-a-date' } as any,
      { completedAt: null },
      { completedAt: undefined },
    ];
    expect(() => deriveWeekPlanDays({}, history, MON)).not.toThrow();
  });

  test('empty plan + empty history → all "Отдых" except today', () => {
    const out = deriveWeekPlanDays({}, [], new Date(2026, 3, 23)); // Thursday
    for (let i = 0; i < 7; i++) {
      if (i === 3) {
        expect(out[i].title).toBe('Сегодня');
      } else {
        expect(out[i].title).toBe('Отдых');
      }
      expect(out[i].done).toBe(false);
    }
  });

  test('null weekPlan[key] treated as missing (shows "Отдых")', () => {
    const out = deriveWeekPlanDays({ 0: null, 1: null } as any, [], MON);
    expect(out[0].title).toBe('Сегодня');
    expect(out[1].title).toBe('Отдых');
  });
});
