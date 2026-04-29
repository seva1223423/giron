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
