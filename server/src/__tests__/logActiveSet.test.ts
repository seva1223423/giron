/**
 * Logging a set into the session that is running.
 *
 * The coach could describe a workout from last week and could write a whole
 * one retroactively, but between sets — the moment it is most useful — it had
 * nothing. "Записал 100 на 8" either went nowhere or was turned into a
 * separate backdated workout, which is a different and wrong thing.
 *
 * The running session lives in the client's store, so this tool validates and
 * hands the numbers back for the app to apply. These tests pin the
 * validation, because a bad number reaching the store writes nonsense into
 * somebody's training history.
 */

import { executeTool } from '../routes/ai';

const run = (input: Record<string, unknown>) =>
  executeTool('log_active_set', input, 'u1');

describe('log_active_set', () => {
  test('accepts a normal set and hands the numbers back', async () => {
    const r = await run({ weight: 100, reps: 8 });
    expect(r.actionData).toMatchObject({ weight: 100, reps: 8 });
    expect(r.resultText).toContain('100×8');
  });

  test('keeps rpe when it was given', async () => {
    const r = await run({ weight: 100, reps: 8, rpe: 8.5 });
    expect(r.actionData?.rpe).toBe(8.5);
  });

  test('treats zero weight as a real answer, not a missing one', async () => {
    // Pull-ups and dips are logged at bodyweight; coercing 0 to a default
    // would invent a load the person never lifted.
    const r = await run({ weight: 0, reps: 12 });
    expect(r.actionData?.weight).toBe(0);
    expect(r.resultText).toContain('12 повт.');
  });

  test('defaults to bodyweight when no weight is mentioned', async () => {
    const r = await run({ reps: 10 });
    expect(r.actionData?.weight).toBe(0);
  });

  test('carries the exercise name when one was named', async () => {
    const r = await run({ weight: 60, reps: 10, exerciseName: 'Разводка гантелей' });
    expect(r.actionData?.exerciseName).toBe('Разводка гантелей');
    expect(r.resultText).toContain('Разводка гантелей');
  });

  test('refuses reps it cannot believe', async () => {
    for (const reps of [0, -5, 1000]) {
      const r = await run({ weight: 100, reps });
      expect(r.actionData).toBeUndefined();
      expect(r.resultText).toMatch(/не понял|Ошибка/i);
    }
  });

  test('refuses a weight it cannot believe', async () => {
    for (const weight of [-10, 5000]) {
      const r = await run({ weight, reps: 8 });
      expect(r.actionData).toBeUndefined();
    }
  });

  test('drops an rpe outside the scale instead of failing the whole set', async () => {
    // Losing the set because the model guessed "@15" would be worse than
    // losing the rpe.
    const r = await run({ weight: 100, reps: 8, rpe: 15 });
    expect(r.actionData?.reps).toBe(8);
    expect(r.actionData?.rpe).toBeUndefined();
  });

  test('reads numbers sent as strings', async () => {
    const r = await run({ weight: '102.5', reps: '6' });
    expect(r.actionData).toMatchObject({ weight: 102.5, reps: 6 });
  });

  test('rounds fractional reps rather than storing half a rep', async () => {
    const r = await run({ weight: 80, reps: 7.6 });
    expect(r.actionData?.reps).toBe(8);
  });

  test('says nothing happened when reps are missing entirely', async () => {
    const r = await run({ weight: 100 });
    expect(r.actionData).toBeUndefined();
    expect(r.actionDescription).toBe('');
  });
});
