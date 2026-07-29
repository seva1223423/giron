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
