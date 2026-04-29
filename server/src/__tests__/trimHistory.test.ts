/**
 * Unit tests for trimHistory (round 145).
 *
 * trimHistory runs on every chat call to fit message history within
 * the LLM context budget. Bug here = either truncated context (lost
 * conversation continuity) or context overflow (Mistral 400 error).
 *
 * Uncovered until now — adding pinning tests for the budget math
 * and edge cases.
 */

import { trimHistory } from '../services/deepseekAI';

describe('trimHistory — happy path', () => {
  test('returns all messages when total tokens fit within budget', () => {
    const messages = [
      { role: 'user' as const, content: 'привет' },
      { role: 'assistant' as const, content: 'здравствуй' },
      { role: 'user' as const, content: 'как дела' },
    ];
    const result = trimHistory(messages, 8000, 1000);
    expect(result).toEqual(messages);
  });

  test('keeps last 2 messages when budget is too tight', () => {
    const messages = [
      { role: 'user' as const, content: 'старое сообщение 1' },
      { role: 'assistant' as const, content: 'старый ответ 1' },
      { role: 'user' as const, content: 'свежее сообщение' },
      { role: 'assistant' as const, content: 'свежий ответ' },
    ];
    // maxTokens=2000, systemTokens=1500 leaves only 500 - 2000 reserve = negative.
    const result = trimHistory(messages, 2000, 1500);
    // Returns last 2 messages even if budget is negative.
    expect(result.length).toBe(2);
    expect(result[result.length - 1].content).toBe('свежий ответ');
  });
});

describe('trimHistory — preserves recency', () => {
  test('drops OLDEST messages first when budget is tight', () => {
    const messages = [
      { role: 'user' as const, content: 'a'.repeat(2000) },     // ~571 tokens
      { role: 'assistant' as const, content: 'b'.repeat(2000) }, // ~571 tokens
      { role: 'user' as const, content: 'c'.repeat(2000) },      // ~571 tokens
      { role: 'assistant' as const, content: 'свежий' },
    ];
    // budget = 2000 - 200 - 2000 = -200 → returns last 2
    const result = trimHistory(messages, 2000, 200);
    // Even with negative budget, we get last 2 messages — newest survives.
    expect(result[result.length - 1].content).toBe('свежий');
  });

  test('iteration is from end → start (newest first)', () => {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}`,
    }));
    const result = trimHistory(messages, 8000, 100);
    // Result should preserve order; last item is "msg-19", first is "msg-0"
    // unless budget cut it.
    expect(result[result.length - 1].content).toBe('msg-19');
  });
});

describe('trimHistory — boundary properties', () => {
  test('empty messages array returns empty array', () => {
    const result = trimHistory([], 8000, 1000);
    expect(result).toEqual([]);
  });

  test('single message preserved when budget allows', () => {
    const messages = [{ role: 'user' as const, content: 'привет' }];
    const result = trimHistory(messages, 8000, 1000);
    expect(result.length).toBe(1);
  });

  test('messages with empty content do not crash budget calc', () => {
    const messages = [
      { role: 'user' as const, content: '' },
      { role: 'assistant' as const, content: 'ответ' },
    ];
    const result = trimHistory(messages, 8000, 1000);
    expect(result.length).toBe(2);
  });

  test('messages with null content (defensive)', () => {
    const messages = [
      { role: 'user' as const, content: null as unknown as string },
      { role: 'assistant' as const, content: 'real' },
    ];
    // estimateTokens('') returns 0, so this is fine
    const result = trimHistory(messages, 8000, 1000);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  test('result.length >= 2 floor is always respected', () => {
    // Even with absurdly tight budget, last 2 messages survive.
    const messages = [
      { role: 'user' as const, content: 'a'.repeat(50_000) },
      { role: 'user' as const, content: 'b'.repeat(50_000) },
      { role: 'user' as const, content: 'c'.repeat(50_000) },
    ];
    const result = trimHistory(messages, 1000, 500);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});
