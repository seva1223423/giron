/**
 * The coach notices what the data says when read TOGETHER.
 *
 * Every context block describes one domain; none could say "your volume fell
 * the same week your sleep did". These findings are computed
 * deterministically — the model explains them instead of having to discover
 * them across a long prompt. Each rule is pinned with the case it fires on
 * and the thin-data case where it must stay silent, because a wrong insight
 * ("ты переедаешь" to someone who is not) is worse than none.
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
  message: 'как дела с прогрессом?',
  todayDate: TODAY,
  user: { goal: 'WEIGHT_LOSS', weightKg: 90 },
  recentWorkouts: [],
  allCompletedExerciseSets: [],
  todayMeals: [],
  bodyWeightHistory: [],
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const workout = (n: number, volume: number) => ({
  name: `Тр ${n}`,
  completedAt: daysAgo(n),
  exercises: [{ exerciseId: 'x', exercise: { name: 'Жим' },
    sets: [{ completed: true, weight: volume / 10, reps: 10 }] }],
});

describe('вес против цели', () => {
  const gaining = [
    { weightKg: 93, date: daysAgo(0) },
    { weightKg: 91.5, date: daysAgo(35) },
  ];

  test('losing-weight goal + rising weight fires, with today\'s calories when they are over', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      bodyWeightHistory: gaining,
      todayMeals: [{ type: 'lunch', totalCalories: 2500, totalProtein: 100, totalFats: 80, totalCarbs: 250, createdAt: new Date() }],
      nutritionTargets: { calories: 1900, protein: 150, fats: 70, carbs: 200 },
    } as any);
    expect(ctx).toContain('СВЯЗКИ');
    expect(ctx).toContain('ПРОТИВ цели: +1.5 кг');
    expect(ctx).toContain('2500 ккал при цели 1900');
  });

  test('gaining goal + falling weight fires the mirror rule', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      user: { goal: 'MUSCLE_GAIN', weightKg: 80 },
      bodyWeightHistory: [
        { weightKg: 78.8, date: daysAgo(0) },
        { weightKg: 80, date: daysAgo(35) },
      ],
    } as any);
    expect(ctx).toContain('Вес падает (-1.2 кг за 30 дн) при цели набрать');
  });

  test('weight moving WITH the goal stays silent', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      bodyWeightHistory: [
        { weightKg: 88, date: daysAgo(0) },
        { weightKg: 90, date: daysAgo(35) },
      ],
    } as any);
    expect(ctx).not.toContain('ПРОТИВ цели');
  });
});

describe('сон против нагрузки', () => {
  const shortSleep = [
    { date: '2026-08-06', durationHours: 6 },
    { date: '2026-08-05', durationHours: 5.5 },
    { date: '2026-08-04', durationHours: 6.2 },
  ];

  test('short sleep with three workouts in the week fires', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      sleepEntries: shortSleep,
      recentWorkouts: [workout(1, 5000), workout(3, 5200), workout(5, 4800)],
    } as any);
    expect(ctx).toContain('восстановление не успевает');
  });

  test('same sleep with one workout stays silent — nothing to recover from', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      sleepEntries: shortSleep,
      recentWorkouts: [workout(2, 5000)],
    } as any);
    expect(ctx).not.toContain('восстановление не успевает');
  });
});

describe('объём падает вместе со сном', () => {
  test('a 20%+ volume drop on short sleep is named fatigue, not laziness', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      sleepEntries: [
        { date: '2026-08-06', durationHours: 6.5 },
        { date: '2026-08-05', durationHours: 6.5 },
        { date: '2026-08-04', durationHours: 6.8 },
      ],
      recentWorkouts: [workout(0, 3500), workout(2, 5000), workout(4, 5200), workout(6, 4900)],
    } as any);
    expect(ctx).toContain('усталость, а не на лень');
  });

  test('the same drop on good sleep stays silent — sleep is not the story', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      sleepEntries: [
        { date: '2026-08-06', durationHours: 8 },
        { date: '2026-08-05', durationHours: 7.5 },
        { date: '2026-08-04', durationHours: 8.2 },
      ],
      recentWorkouts: [workout(0, 3500), workout(2, 5000), workout(4, 5200), workout(6, 4900)],
    } as any);
    expect(ctx).not.toContain('усталость, а не на лень');
  });
});

describe('белок после тренировки', () => {
  test('trained today, evening, protein far behind — fires', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      clientHour: 20,
      recentWorkouts: [{ ...workout(0, 5000), completedAt: new Date(`${TODAY}T10:00:00Z`) }],
      todayMeals: [{ type: 'breakfast', totalCalories: 700, totalProtein: 30, totalFats: 30, totalCarbs: 70, createdAt: new Date() }],
      nutritionTargets: { calories: 2500, protein: 160, fats: 80, carbs: 280 },
    } as any);
    expect(ctx).toContain('белка к вечеру 30 г из 160');
  });

  test('same numbers at noon stay silent — the day is not over', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      clientHour: 12,
      recentWorkouts: [{ ...workout(0, 5000), completedAt: new Date(`${TODAY}T10:00:00Z`) }],
      todayMeals: [{ type: 'breakfast', totalCalories: 700, totalProtein: 30, totalFats: 30, totalCarbs: 70, createdAt: new Date() }],
      nutritionTargets: { calories: 2500, protein: 160, fats: 80, carbs: 280 },
    } as any);
    expect(ctx).not.toContain('белка к вечеру');
  });
});

describe('рамки блока', () => {
  test('no data — no block at all', async () => {
    const ctx = await buildDynamicContext({ ...base } as any);
    expect(ctx).not.toContain('СВЯЗКИ');
  });

  test('a greeting never opens with a scolding', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      intent: 'greeting',
      message: 'привет',
      bodyWeightHistory: [
        { weightKg: 93, date: daysAgo(0) },
        { weightKg: 91.5, date: daysAgo(35) },
      ],
    } as any);
    expect(ctx).not.toContain('СВЯЗКИ');
  });

  test('never more than three findings', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      clientHour: 20,
      bodyWeightHistory: [
        { weightKg: 93, date: daysAgo(0) },
        { weightKg: 91.5, date: daysAgo(35) },
      ],
      sleepEntries: [
        { date: '2026-08-06', durationHours: 5.5 },
        { date: '2026-08-05', durationHours: 6 },
        { date: '2026-08-04', durationHours: 6 },
      ],
      recentWorkouts: [
        { ...workout(0, 3500), completedAt: new Date(`${TODAY}T10:00:00Z`) },
        workout(2, 5000), workout(4, 5200), workout(6, 4900),
      ],
      todayMeals: [{ type: 'breakfast', totalCalories: 700, totalProtein: 30, totalFats: 30, totalCarbs: 70, createdAt: new Date() }],
      nutritionTargets: { calories: 1900, protein: 160, fats: 80, carbs: 200 },
    } as any);
    const bullets = (ctx.split('СВЯЗКИ')[1] ?? '').split('\n##')[0].split('\n').filter((l) => l.startsWith('- '));
    expect(bullets.length).toBeLessThanOrEqual(3);
    expect(bullets.length).toBeGreaterThanOrEqual(3); // this fixture trips four rules
  });
});
