/**
 * Integration-style tests for the HomeScreen derivations — stitching
 * buildWeekDotsFromHistory + findHeaviestPR + deriveWeekPlanDays into
 * a full "what does the Home screen show" pipeline. Catches
 * regressions where the sub-helpers change contracts.
 */

import {
  buildWeekDotsFromHistory,
  findHeaviestPR,
  calorieDayProgress,
  deriveWeekPlanDays,
  todayMondayIndex,
  RU_DAY_LABELS,
} from '../utils/homeDerivations';
import { clampProgress, normalizeWeekDots, pluralizeDaysRu } from '../utils/layout';

// ─── Complete home-screen data pipeline ────────────────────────────────────

describe('Home-screen pipeline — empty state', () => {
  const emptyHistory: Array<any> = [];
  const emptyPlan = {};

  test('empty history → clean defaults everywhere', () => {
    const weekDots = buildWeekDotsFromHistory(emptyHistory);
    const pr = findHeaviestPR(emptyHistory);
    const planDays = deriveWeekPlanDays(emptyPlan, emptyHistory);
    const calProgress = calorieDayProgress(0, 2000);

    expect(weekDots).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(pr).toEqual({ kg: 0, exerciseName: 'Ещё нет PR' });
    expect(planDays).toHaveLength(7);
    expect(planDays.every((d) => ['Сегодня', 'Отдых'].includes(d.title))).toBe(true);
    expect(calProgress).toBe(0);
  });

  test('normalize empty weekDots → still 7 zeros', () => {
    const dots = buildWeekDotsFromHistory([]);
    const normalized = normalizeWeekDots(dots);
    expect(normalized).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('Home-screen pipeline — populated state', () => {
  test('5 workouts this week → 5 dots lit + PR found', () => {
    const now = new Date('2026-04-22T12:00:00');
    const history = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      history.push({
        completedAt: d.toISOString(),
        exercises: [
          {
            exercise: { name: `Ex${i}` },
            sets: [{ completed: true, weight: 50 + i * 10 }],
          },
        ],
      } as any);
    }

    const dots = buildWeekDotsFromHistory(history, now);
    const pr = findHeaviestPR(history);

    // 5 dots lit in the last 5 days — may depend on UTC vs local rollover
    const lit = dots.filter((d) => d === 1).length;
    expect(lit).toBeGreaterThanOrEqual(4); // allow 1 for timezone edge
    expect(lit).toBeLessThanOrEqual(5);
    expect(pr.kg).toBe(90); // 50 + 4*10 = 90 from last workout
  });

  test('PR from older workout outranks recent light sets', () => {
    const history = [
      {
        completedAt: '2026-04-20T12:00:00Z',
        exercises: [
          {
            exercise: { name: 'Old Heavy' },
            sets: [{ completed: true, weight: 200 }],
          },
        ],
      },
      {
        completedAt: '2026-04-22T12:00:00Z',
        exercises: [
          {
            exercise: { name: 'Recent Light' },
            sets: [{ completed: true, weight: 50 }],
          },
        ],
      },
    ] as any[];

    const pr = findHeaviestPR(history);
    expect(pr.kg).toBe(200);
    expect(pr.exerciseName).toBe('Old Heavy');
  });
});

// ─── Week plan with partial data ───────────────────────────────────────────

describe('Week plan tiles with realistic data', () => {
  test('weekPlan for Mon/Wed/Fri produces correct tile titles', () => {
    const weekPlan = {
      0: { name: 'Грудь + Трицепс' },
      2: { name: 'Спина + Бицепс' },
      4: { name: 'Ноги' },
    };
    const now = new Date('2026-04-22T12:00:00'); // a Wednesday
    const days = deriveWeekPlanDays(weekPlan, [], now);

    const todayIdx = todayMondayIndex(now);
    expect(days[todayIdx].active).toBe(true);
    expect(days[todayIdx].title).toBe('Сегодня');

    // Rest days (Tue/Thu/Sat/Sun) should be 'Отдых'
    const restDays = [1, 3, 5, 6];
    for (const i of restDays) {
      if (i !== todayIdx) {
        expect(days[i].title).toBe('Отдых');
      }
    }
  });

  test('all labels Russian Monday-first', () => {
    const days = deriveWeekPlanDays({}, []);
    expect(days.map((d) => d.dayLabel)).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
  });

  test('only one day marked active (today)', () => {
    const days = deriveWeekPlanDays({}, []);
    const activeCount = days.filter((d) => d.active).length;
    expect(activeCount).toBe(1);
  });
});

// ─── Calorie ring over multiple percentages ───────────────────────────────

describe('Calorie ring across a day', () => {
  const target = 2000;

  test('morning progress small', () => {
    const p = clampProgress(calorieDayProgress(500, target));
    expect(p).toBe(0.25);
  });

  test('noon progress half', () => {
    const p = clampProgress(calorieDayProgress(1000, target));
    expect(p).toBe(0.5);
  });

  test('evening progress near full', () => {
    const p = clampProgress(calorieDayProgress(1800, target));
    expect(p).toBe(0.9);
  });

  test('late-night over-eat clamped to 1', () => {
    const p = clampProgress(calorieDayProgress(2500, target));
    expect(p).toBe(1);
  });
});

// ─── Streak label across ranges ────────────────────────────────────────────

describe('Streak pluralization for label', () => {
  test('1-streak label', () => {
    expect(`1 ${pluralizeDaysRu(1)}`).toBe('1 день');
  });

  test('2-streak label', () => {
    expect(`2 ${pluralizeDaysRu(2)}`).toBe('2 дня');
  });

  test('5-streak label', () => {
    expect(`5 ${pluralizeDaysRu(5)}`).toBe('5 дней');
  });

  test('11-streak teen label', () => {
    expect(`11 ${pluralizeDaysRu(11)}`).toBe('11 дней');
  });

  test('21-streak one-suffix', () => {
    expect(`21 ${pluralizeDaysRu(21)}`).toBe('21 день');
  });

  test('100-streak plural', () => {
    expect(`100 ${pluralizeDaysRu(100)}`).toBe('100 дней');
  });

  test('365-day streak plural', () => {
    expect(`365 ${pluralizeDaysRu(365)}`).toBe('365 дней');
  });
});

// ─── End-to-end pipeline correctness ──────────────────────────────────────

describe('Full home-screen data shape', () => {
  test('resulting data shape matches design spec', () => {
    const now = new Date('2026-04-22T12:00:00');
    const history = [
      {
        completedAt: now.toISOString(),
        exercises: [
          {
            exercise: { name: 'Bench' },
            sets: [{ completed: true, weight: 80 }],
          },
        ],
      } as any,
    ];

    const shape = {
      weekDots: buildWeekDotsFromHistory(history, now),
      pr: findHeaviestPR(history),
      planDays: deriveWeekPlanDays({}, history, now),
      calProgress: clampProgress(calorieDayProgress(1000, 2000)),
      streakLabel: `3 ${pluralizeDaysRu(3)}`,
    };

    expect(shape.weekDots).toHaveLength(7);
    expect(shape.weekDots.every((d) => d === 0 || d === 1)).toBe(true);
    expect(shape.pr.kg).toBe(80);
    expect(shape.planDays).toHaveLength(7);
    expect(shape.calProgress).toBe(0.5);
    expect(shape.streakLabel).toBe('3 дня');
  });
});

// ─── Day label consistency (weekday Russian helpers) ────────────────────

describe('Day labels constant shape', () => {
  test('RU_DAY_LABELS identical to planDays dayLabels', () => {
    const days = deriveWeekPlanDays({}, []);
    const labels = days.map((d) => d.dayLabel);
    expect(labels).toEqual([...RU_DAY_LABELS]);
  });
});
