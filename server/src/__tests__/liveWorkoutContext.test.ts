/**
 * The coach must know about the workout happening right now.
 *
 * Every workout query feeding the chat filters on `completedAt`, so a session
 * in progress was invisible. Asked "сколько подходов я уже сделал" mid-set,
 * the coach could only talk about last week — the one moment it is most
 * obviously wrong to do so.
 *
 * These pin the block: it appears only while a session runs, it counts what
 * is actually finished rather than what is planned, and it says plainly that
 * these numbers outrank the history blocks below it.
 */

import { buildDynamicContext } from '../ai/contextEngine';

const base = {
  userId: 'u1',
  intent: 'general' as any,
  message: 'сколько подходов я уже сделал',
  todayDate: '2026-07-29',
  user: null,
  recentWorkouts: [],
  allCompletedExerciseSets: [],
  todayMeals: [],
  bodyWeightHistory: [],
};

const live = (over: Record<string, unknown> = {}) => ({
  name: 'Грудь + трицепс',
  startedAt: new Date(Date.now() - 25 * 60 * 1000),
  exercises: [
    {
      exercise: { name: 'Жим лёжа' },
      sets: [
        { completed: true, weight: 100, reps: 8, rpe: 8 },
        { completed: true, weight: 100, reps: 7 },
        { completed: false, weight: 100, reps: 8 },
        { completed: false, weight: 100, reps: 8 },
      ],
    },
  ],
  ...over,
});

describe('live workout block', () => {
  test('says what has been done, not what is planned', async () => {
    const ctx = await buildDynamicContext({ ...base, liveWorkout: live() } as any);

    expect(ctx).toContain('СЕЙЧАС ИДЁТ ТРЕНИРОВКА');
    expect(ctx).toContain('Грудь + трицепс');
    // Two of four sets are finished; the other two are intentions.
    expect(ctx).toMatch(/Выполнено подходов: 2/);
    expect(ctx).toContain('2 из 4');
  });

  test('computes volume from finished sets only', async () => {
    const ctx = await buildDynamicContext({ ...base, liveWorkout: live() } as any);
    // 100×8 + 100×7 = 1500. Counting the unfinished two would give 3100 and
    // the coach would congratulate work that has not happened.
    expect(ctx).toMatch(/1500 кг/);
  });

  test('carries the actual numbers of each finished set', async () => {
    const ctx = await buildDynamicContext({ ...base, liveWorkout: live() } as any);
    expect(ctx).toContain('100×8 @8');
    expect(ctx).toContain('100×7');
  });

  test('marks an exercise that has not been started', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      liveWorkout: live({
        exercises: [
          { exercise: { name: 'Разводка' }, sets: [{ completed: false }, { completed: false }] },
        ],
      }),
    } as any);
    expect(ctx).toContain('ещё не начато');
  });

  test('is absent when no session is running', async () => {
    const ctx = await buildDynamicContext({ ...base, liveWorkout: null } as any);
    expect(ctx).not.toContain('СЕЙЧАС ИДЁТ ТРЕНИРОВКА');
  });

  test('tells the model these numbers beat the history blocks', async () => {
    const ctx = await buildDynamicContext({ ...base, liveWorkout: live() } as any);
    // Without this the model happily answers "сегодня" from last week's data,
    // which is the whole failure being fixed.
    expect(ctx).toMatch(/бери числа отсюда/i);
  });

  test('comes before the history blocks', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      liveWorkout: live(),
      user: { goal: 'MUSCLE_GAIN', weightKg: 92, heightCm: 190 },
    } as any);
    const livePos = ctx.indexOf('СЕЙЧАС ИДЁТ ТРЕНИРОВКА');
    expect(livePos).toBeGreaterThanOrEqual(0);
    // Anything else in the prompt is about the past; this is about now.
    expect(livePos).toBeLessThan(ctx.length / 2);
  });

  test('survives a session with no exercises yet', async () => {
    const ctx = await buildDynamicContext({
      ...base,
      liveWorkout: live({ exercises: [] }),
    } as any);
    expect(ctx).toContain('Выполнено подходов: 0');
  });
});
