/**
 * The coach must be able to see cardio.
 *
 * CardioSession was read in exactly one place: the watch-data block, which
 * returns an empty string unless something was actually synced from a watch.
 * So the app had a whole cardio tab whose contents the coach could not see —
 * asked "сколько я пробежал на этой неделе", it had to deflect or invent.
 *
 * These pin the block: it exists when there is cardio, it splits the fortnight
 * into this week and last, and it stays quiet when there is nothing to say.
 */

// The memory and watch-data blocks run for every intent and query the
// database. Nothing here is about them, and letting them reach a real
// connection makes the suite hang rather than fail. Every model method
// answers "nothing stored".
jest.mock('../db', () => {
  const model = new Proxy({}, {
    get: (_t, method: string) =>
      jest.fn(() => Promise.resolve(method === 'findMany' ? [] : null)),
  });
  return { prisma: new Proxy({}, { get: () => model }) };
});

import { buildDynamicContext } from '../ai/contextEngine';

const TODAY = '2026-08-06';

const base = {
  userId: 'u1',
  intent: 'general' as any,
  message: 'сколько я пробежал',
  todayDate: TODAY,
  user: null,
  recentWorkouts: [],
  allCompletedExerciseSets: [],
  todayMeals: [],
  bodyWeightHistory: [],
};

const run = (recentCardio: any[], over: Record<string, unknown> = {}) =>
  buildDynamicContext({ ...base, recentCardio, ...over } as any);

const session = (over: Record<string, unknown> = {}) => ({
  type: 'running',
  date: TODAY,
  durationMinutes: 30,
  distanceKm: 5,
  caloriesBurned: 300,
  avgHeartRate: 145,
  ...over,
});

describe('cardio block', () => {
  test('reports the week the person actually had', async () => {
    const ctx = await run([session(), session({ date: '2026-08-04', durationMinutes: 45, distanceKm: 8 })]);

    expect(ctx).toContain('КАРДИО');
    expect(ctx).toContain('2 сессий');
    expect(ctx).toContain('75 мин');
    expect(ctx).toContain('13 км');
  });

  test('says the type in Russian', async () => {
    const ctx = await run([session({ type: 'cycling' })]);
    expect(ctx).toContain('велосипед');
    expect(ctx).not.toContain('cycling');
  });

  test('passes through a type it has no word for', async () => {
    // Better an English label than dropping the session entirely.
    const ctx = await run([session({ type: 'kayaking' })]);
    expect(ctx).toContain('kayaking');
  });

  test('compares against the week before', async () => {
    const ctx = await run([
      session({ date: TODAY, durationMinutes: 60 }),
      session({ date: '2026-07-28', durationMinutes: 20 }),
    ]);

    expect(ctx).toContain('Неделей раньше');
    expect(ctx).toContain('+40 мин');
  });

  test('shows a drop as a drop', async () => {
    const ctx = await run([
      session({ date: TODAY, durationMinutes: 10 }),
      session({ date: '2026-07-28', durationMinutes: 50 }),
    ]);
    expect(ctx).toContain('-40 мин');
  });

  test('does not compare against a week that had nothing', async () => {
    // "0 сессий неделей раньше" reads as a reproach to someone who just started.
    const ctx = await run([session()]);
    expect(ctx).not.toContain('Неделей раньше');
  });

  test('is absent when no cardio was logged', async () => {
    const ctx = await run([]);
    expect(ctx).not.toContain('КАРДИО');
  });

  test('is absent when the field was never populated', async () => {
    const ctx = await buildDynamicContext({ ...base } as any);
    expect(ctx).not.toContain('КАРДИО');
  });

  test('survives a session with no distance or calories', async () => {
    // A HIIT session has minutes and nothing else.
    const ctx = await run([
      session({ type: 'hiit', distanceKm: null, caloriesBurned: null, avgHeartRate: null }),
    ]);
    expect(ctx).toContain('HIIT');
    expect(ctx).toContain('30 мин');
    expect(ctx).not.toMatch(/null/);
  });

  test('lists recent sessions but does not dump all thirty', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      session({ date: `2026-08-0${(i % 6) + 1}`, durationMinutes: 10 + i }),
    );
    const ctx = await run(many);
    const listed = ctx.split('\n').filter((l) => /^- \d{4}-\d{2}-\d{2}/.test(l));
    expect(listed).toHaveLength(4);
  });

  test('appears whatever the intent was classified as', async () => {
    // Gating this on intent means one misclassification turns "сколько я
    // пробежал" back into a question with no data behind it.
    for (const intent of ['technique_question', 'nutrition_query', 'complaint', 'analytics_query']) {
      const ctx = await run([session()], { intent });
      expect(ctx).toContain('КАРДИО');
    }
  });
});
