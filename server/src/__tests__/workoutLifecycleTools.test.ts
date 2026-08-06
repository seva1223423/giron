/**
 * Starting and finishing a session from the chat.
 *
 * The coach could recommend a workout and could analyse one afterwards, but
 * there was no tool between those two points: "начни ноги" was advice, and
 * the person still had to leave the chat, find the screen and tap. Forty-odd
 * tools and not one of them opened a session.
 *
 * Which workout to start is resolved by the app — routines, the week plan and
 * the exercise catalogue live in its stores, and a session never reaches the
 * database until it ends. So these tools carry intent, and the tests here pin
 * that intent surviving the trip intact.
 */

import { executeTool } from '../routes/ai';

const start = (input: Record<string, unknown>) => executeTool('start_workout', input, 'u1');

describe('start_workout', () => {
  test('with nothing named, means "whatever is planned for today"', async () => {
    const r = await start({});
    expect(r.actionData).toBeDefined();
    expect(r.actionData?.routineName).toBeUndefined();
    expect(r.actionData?.exercises).toBeUndefined();
    expect(r.resultText).toContain('план на сегодня');
  });

  test('carries a named template through', async () => {
    const r = await start({ routineName: 'Ноги — база' });
    expect(r.actionData?.routineName).toBe('Ноги — база');
    expect(r.resultText).toContain('Ноги — база');
  });

  test('carries a list of exercises through', async () => {
    const r = await start({ exercises: ['Жим лёжа', 'Разводка гантелей'] });
    expect(r.actionData?.exercises).toEqual(['Жим лёжа', 'Разводка гантелей']);
  });

  test('drops blank entries the model padded the list with', async () => {
    const r = await start({ exercises: ['Присед', '   ', ''] });
    expect(r.actionData?.exercises).toEqual(['Присед']);
  });

  test('treats a list that was only blanks as no list at all', async () => {
    // Otherwise the app would try to start a workout with zero exercises
    // instead of falling back to the plan.
    const r = await start({ exercises: ['  ', ''] });
    expect(r.actionData?.exercises).toBeUndefined();
    expect(r.resultText).toContain('план на сегодня');
  });

  test('keeps a name the person gave the session', async () => {
    const r = await start({ exercises: ['Присед'], name: 'Быстрые ноги' });
    expect(r.actionData?.name).toBe('Быстрые ноги');
  });

  test('refuses an absurdly long list rather than passing it on', async () => {
    const r = await start({ exercises: Array.from({ length: 40 }, (_, i) => `Упражнение ${i}`) });
    expect(r.actionData).toBeUndefined();
    expect(r.resultText).toMatch(/Ошибка/i);
  });
});

describe('generate_warmup', () => {
  const warmup = (input: Record<string, unknown> = {}) =>
    executeTool('generate_warmup', input, 'u1');

  test('produces an action instead of describing a button', async () => {
    // This tool used to be a stub: it answered "разминка будет добавлена через
    // кнопку 🔥 Разминка" and did nothing, so the coach announced a warm-up
    // that never appeared on the screen.
    const r = await warmup();
    expect(r.actionDescription).not.toBe('');
    expect(r.actionData).toBeDefined();
    expect(r.resultText).not.toMatch(/кнопк/i);
  });

  test('says what the warm-up actually is', async () => {
    const r = await warmup();
    expect(r.resultText).toContain('40%');
    expect(r.resultText).toContain('80%');
  });

  test('carries the exercise the person named', async () => {
    const r = await warmup({ exerciseName: 'Жим лёжа' });
    expect(r.actionData?.exerciseName).toBe('Жим лёжа');
    expect(r.resultText).toContain('Жим лёжа');
  });

  test('with no exercise named, means "the one I am on"', async () => {
    const r = await warmup();
    expect(r.actionData?.exerciseName).toBeUndefined();
  });

  test('treats a blank name as no name at all', async () => {
    // Otherwise the app would look for an exercise called "   " and refuse.
    const r = await warmup({ exerciseName: '   ' });
    expect(r.actionData?.exerciseName).toBeUndefined();
  });
});

describe('finish_workout', () => {
  test('is a plain signal — the session lives in the app', async () => {
    const r = await executeTool('finish_workout', {}, 'u1');
    expect(r.actionData).toEqual({});
    expect(r.actionDescription).toContain('завершена');
  });

  test('ignores parameters it was not given a use for', async () => {
    // Models improvise arguments; inventing behaviour from them would be
    // worse than ignoring them.
    const r = await executeTool('finish_workout', { save: false, force: true }, 'u1');
    expect(r.actionData).toEqual({});
  });
});
