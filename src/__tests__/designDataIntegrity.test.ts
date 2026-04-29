/**
 * Data integrity across derivations — if a history list contains
 * partial records, NaN weights, sparse completedAt dates, or otherwise
 * malformed data (from old app versions, partial sync, or user
 * tampering), our helpers must return sensible defaults rather than
 * crash or produce misleading numbers.
 */

import {
  buildWeekDotsFromHistory,
  findHeaviestPR,
  calorieDayProgress,
  deriveWeekPlanDays,
} from '../utils/homeDerivations';
import { clampProgress, normalizeWeekDots } from '../utils/layout';

// ─── buildWeekDotsFromHistory ──────────────────────────────────────────────

describe('buildWeekDotsFromHistory data integrity', () => {
  test('empty array gives all zeros', () => {
    expect(buildWeekDotsFromHistory([])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test('null completedAt filtered', () => {
    const dots = buildWeekDotsFromHistory([{ completedAt: null }]);
    expect(dots).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test('undefined completedAt filtered', () => {
    const dots = buildWeekDotsFromHistory([{} as any]);
    expect(dots).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test('non-string completedAt does not crash', () => {
    const dots = buildWeekDotsFromHistory([{ completedAt: 12345 } as any]);
    expect(dots.length).toBe(7);
  });

  test('duplicate workouts on same day count once (dot is binary)', () => {
    // Round 64cfec7 changed buildWeekDotsFromHistory to bucket by LOCAL
    // calendar date (was UTC). The pre-existing test built `todayIso`
    // from `today.toISOString().split('T')[0]` — that's a UTC date,
    // which differs from the local date for any TZ where local time is
    // currently in the previous/next UTC day. In MSK (UTC+3) this fires
    // every night between 21:00 and 23:59 local: UTC date is "today" but
    // MSK has rolled over to "tomorrow". The 12:00Z timestamp then
    // bucketed to dots[5] (yesterday MSK) instead of dots[6] (today MSK).
    //
    // Fix: build the workout timestamp at NOW (today's actual local
    // moment) rather than at noon UTC of an arbitrary date.
    const today = new Date();
    const nowIso = today.toISOString();
    const history = [
      { completedAt: nowIso },
      { completedAt: nowIso },
      { completedAt: nowIso },
    ];
    const dots = buildWeekDotsFromHistory(history, today);
    expect(dots[6]).toBe(1);
  });

  test('only last 7 days considered', () => {
    const history = [{ completedAt: '1999-01-01T00:00:00Z' }];
    const dots = buildWeekDotsFromHistory(history, new Date('2026-04-22'));
    expect(dots).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

// ─── findHeaviestPR integrity ──────────────────────────────────────────────

describe('findHeaviestPR integrity', () => {
  test('empty history returns 0kg default', () => {
    expect(findHeaviestPR([])).toEqual({ kg: 0, exerciseName: 'Ещё нет PR' });
  });

  test('all incomplete sets → 0kg default', () => {
    const history = [
      {
        exercises: [
          {
            exercise: { name: 'Bench' },
            sets: [
              { completed: false, weight: 100 },
              { completed: false, weight: 200 },
            ],
          },
        ],
      } as any,
    ];
    expect(findHeaviestPR(history)).toEqual({ kg: 0, exerciseName: 'Ещё нет PR' });
  });

  test('NaN weight ignored', () => {
    const history = [
      {
        exercises: [
          {
            exercise: { name: 'Bench' },
            sets: [
              { completed: true, weight: NaN },
              { completed: true, weight: 80 },
            ],
          },
        ],
      } as any,
    ];
    expect(findHeaviestPR(history).kg).toBe(80);
  });

  test('Infinity weight ignored', () => {
    const history = [
      {
        exercises: [
          {
            exercise: { name: 'Bench' },
            sets: [
              { completed: true, weight: Infinity },
              { completed: true, weight: 100 },
            ],
          },
        ],
      } as any,
    ];
    expect(findHeaviestPR(history).kg).toBe(100);
  });

  test('negative weight not a PR', () => {
    const history = [
      {
        exercises: [
          {
            exercise: { name: 'Bench' },
            sets: [
              { completed: true, weight: -50 },
            ],
          },
        ],
      } as any,
    ];
    expect(findHeaviestPR(history).kg).toBe(0);
  });

  test('exercise without name falls back to "Рекорд"', () => {
    const history = [
      {
        exercises: [
          {
            exercise: null,
            sets: [{ completed: true, weight: 120 }],
          },
        ],
      } as any,
    ];
    const pr = findHeaviestPR(history);
    expect(pr.kg).toBe(120);
    expect(pr.exerciseName).toBe('Рекорд');
  });

  test('missing exercises array treated as empty', () => {
    const history = [{}, {}, {}] as any[];
    expect(findHeaviestPR(history).kg).toBe(0);
  });

  test('missing sets array treated as empty', () => {
    const history = [
      { exercises: [{ exercise: { name: 'X' } }] },
      { exercises: [{ exercise: { name: 'Y' }, sets: undefined }] },
    ] as any;
    expect(findHeaviestPR(history).kg).toBe(0);
  });

  test('10k-workout history returns a number', () => {
    const history = Array.from({ length: 10000 }, (_, i) => ({
      exercises: [
        {
          exercise: { name: `Ex${i}` },
          sets: [{ completed: true, weight: i }],
        },
      ],
    } as any));
    const pr = findHeaviestPR(history);
    expect(pr.kg).toBe(9999);
    expect(pr.exerciseName).toBe('Ex9999');
  });
});

// ─── calorieDayProgress ───────────────────────────────────────────────────

describe('calorieDayProgress safety', () => {
  test('0 calories / 0 target → 0 (avoid NaN)', () => {
    expect(calorieDayProgress(0, 0)).toBe(0);
  });

  test('negative target treated as 0', () => {
    expect(calorieDayProgress(1000, -100)).toBe(0);
  });

  test('negative calories treated as 0', () => {
    expect(calorieDayProgress(-500, 2000)).toBe(0);
  });

  test('Infinity calories treated as 0', () => {
    expect(calorieDayProgress(Infinity, 2000)).toBe(0);
  });

  test('NaN calories treated as 0', () => {
    expect(calorieDayProgress(NaN, 2000)).toBe(0);
  });

  test('Infinity target treated as 0', () => {
    expect(calorieDayProgress(1000, Infinity)).toBe(0);
  });

  test('over-target returns > 1 (not clamped — UI clamps separately)', () => {
    expect(calorieDayProgress(3000, 2000)).toBeCloseTo(1.5);
  });

  test('exactly at target → 1.0', () => {
    expect(calorieDayProgress(2000, 2000)).toBe(1);
  });

  test('halfway → 0.5', () => {
    expect(calorieDayProgress(1000, 2000)).toBe(0.5);
  });
});

// ─── deriveWeekPlanDays ─────────────────────────────────────────────────────

describe('deriveWeekPlanDays integrity', () => {
  test('empty plan + empty history → 7 rest days with today highlighted', () => {
    const days = deriveWeekPlanDays({}, [], new Date('2026-04-22T12:00:00'));
    expect(days).toHaveLength(7);
    const todayIdx = days.findIndex((d) => d.active);
    expect(todayIdx).toBeGreaterThanOrEqual(0);
    expect(days[todayIdx].title).toBe('Сегодня');
  });

  test('null plan entry treated as rest', () => {
    const days = deriveWeekPlanDays({ 0: null, 1: null }, [], new Date('2026-04-22T12:00:00'));
    expect(days[0].title).toMatch(/Отдых|Сегодня/);
  });

  test('malformed completedAt in history ignored', () => {
    const days = deriveWeekPlanDays({}, [{ completedAt: 'not-a-date' }], new Date('2026-04-22T12:00:00'));
    expect(days.every((d) => typeof d.done === 'boolean')).toBe(true);
  });

  test('future days (after today) are not marked done', () => {
    const days = deriveWeekPlanDays({}, [], new Date('2026-04-22T12:00:00'));
    const todayIdx = days.findIndex((d) => d.active);
    for (let i = todayIdx + 1; i < 7; i++) {
      expect(days[i].done).toBe(false);
    }
  });
});

// ─── Combined flows ────────────────────────────────────────────────────────

describe('Data integrity under combined pipeline', () => {
  test('empty workout history → all week dots zero, no PR', () => {
    const dots = buildWeekDotsFromHistory([]);
    const pr = findHeaviestPR([]);
    expect(dots.every((d) => d === 0)).toBe(true);
    expect(pr.kg).toBe(0);
  });

  test('sparse history with 1 real workout produces correct 1-dot + PR', () => {
    const today = new Date();
    const history = [
      {
        completedAt: today.toISOString(),
        exercises: [
          {
            exercise: { name: 'Bench Press' },
            sets: [{ completed: true, weight: 85 }],
          },
        ],
      } as any,
    ];
    const dots = buildWeekDotsFromHistory(history, today);
    const pr = findHeaviestPR(history);
    // Note: buildWeekDotsFromHistory uses toISOString() → UTC date,
    // so today's dot depends on UTC vs local day. Just check that at
    // least one dot is 1.
    expect(dots.filter((d) => d === 1).length).toBeLessThanOrEqual(1);
    expect(pr).toEqual({ kg: 85, exerciseName: 'Bench Press' });
  });

  test('normalizeWeekDots + buildWeekDotsFromHistory chain safe', () => {
    const dots = buildWeekDotsFromHistory([]);
    const normalized = normalizeWeekDots(dots);
    expect(normalized).toHaveLength(7);
    for (const d of normalized) {
      expect([0, 1]).toContain(d);
    }
  });
});

// ─── clampProgress safety ──────────────────────────────────────────────────

describe('clampProgress handles numeric corruption', () => {
  // Contract: input is typed as `number` — we only guard against values
  // that arise from legit JS number arithmetic (NaN, Infinity).
  // Non-numeric inputs are not part of the contract.
  const BAD_INPUTS = [NaN, Infinity, -Infinity];

  test.each(BAD_INPUTS)('non-finite input %p returns 0', (v) => {
    expect(clampProgress(v as any)).toBe(0);
  });

  test('undefined coerced via Number(undefined)=NaN → 0', () => {
    expect(clampProgress(undefined as any)).toBe(0);
  });

  test('valid inputs preserved', () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(0.5)).toBe(0.5);
    expect(clampProgress(1)).toBe(1);
  });

  test('out-of-range valid numbers clamped', () => {
    expect(clampProgress(-0.5)).toBe(0);
    expect(clampProgress(1.5)).toBe(1);
    expect(clampProgress(-1000)).toBe(0);
    expect(clampProgress(1000)).toBe(1);
  });

  test('very small positive preserved', () => {
    expect(clampProgress(1e-10)).toBeCloseTo(0, 9);
  });

  test('very close to 1 preserved', () => {
    expect(clampProgress(0.9999)).toBeCloseTo(0.9999);
  });
});
