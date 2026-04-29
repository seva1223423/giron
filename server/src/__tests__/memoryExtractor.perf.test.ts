/**
 * Performance budget for memoryExtractor (round 135).
 *
 * extractMemories runs synchronously on every /ai/chat request before
 * the LLM call. With 50+ patterns walked per message, performance
 * matters — a slow regex with catastrophic backtracking would block
 * the request. These tests aren't precise benchmarks (jest CI varies)
 * but they catch order-of-magnitude regressions.
 */

import { extractMemories } from '../ai/memoryExtractor';

describe('memoryExtractor performance', () => {
  test('100 typical messages complete in under 1s total', () => {
    const messages = [
      'тренируюсь 3 раза в неделю по утрам',
      'хочу похудеть к лету, цель 75 кг',
      'у меня двое детей и я работаю из дома',
      'не курю, пью 2 литра воды в день',
      'я опытный, давно занимаюсь',
      'болит плечо при жиме',
      'у меня аллергия на орехи и непереносимость лактозы',
      'сижу на кето уже месяц',
      'сплю 7 часов, RPE люблю высокий',
      'у меня астма и плоскостопие',
    ];
    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      for (const msg of messages) {
        extractMemories(msg);
      }
    }
    const ms = Date.now() - start;
    expect(ms).toBeLessThan(1000);
  });

  test('long single message (4000 chars) completes in under 100ms', () => {
    // Simulate a long user message at the chatRequestSchema cap.
    const longMessage = 'тренируюсь 4 раза в неделю по утрам, хочу сбросить 5 кг к лету. ' +
      'у меня двое детей и я работаю из дома. ' +
      'не курю, пью 2.5 литра воды. ' +
      'сплю 7 часов в сутки. ' +
      'я опытный, занимаюсь с тренером. ' +
      'у меня аллергия на орехи. ' +
      'сижу на кето. ' +
      'болит плечо иногда. ' +
      'a'.repeat(3500); // padding to hit 4000-char ceiling
    const start = Date.now();
    extractMemories(longMessage);
    const ms = Date.now() - start;
    expect(ms).toBeLessThan(100);
  });

  test('empty message returns immediately (microsecond range)', () => {
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      extractMemories('');
    }
    const ms = Date.now() - start;
    expect(ms).toBeLessThan(50);
  });

  test('extracts >= 12 distinct memories from a comprehensive 200-word message', () => {
    // Realistic worst-case: a chatty user who recaps their entire profile.
    const comprehensive = `Привет! Я тренируюсь 4 раза в неделю по утрам, в зале.
    Сейчас вешу 80 кг, рост 178 см, у меня 18% жира. Хочу сбросить 5 кг к лету.
    Моя цель — эстетика и кубики на прессе. У меня двое детей и я работаю из дома.
    Не курю, пью 2.5 литра воды, сплю 7 часов в сутки. Я опытный, давно занимаюсь.
    Тренируюсь с тренером раз в неделю. Пью креатин и протеин, ещё магний.
    Был сколиоз и раньше травмировал колено. Болит плечо иногда.
    Сижу на кето уже месяц. Работаю по сменам, поэтому только по выходным
    могу делать тяжёлые тренировки. Не люблю до отказа, оставляю запас.
    Раньше играл в футбол. У меня есть TRX и эспандер дома.`;
    const out = extractMemories(comprehensive);
    expect(out.length).toBeGreaterThanOrEqual(12);
    // Spot-check a few critical facts
    const keys = new Set(out.map((m) => m.key));
    expect(keys.has('training_frequency')).toBe(true);
    expect(keys.has('current_weight_kg')).toBe(true);
    expect(keys.has('height_cm')).toBe(true);
    expect(keys.has('weight_loss_target_kg')).toBe(true);
    expect(keys.has('user_goal')).toBe(true);
  });

  test('pathological repeat-pattern input does not hang (catastrophic-backtracking sanity)', () => {
    // 1000-char string with no extractable signal. If any pattern had
    // catastrophic backtracking (nested quantifiers like (.*)+), this
    // would hang or timeout.
    const pathological = 'abcабc'.repeat(200);
    const start = Date.now();
    extractMemories(pathological);
    const ms = Date.now() - start;
    expect(ms).toBeLessThan(50);
  });
});
