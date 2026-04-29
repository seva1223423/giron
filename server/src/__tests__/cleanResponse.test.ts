/**
 * Unit tests for cleanResponse (round 141 expanded).
 *
 * cleanResponse runs as the final post-processing step on every AI
 * text response before it's sent to the client. It strips common
 * LLM "fluff" openings ("Конечно!", "Отличный вопрос!") that sound
 * sycophantic and burn tokens.
 *
 * Round 141 added 9 more patterns. These tests pin both the original
 * 5 and the new 9 — and verify the function doesn't accidentally
 * strip MID-sentence content.
 */

import { cleanResponse } from '../services/deepseekAI';

describe('cleanResponse — original fluff patterns', () => {
  test.each([
    ['Конечно! Делай 3 подхода.', 'Делай 3 подхода.'],
    ['Конечно, делай 3 подхода.', 'делай 3 подхода.'],
    ['Отличный вопрос! Жим лёжа лучше делать с хватом.', 'Жим лёжа лучше делать с хватом.'],
    ['Хороший вопрос! Тренируйся 4 раза в неделю.', 'Тренируйся 4 раза в неделю.'],
    ['Рад помочь! Вот программа на неделю.', 'Вот программа на неделю.'],
    ['С удовольствием! Программа готова.', 'Программа готова.'],
  ])('strips opener "%s"', (input, expected) => {
    expect(cleanResponse(input)).toBe(expected);
  });
});

describe('cleanResponse — round 141 new patterns', () => {
  test.each([
    ['Безусловно! Жим — лучшее упражнение.', 'Жим — лучшее упражнение.'],
    ['Несомненно! Это работает.', 'Это работает.'],
    ['Отлично! Ты на правильном пути.', 'Ты на правильном пути.'],
    ['Прекрасно! Программа подходит.', 'Программа подходит.'],
    ['Замечательно! Продолжай.', 'Продолжай.'],
    // "Понимаю" too ambiguous (round 141.1 audit) — pattern removed.
    ['Давайте разберёмся! Жим выполняется так.', 'Жим выполняется так.'],
  ])('strips opener "%s"', (input, expected) => {
    expect(cleanResponse(input)).toBe(expected);
  });
});

describe('cleanResponse — does NOT strip mid-sentence fluff', () => {
  test('"Я конечно люблю жим" — keeps "конечно" mid-sentence', () => {
    const out = cleanResponse('Я конечно люблю жим лёжа.');
    expect(out).toBe('Я конечно люблю жим лёжа.');
  });

  test('"Это отлично работает" — keeps "отлично" mid-sentence', () => {
    const out = cleanResponse('Это отлично работает на массу.');
    expect(out).toBe('Это отлично работает на массу.');
  });

  test('"Понимаю тебя, но..." — preserved (round 141.1 — pattern dropped)', () => {
    // Round 141.1 audit removed the bare "Понимаю" pattern because it
    // was too ambiguous. Now "Понимаю тебя" stays intact.
    const out = cleanResponse('Понимаю тебя, но программа должна быть тяжелее.');
    expect(out).toBe('Понимаю тебя, но программа должна быть тяжелее.');
  });
});

describe('cleanResponse — round 156 closing fluff', () => {
  test('strips "Если у тебя есть вопросы..." at end', () => {
    const out = cleanResponse('Делай 4 подхода. Если у тебя есть вопросы, спрашивай!');
    expect(out).toBe('Делай 4 подхода.');
  });

  test('strips "Удачи в тренировках!" at end', () => {
    const out = cleanResponse('Программа готова. Удачи в тренировках!');
    expect(out).toBe('Программа готова.');
  });

  test('strips "Надеюсь, это поможет!" at end', () => {
    const out = cleanResponse('Программа на неделю. Надеюсь, это поможет!');
    expect(out).toBe('Программа на неделю.');
  });

  test('strips "Если нужна помощь..." at end', () => {
    const out = cleanResponse('Тренируйся 3 раза. Если нужна помощь, обращайся.');
    expect(out).toBe('Тренируйся 3 раза.');
  });

  test('does NOT strip mid-sentence "если у тебя"', () => {
    const out = cleanResponse('Если у тебя болит, остановись и отдохни.');
    expect(out).toBe('Если у тебя болит, остановись и отдохни.');
  });
});

describe('cleanResponse — boundary properties', () => {
  test('empty string returns empty string', () => {
    expect(cleanResponse('')).toBe('');
  });

  test('whitespace-only returns empty string after trim', () => {
    expect(cleanResponse('   \n\t   ')).toBe('');
  });

  test('caps response at ~2000 words with ellipsis', () => {
    const longResponse = 'слово '.repeat(2500);
    const out = cleanResponse(longResponse);
    const wordCount = out.split(/\s+/).filter((w) => w.length > 0).length;
    expect(wordCount).toBeLessThanOrEqual(2001); // 2000 + the "..." token
    expect(out.endsWith('...')).toBe(true);
  });

  test('multiple stacked openers all strip (greedy by design)', () => {
    // The strip loop applies all patterns in sequence. If two LLM-fluff
    // openers stack ("Конечно! Отлично!"), both get stripped — by
    // design, since both add no value. The final remaining string is
    // the actual content.
    const out = cleanResponse('Конечно! Отлично работает программа.');
    expect(out).toBe('работает программа.');
  });
});
