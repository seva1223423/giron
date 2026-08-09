/**
 * СВЯЗКИ v2 — five more cross-signal rules.
 *
 * Same contract as the first four: each rule is pinned with the case it fires
 * on and a near-miss where it must stay silent, because a wrong insight is
 * worse than none. Fixtures are kept narrow so the rule under test is the one
 * that produced the asserted line (the block prints only the top-3).
 */

jest.mock('../db', () => {
  const model = new Proxy({}, {
    get: (_t, method: string) => jest.fn(() => Promise.resolve(method === 'findMany' ? [] : null)),
  });
  return { prisma: new Proxy({}, { get: () => model }) };
});

import { buildDynamicContext } from '../ai/contextEngine';

const TODAY = new Date().toISOString().split('T')[0];
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const base = {
  userId: 'u1',
  intent: 'general' as any,
  message: 'как дела с прогрессом?',
  todayDate: TODAY,
  user: { goal: 'GENERAL_FITNESS', weightKg: 90 },
  recentWorkouts: [],
  allCompletedExerciseSets: [],
  todayMeals: [],
  bodyWeightHistory: [],
};

const doneWorkout = (n: number) => ({
  name: `Тр ${n}`,
  completedAt: daysAgo(n),
  exercises: [{ exerciseId: 'x', exercise: { name: 'Жим' }, sets: [{ completed: true, weight: 60, reps: 8 }] }],
});

describe('недологирование еды (дефицит на бумаге, вес стоит)', () => {
  const flatWeights = [
    { weightKg: 90, date: daysAgo(0) },
    { weightKg: 90.1, date: daysAgo(25) },
  ];
  const loggedWeek = Array.from({ length: 6 }, (_, i) => ({
    date: new Date(Date.now() - i * 86_400_000).toISOString().split('T')[0],
    calories: 1300,
    protein: 100,
    count: 3,
  }));

  test('вес стоит 3+ недели при логах сильно ниже цели → подозрение на дневник', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      user: { goal: 'WEIGHT_LOSS', weightKg: 90 },
      bodyWeightHistory: flatWeights,
      nutritionTargets: { calories: 1900, protein: 150, fats: 70, carbs: 200 },
      weekMealDays: loggedWeek,
    } as any);
    expect(ctx).toContain('Числа не сходятся');
    expect(ctx).toContain('незаписанная еда');
  });

  test('вес реально падает → молчим', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      user: { goal: 'WEIGHT_LOSS', weightKg: 88 },
      bodyWeightHistory: [
        { weightKg: 88, date: daysAgo(0) },
        { weightKg: 90, date: daysAgo(25) },
      ],
      nutritionTargets: { calories: 1900, protein: 150, fats: 70, carbs: 200 },
      weekMealDays: loggedWeek,
    } as any);
    expect(ctx).not.toContain('Числа не сходятся');
  });

  test('мало залогированных дней → дневник не обвиняем', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      user: { goal: 'WEIGHT_LOSS', weightKg: 90 },
      bodyWeightHistory: flatWeights,
      nutritionTargets: { calories: 1900, protein: 150, fats: 70, carbs: 200 },
      weekMealDays: loggedWeek.slice(0, 3),
    } as any);
    expect(ctx).not.toContain('Числа не сходятся');
  });
});

describe('ноль кардио при цели похудеть', () => {
  test('силовые есть, кардио за 2 недели нет → предлагаем шаги', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      user: { goal: 'WEIGHT_LOSS', weightKg: 90 },
      recentWorkouts: [doneWorkout(1), doneWorkout(3), doneWorkout(5)],
      recentCardio: [],
    } as any);
    expect(ctx).toContain('ни одной кардио-сессии');
    expect(ctx).toContain('8-10 тыс шагов');
  });

  test('кардио было → молчим', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      user: { goal: 'WEIGHT_LOSS', weightKg: 90 },
      recentWorkouts: [doneWorkout(1), doneWorkout(3)],
      recentCardio: [{ type: 'running', date: TODAY, durationMinutes: 30 }],
    } as any);
    expect(ctx).not.toContain('ни одной кардио-сессии');
  });

  test('цель не похудение → молчим', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      user: { goal: 'MUSCLE_GAIN', weightKg: 90 },
      recentWorkouts: [doneWorkout(1), doneWorkout(3)],
      recentCardio: [],
    } as any);
    expect(ctx).not.toContain('ни одной кардио-сессии');
  });
});

describe('стрик без дня отдыха', () => {
  test('6 дней подряд → предложить плановый отдых', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      recentWorkouts: [0, 1, 2, 3, 4, 5].map(doneWorkout),
    } as any);
    expect(ctx).toContain('ПОДРЯД без дня отдыха');
  });

  test('4 дня подряд → молчим', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      recentWorkouts: [0, 1, 2, 3].map(doneWorkout),
    } as any);
    expect(ctx).not.toContain('ПОДРЯД без дня отдыха');
  });

  test('6 дней, но стрик прервался неделю назад → молчим', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      recentWorkouts: [7, 8, 9, 10, 11, 12].map(doneWorkout),
    } as any);
    expect(ctx).not.toContain('ПОДРЯД без дня отдыха');
  });
});

describe('одна провальная ночь при нормальной неделе', () => {
  const goodWeek = (lastNight: number) => [
    { date: TODAY, durationHours: lastNight },
    ...Array.from({ length: 6 }, (_, i) => ({
      date: new Date(Date.now() - (i + 1) * 86_400_000).toISOString().split('T')[0],
      durationHours: 7.5,
    })),
  ];

  test('ночь 5.0 ч при средней 7+ → автопилот-вариант', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      recentWorkouts: [doneWorkout(1), doneWorkout(3)],
      sleepEntries: goodWeek(5.0),
    } as any);
    expect(ctx).toContain('автопилот');
    expect(ctx).toContain('−20% объёма');
  });

  test('нормальная ночь → молчим', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      recentWorkouts: [doneWorkout(1), doneWorkout(3)],
      sleepEntries: goodWeek(7.0),
    } as any);
    expect(ctx).not.toContain('автопилот');
  });
});

describe('плато рабочих весов на главном движении', () => {
  const setsRow = (name: string, n: number, weight: number) => ({
    exercise: { name },
    workout: { completedAt: daysAgo(n) },
    sets: [
      { weight, reps: 5, completed: true },
      { weight, reps: 5, completed: true },
      { weight, reps: 5, completed: true },
    ],
  });

  test('лучший вес месяц назад 100, сейчас 97.5 → плато', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      recentWorkouts: [doneWorkout(1), doneWorkout(4)],
      allCompletedExerciseSets: [
        setsRow('Присед со штангой', 40, 100),
        setsRow('Присед со штангой', 7, 97.5),
      ],
    } as any);
    expect(ctx).toContain('рабочие веса не растут');
    expect(ctx).toContain('Присед со штангой');
  });

  test('вес вырос → молчим', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      recentWorkouts: [doneWorkout(1), doneWorkout(4)],
      allCompletedExerciseSets: [
        setsRow('Присед со штангой', 40, 100),
        setsRow('Присед со штангой', 7, 102.5),
      ],
    } as any);
    expect(ctx).not.toContain('рабочие веса не растут');
  });

  test('мало подходов в старом окне → молчим (не на чем судить)', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      recentWorkouts: [doneWorkout(1), doneWorkout(4)],
      allCompletedExerciseSets: [setsRow('Присед со штангой', 7, 97.5)],
    } as any);
    expect(ctx).not.toContain('рабочие веса не растут');
  });
});
