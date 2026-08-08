/**
 * One canonical list of the numbers the model may say about the person.
 *
 * The prompt forbade invented numbers, but the citable facts were scattered
 * across half a dozen blocks — and a model hunting through a long prompt
 * rounds, merges and misremembers. This block puts every user-facing figure
 * in one place, first, with the rule in its header. Everything in it is
 * derived from data already in the context, so it can never disagree with
 * the blocks below it.
 */

jest.mock('../db', () => {
  const model = new Proxy({}, {
    get: (_t, method: string) => jest.fn(() => Promise.resolve(method === 'findMany' ? [] : null)),
  });
  return { prisma: new Proxy({}, { get: () => model }) };
});

import { buildDynamicContext } from '../ai/contextEngine';

const TODAY = '2026-08-07';
const base = {
  userId: 'u1',
  intent: 'general' as any,
  message: 'привет',
  todayDate: TODAY,
  user: { goal: 'MUSCLE_GAIN', weightKg: 90, heightCm: 185 },
  recentWorkouts: [],
  allCompletedExerciseSets: [],
  todayMeals: [],
  bodyWeightHistory: [],
};

describe('КЛЮЧЕВЫЕ ЧИСЛА', () => {
  test('weight comes with its 30-day delta', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      bodyWeightHistory: [
        { weightKg: 92, date: new Date('2026-08-06') },
        { weightKg: 90.5, date: new Date('2026-07-01') },
      ],
    } as any);
    expect(ctx).toContain('КЛЮЧЕВЫЕ ЧИСЛА');
    expect(ctx).toContain('Вес: 92 кг (+1.5 кг за 30 дн)');
  });

  test('today\'s food is compared against the target', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      todayMeals: [
        { type: 'breakfast', totalCalories: 600, totalProtein: 40, totalFats: 20, totalCarbs: 60, createdAt: new Date() },
        { type: 'lunch', totalCalories: 800, totalProtein: 50, totalFats: 25, totalCarbs: 80, createdAt: new Date() },
      ],
      nutritionTargets: { calories: 2800, protein: 180, fats: 90, carbs: 320 },
    } as any);
    expect(ctx).toContain('Сегодня съедено: 1400 ккал из 2800');
    expect(ctx).toContain('белок 90 г из 180');
  });

  test('top PRs are estimated 1RM with warm-ups excluded', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      allCompletedExerciseSets: [
        { exercise: { name: 'Жим лёжа' }, workout: { completedAt: new Date() },
          sets: [{ weight: 100, reps: 5 }, { weight: 500, reps: 1, type: 'warmup' }] },
        { exercise: { name: 'Присед' }, workout: { completedAt: new Date() },
          sets: [{ weight: 140, reps: 3 }] },
      ],
    } as any);
    // 100×5 Epley ≈ 117; the absurd 500 warm-up must not become the record.
    expect(ctx).toContain('Жим лёжа 117 кг');
    expect(ctx).toContain('Присед 154 кг');
    expect(ctx).not.toContain('500');
  });

  test('the rule line tells the model what to do when a number is missing', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      bodyWeightHistory: [{ weightKg: 92, date: new Date('2026-08-06') }],
    } as any);
    expect(ctx).toMatch(/данных нет, а не оценивай/);
  });

  test('with no data at all the block stays quiet beyond the profile weight', async () => {
    const ctx = await buildDynamicContext({ ...base, user: null } as any);
    expect(ctx).not.toContain('КЛЮЧЕВЫЕ ЧИСЛА');
  });

  test('sleep averages only over enough nights to mean something', async () => {
    const two = [
      { date: '2026-08-06', durationHours: 8 },
      { date: '2026-08-05', durationHours: 6 },
    ];
    const ctxTwo = await buildDynamicContext({ ...base, sleepEntries: two } as any);
    expect(ctxTwo).not.toContain('Сон, среднее');

    const four = [...two,
      { date: '2026-08-04', durationHours: 7 },
      { date: '2026-08-03', durationHours: 7 },
    ];
    const ctxFour = await buildDynamicContext({ ...base, sleepEntries: four } as any);
    expect(ctxFour).toContain('Сон, среднее за 4 ночей: 7.0 ч');
  });

  test('the block appears before the narrative blocks', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      bodyWeightHistory: [{ weightKg: 92, date: new Date('2026-08-06') }],
    } as any);
    const key = ctx.indexOf('КЛЮЧЕВЫЕ ЧИСЛА');
    const profile = ctx.indexOf('ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ');
    expect(key).toBeGreaterThanOrEqual(0);
    expect(profile).toBeGreaterThan(key);
  });
});

describe('ПИТАНИЕ ПО ДНЯМ', () => {
  const days = [
    { date: '2026-08-07', calories: 1400, protein: 90, count: 2 },
    { date: '2026-08-06', calories: 2210.4, protein: 148.6, count: 4 },
    { date: '2026-08-03', calories: 1800, protein: 120, count: 3 },
  ];

  test('yesterday is labelled and answerable by lookup', async () => {
    const ctx = await buildDynamicContext({ ...base, weekMealDays: days } as any);
    expect(ctx).toContain('ПИТАНИЕ ПО ДНЯМ');
    expect(ctx).toContain('- 2026-08-06 (вчера): 2210 ккал · белок 149 г · приёмов: 4');
    expect(ctx).toContain('- 2026-08-07 (сегодня): 1400 ккал');
  });

  test('days come newest first', async () => {
    const ctx = await buildDynamicContext({ ...base, weekMealDays: days } as any);
    const block = ctx.split('ПИТАНИЕ ПО ДНЯМ')[1].split('\n##')[0];
    const dates = [...block.matchAll(/- (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
    expect(dates).toEqual(['2026-08-07', '2026-08-06', '2026-08-03']);
  });

  test('absent data keeps the block silent', async () => {
    const ctx = await buildDynamicContext({ ...base } as any);
    expect(ctx).not.toContain('ПИТАНИЕ ПО ДНЯМ');
  });

  test('not gated by intent — a misroute must not hide the data', async () => {
    const ctx = await buildDynamicContext({ ...base, intent: 'technique_question', weekMealDays: days } as any);
    expect(ctx).toContain('ПИТАНИЕ ПО ДНЯМ');
  });
});
