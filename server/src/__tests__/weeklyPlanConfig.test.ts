/**
 * The weekly plan keeps the programme's own numbers.
 *
 * The coach would compose "5×5, отдых 3 минуты", call set_weekly_plan — and
 * the tool stored bare exercise names. Every planned day then started as the
 * default 4×10, so the programme the person agreed to and the workout they
 * got were different things. The client side (startPlannedDay honouring
 * WeekPlanEntry.plan, keyed by name) already existed; the tool just never
 * carried the numbers.
 *
 * These pin the tool's half of the contract: config passes through sanitized,
 * is keyed by the day's canonical exercise names, and garbage is dropped
 * per-entry rather than failing the whole schedule.
 */

// The executor resolves exercise names against the catalogue; the tests are
// about the tool contract, not the database.
jest.mock('../db', () => ({
  prisma: {
    exercise: {
      findMany: jest.fn(() => Promise.resolve([
        { id: 'squat', name: 'Приседания' },
        { id: 'bench-press', name: 'Жим лёжа' },
      ])),
    },
    user: { findUnique: jest.fn(() => Promise.resolve(null)) },
    aIMemory: { findMany: jest.fn(() => Promise.resolve([])) },
  },
}));

import { executeTool } from '../routes/ai';

const run = (input: Record<string, unknown>) => executeTool('set_weekly_plan', input, 'u1');

const day = (over: Record<string, unknown> = {}) => ({
  dayIndex: 0,
  workoutName: 'Силовая база',
  exerciseNames: ['Приседания', 'Жим лёжа'],
  ...over,
});

describe('set_weekly_plan per-exercise config', () => {
  test('carries sets, reps and rest through to the client', async () => {
    const r = await run({
      schedule: [day({
        plan: [
          { name: 'Приседания', sets: 5, reps: 5, restSeconds: 180 },
          { name: 'Жим лёжа', sets: 5, reps: 5, restSeconds: 180 },
        ],
      })],
    });
    const d = (r.actionData as any)?.schedule?.[0];
    expect(d?.plan).toHaveLength(2);
    expect(d.plan[0]).toMatchObject({ sets: 5, reps: 5, restSeconds: 180 });
  });

  test('without config the schedule is exactly what it always was', async () => {
    const r = await run({ schedule: [day()] });
    const d = (r.actionData as any)?.schedule?.[0];
    expect(d?.exerciseNames?.length).toBe(2);
    expect(d?.plan).toBeUndefined();
  });

  test('config for an exercise the day does not list is dropped', async () => {
    // The model pads; a stray entry must not invent an exercise.
    const r = await run({
      schedule: [day({ plan: [{ name: 'Становая тяга', sets: 5, reps: 5 }] })],
    });
    expect((r.actionData as any)?.schedule?.[0]?.plan).toBeUndefined();
  });

  test('an entry that carries no numbers at all is dropped', async () => {
    const r = await run({
      schedule: [day({ plan: [{ name: 'Приседания' }] })],
    });
    expect((r.actionData as any)?.schedule?.[0]?.plan).toBeUndefined();
  });

  test('absurd numbers fail validation instead of reaching the plan', async () => {
    // 50 sets of 5000 reps is a hallucination, not a programme.
    const r = await run({
      schedule: [day({ plan: [{ name: 'Приседания', sets: 50, reps: 5000 }] })],
    });
    expect(r.actionData).toBeUndefined();
    expect(r.resultText).toMatch(/Ошибка/i);
  });

  test('partial config is fine — rest alone is a real instruction', async () => {
    const r = await run({
      schedule: [day({ plan: [{ name: 'Приседания', restSeconds: 240 }] })],
    });
    const p = (r.actionData as any)?.schedule?.[0]?.plan;
    expect(p).toHaveLength(1);
    expect(p[0].restSeconds).toBe(240);
    expect(p[0].sets).toBeUndefined();
  });
});
