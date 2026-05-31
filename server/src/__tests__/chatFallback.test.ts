/**
 * Tests for ai/chatFallback.runChatFallback — the 2-tier degradation
 * that runs after a primary chat() failure.
 *
 * Verifies:
 *   1. Tier 1 success path returns { ok: true, tier: 1 }.
 *   2. Tier 1 failure → tier 2 attempt; tier 2 success returns
 *      { ok: true, tier: 2 }.
 *   3. Both tiers fail → returns { ok: false, lastError }.
 *   4. Tier 1 uses shorter context (last 6 messages).
 *   5. Tier 2 uses minimal system prompt + only the user message.
 */

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockChatWithoutTools = jest.fn();
jest.mock('../services/deepseekAI', () => ({
  chatWithoutTools: (...args: unknown[]) => mockChatWithoutTools(...args),
}));

import { runChatFallback } from '../ai/chatFallback';
import type { DeepSeekMessage } from '../services/deepseekAI';

beforeEach(() => {
  mockChatWithoutTools.mockReset();
});

function makeMessages(count: number): DeepSeekMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `msg ${i}`,
  }));
}

describe('runChatFallback — tier 1 success', () => {
  test('returns { ok: true, tier: 1 } when tier 1 succeeds', async () => {
    mockChatWithoutTools.mockResolvedValueOnce('tier-1 response');
    const r = await runChatFallback({
      messages: makeMessages(10),
      finalSystemPrompt: 'sys',
      userContext: '',
      userMessage: 'hi',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tier).toBe(1);
      expect(r.content).toBe('tier-1 response');
    }
    expect(mockChatWithoutTools).toHaveBeenCalledTimes(1);
  });

  test('tier 1 uses only last 6 messages (slice -6)', async () => {
    mockChatWithoutTools.mockResolvedValueOnce('ok');
    const allMessages = makeMessages(20);
    await runChatFallback({
      messages: allMessages,
      finalSystemPrompt: 'sys',
      userContext: '',
      userMessage: 'hi',
    });
    const callArgs = mockChatWithoutTools.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(6);
    expect(callArgs.messages[0]).toEqual(allMessages[14]);
    expect(callArgs.messages[5]).toEqual(allMessages[19]);
  });

  test('tier 1 preserves the full system prompt', async () => {
    mockChatWithoutTools.mockResolvedValueOnce('ok');
    await runChatFallback({
      messages: makeMessages(2),
      finalSystemPrompt: 'big system prompt',
      userContext: '',
      userMessage: 'hi',
    });
    const callArgs = mockChatWithoutTools.mock.calls[0][0];
    expect(callArgs.system).toBe('big system prompt');
  });
});

describe('runChatFallback — tier 2 takeover', () => {
  test('tier 1 fails → tier 2 succeeds → returns { ok: true, tier: 2 }', async () => {
    mockChatWithoutTools
      .mockRejectedValueOnce(new Error('tier 1 boom'))
      .mockResolvedValueOnce('tier-2 minimal response');
    const r = await runChatFallback({
      messages: makeMessages(4),
      finalSystemPrompt: 'sys',
      userContext: 'user is sevka',
      userMessage: 'help me',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tier).toBe(2);
      expect(r.content).toBe('tier-2 minimal response');
    }
    expect(mockChatWithoutTools).toHaveBeenCalledTimes(2);
  });

  test('tier 2 uses MINIMAL system prompt (with userContext appended)', async () => {
    mockChatWithoutTools
      .mockRejectedValueOnce(new Error('t1 fail'))
      .mockResolvedValueOnce('t2');
    await runChatFallback({
      messages: makeMessages(4),
      finalSystemPrompt: 'sys (huge prompt)',
      userContext: 'profile: sevka, M, 80kg',
      userMessage: 'help',
    });
    const t2Args = mockChatWithoutTools.mock.calls[1][0];
    // Minimal prompt explicitly does NOT include the huge sys prompt
    expect(t2Args.system).not.toContain('huge prompt');
    expect(t2Args.system).toContain('Iron Coach');
    expect(t2Args.system).toContain('profile: sevka, M, 80kg');
  });

  test('tier 2 uses only the user message (single-element messages array)', async () => {
    mockChatWithoutTools
      .mockRejectedValueOnce(new Error('t1 fail'))
      .mockResolvedValueOnce('t2');
    await runChatFallback({
      messages: makeMessages(10),
      finalSystemPrompt: 'sys',
      userContext: '',
      userMessage: 'one-shot question',
    });
    const t2Args = mockChatWithoutTools.mock.calls[1][0];
    expect(t2Args.messages).toEqual([{ role: 'user', content: 'one-shot question' }]);
  });

  test('tier 2 token budget shrinks (2048 vs tier 1\'s 4096)', async () => {
    mockChatWithoutTools
      .mockRejectedValueOnce(new Error('t1 fail'))
      .mockResolvedValueOnce('t2');
    await runChatFallback({
      messages: makeMessages(4),
      finalSystemPrompt: 'sys',
      userContext: '',
      userMessage: 'q',
    });
    expect(mockChatWithoutTools.mock.calls[0][0].maxTokens).toBe(4096);
    expect(mockChatWithoutTools.mock.calls[1][0].maxTokens).toBe(2048);
  });
});

describe('runChatFallback — total failure', () => {
  test('both tiers fail → returns { ok: false, lastError }', async () => {
    const tier2Err = new Error('tier 2 boom');
    mockChatWithoutTools
      .mockRejectedValueOnce(new Error('tier 1 boom'))
      .mockRejectedValueOnce(tier2Err);
    const r = await runChatFallback({
      messages: makeMessages(4),
      finalSystemPrompt: 'sys',
      userContext: '',
      userMessage: 'q',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.lastError).toBe(tier2Err);
    }
    expect(mockChatWithoutTools).toHaveBeenCalledTimes(2);
  });

  test('never throws — total failure surfaces as { ok: false }', async () => {
    mockChatWithoutTools
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'));
    await expect(
      runChatFallback({
        messages: [],
        finalSystemPrompt: '',
        userContext: '',
        userMessage: '',
      }),
    ).resolves.toMatchObject({ ok: false });
  });
});
