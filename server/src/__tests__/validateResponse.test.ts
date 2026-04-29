/**
 * Unit tests for validateResponse (rounds 142-143).
 *
 * The chat path runs validateResponse on every AI text response. If
 * `shouldRegenerate=true`, the route re-calls the LLM. False positives
 * here cause user-visible latency spikes (extra Mistral round-trip).
 * False negatives mean the user sees broken output.
 *
 * Round 142 added Russian refusal patterns. Coverage was zero — these
 * tests pin both the original 7 issue branches and the new ones.
 */

import { validateResponse } from '../services/deepseekAI';

describe('validateResponse — happy path', () => {
  test('normal Russian fitness response returns valid=true', () => {
    const result = validateResponse(
      'Делай 4 подхода по 8 повторений, отдых 90 секунд между подходами.',
      'как делать приседания',
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.shouldRegenerate).toBe(false);
  });
});

describe('validateResponse — empty response', () => {
  test('empty string flags empty_response + regenerate', () => {
    const result = validateResponse('', 'программу');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('empty_response');
    expect(result.shouldRegenerate).toBe(true);
  });

  test('whitespace-only flags empty_response', () => {
    const result = validateResponse('   ', 'программу');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('empty_response');
  });

  test('5 chars (under 10) flags empty_response', () => {
    const result = validateResponse('ОК!', 'программу');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('empty_response');
  });
});

describe('validateResponse — wrong language', () => {
  test('mostly English response flags wrong_language + regenerate', () => {
    const result = validateResponse(
      'Sure, here is your program. Bench press 5x5, squats 5x5, deadlift 1x5. Train 3 times per week.',
      'программу',
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('wrong_language');
    expect(result.shouldRegenerate).toBe(true);
  });

  test('Russian with a few English words is OK (under 60% latin)', () => {
    const result = validateResponse(
      'Делай жим лёжа (bench press) 4x8, приседания 4x8. Это базовые движения.',
      'программу',
    );
    expect(result.valid).toBe(true);
  });
});

describe('validateResponse — too long', () => {
  test('3001 words flags too_long but does NOT regenerate', () => {
    const longResponse = 'слово '.repeat(3001);
    const result = validateResponse(longResponse, 'программу');
    expect(result.issues).toContain('too_long');
    // Long responses are trimmed client-side, not regenerated.
    expect(result.shouldRegenerate).toBe(false);
  });
});

describe('validateResponse — repetitive (model loop)', () => {
  test('model repeating itself flags repetitive + regenerate', () => {
    const sentence = 'Делай 5 подходов по 5 повторений с весом 80% от максимума. ';
    const repetitive = sentence.repeat(10); // same sentence 10x
    const result = validateResponse(repetitive, 'программу');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('repetitive');
    expect(result.shouldRegenerate).toBe(true);
  });
});

describe('validateResponse — tech garbage', () => {
  test('JSON block flags tech_garbage', () => {
    const polluted = 'Программа готова. ```json\n' + JSON.stringify({a: 1}).repeat(20) + '```';
    const result = validateResponse(polluted, 'программу');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('tech_garbage');
  });

  test('HTML <div> tag flags tech_garbage', () => {
    const result = validateResponse('Программа: <div>some content</div>', 'программу');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('tech_garbage');
  });

  test('JS code flags tech_garbage', () => {
    const result = validateResponse('Вот функция: function calc() { return 5; }', 'программу');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('tech_garbage');
  });
});

describe('validateResponse — English refusal in mostly-Russian response', () => {
  test.each([
    "I'm sorry, but I cannot provide medical advice.",
    'As an AI language model, I cannot recommend.',
    "I can't help with this request.",
  ])('"%s" embedded in Russian flags english_refusal + regenerate', (input) => {
    // Pad with Russian text so wrong_language doesn't trigger first.
    // wrong_language fires when latin > 60% of total alpha chars.
    const padded = `Программа готова, но возникла проблема. ${input} Извини за неудобство в процессе.`;
    const result = validateResponse(padded, 'программу');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('english_refusal');
    expect(result.shouldRegenerate).toBe(true);
  });
});

describe('validateResponse — round 143 Russian refusal', () => {
  test.each([
    'Я не могу помочь с этим вопросом.',
    'Это выходит за рамки моих компетенций.',
    'Я всего лишь языковая модель, я не могу комментировать.',
    'Я не врач и не могу давать рекомендации по нагрузкам.',
    'Я не уполномочен обсуждать это.',
  ])('"%s" flags russian_refusal + regenerate', (input) => {
    const result = validateResponse(input + ' Дополнительный текст для длины.', 'программу');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('russian_refusal');
    expect(result.shouldRegenerate).toBe(true);
  });
});

describe('validateResponse — bad start (no regenerate)', () => {
  test('"Конечно!" flag fires but does not trigger regenerate', () => {
    const result = validateResponse(
      'Конечно! Вот программа: жим лёжа 4 подхода по 8.',
      'программу',
    );
    expect(result.issues).toContain('bad_start');
    // bad_start is cleaned-up by cleanResponse, not regenerated.
    expect(result.shouldRegenerate).toBe(false);
  });
});
