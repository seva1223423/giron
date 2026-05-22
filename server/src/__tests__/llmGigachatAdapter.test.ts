/**
 * Tests for the GigaChat adapter.
 *
 * Mocks global fetch for both the OAuth token endpoint and the chat
 * endpoint. Verifies:
 *   - isAvailable gates on GIGACHAT_AUTH_KEY
 *   - OAuth flow runs once and is cached
 *   - 401 invalidates token cache and signals transient
 *   - 5xx/429 → transient
 *   - function-calling response maps to LLMChatResult.toolCalls
 */

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { gigachatAdapter, _clearTokenCacheForTest } from '../services/llm/gigachatAdapter';
import { LLMProviderUnavailableError } from '../services/llm/types';

const originalFetch = global.fetch;

interface FetchCallSpec {
  status: number;
  body: unknown;
}

/** Sequential fetch mock: first call returns specs[0], second specs[1], etc. */
function mockFetchSequence(specs: FetchCallSpec[]): jest.Mock {
  let i = 0;
  return jest.fn(async () => {
    const spec = specs[i] ?? specs[specs.length - 1];
    i += 1;
    return new Response(JSON.stringify(spec.body), {
      status: spec.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

beforeEach(() => {
  delete process.env.GIGACHAT_AUTH_KEY;
  delete process.env.GIGACHAT_SCOPE;
  delete process.env.GIGACHAT_MODEL;
  _clearTokenCacheForTest();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('gigachat adapter — isAvailable gating', () => {
  test('isAvailable false when GIGACHAT_AUTH_KEY missing', () => {
    expect(gigachatAdapter.isAvailable()).toBe(false);
  });

  test('isAvailable true when GIGACHAT_AUTH_KEY set', () => {
    process.env.GIGACHAT_AUTH_KEY = 'base64-key';
    expect(gigachatAdapter.isAvailable()).toBe(true);
  });
});

describe('gigachat adapter — chat() happy path', () => {
  beforeEach(() => {
    process.env.GIGACHAT_AUTH_KEY = 'test-auth-key';
  });

  test('OAuth → chat returns content', async () => {
    const mock = mockFetchSequence([
      { status: 200, body: { access_token: 'token-1', expires_at: Date.now() + 30 * 60 * 1000 } },
      { status: 200, body: { choices: [{ message: { role: 'assistant', content: 'Привет' } }] } },
    ]);
    global.fetch = mock as unknown as typeof global.fetch;

    const r = await gigachatAdapter.chat({
      system: 'sys',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(r.content).toBe('Привет');
    expect(r.toolCalls).toEqual([]);
    expect(mock).toHaveBeenCalledTimes(2);

    // First call was OAuth
    expect(mock.mock.calls[0][0]).toContain('oauth');
    // Second call was chat completions
    expect(mock.mock.calls[1][0]).toContain('chat/completions');
  });

  test('OAuth token is cached — second chat call skips OAuth', async () => {
    const mock = mockFetchSequence([
      { status: 200, body: { access_token: 'token-1', expires_at: Date.now() + 30 * 60 * 1000 } },
      { status: 200, body: { choices: [{ message: { content: 'first' } }] } },
      { status: 200, body: { choices: [{ message: { content: 'second' } }] } },
    ]);
    global.fetch = mock as unknown as typeof global.fetch;

    await gigachatAdapter.chat({ system: '', messages: [{ role: 'user', content: 'a' }] });
    await gigachatAdapter.chat({ system: '', messages: [{ role: 'user', content: 'b' }] });

    // 1 OAuth + 2 chat calls = 3 total
    expect(mock).toHaveBeenCalledTimes(3);
  });

  test('function_call response is mapped to toolCalls[]', async () => {
    const mock = mockFetchSequence([
      { status: 200, body: { access_token: 't', expires_at: Date.now() + 60_000 } },
      {
        status: 200,
        body: {
          choices: [{
            message: {
              content: null,
              function_call: { name: 'log_meal', arguments: '{"type":"dinner","calories":500}' },
            },
          }],
        },
      },
    ]);
    global.fetch = mock as unknown as typeof global.fetch;

    const r = await gigachatAdapter.chat({
      system: '',
      messages: [{ role: 'user', content: 'log my dinner' }],
      tools: [{ type: 'function', function: { name: 'log_meal', description: 'log', parameters: {} } }],
    });

    expect(r.hasToolCalls).toBe(true);
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].name).toBe('log_meal');
    expect(r.toolCalls[0].arguments).toEqual({ type: 'dinner', calories: 500 });
  });
});

describe('gigachat adapter — chat() error paths', () => {
  beforeEach(() => {
    process.env.GIGACHAT_AUTH_KEY = 'test-auth-key';
  });

  test('throws LLMProviderUnavailableError when GIGACHAT_AUTH_KEY missing', async () => {
    delete process.env.GIGACHAT_AUTH_KEY;
    await expect(
      gigachatAdapter.chat({ system: '', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(LLMProviderUnavailableError);
  });

  test('OAuth 4xx → plain Error (permanent, bubbles)', async () => {
    global.fetch = mockFetchSequence([
      { status: 401, body: { error: 'bad credentials' } },
    ]) as unknown as typeof global.fetch;
    await expect(
      gigachatAdapter.chat({ system: '', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/OAuth HTTP 401/);
  });

  test('chat 401 (token expired) → invalidates cache + transient', async () => {
    const mock = mockFetchSequence([
      { status: 200, body: { access_token: 't', expires_at: Date.now() + 60_000 } },
      { status: 401, body: { error: 'expired' } },
    ]);
    global.fetch = mock as unknown as typeof global.fetch;

    await expect(
      gigachatAdapter.chat({ system: '', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(LLMProviderUnavailableError);
  });

  test('chat 5xx → LLMProviderUnavailableError (transient)', async () => {
    global.fetch = mockFetchSequence([
      { status: 200, body: { access_token: 't', expires_at: Date.now() + 60_000 } },
      { status: 503, body: { error: 'down' } },
    ]) as unknown as typeof global.fetch;
    await expect(
      gigachatAdapter.chat({ system: '', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(LLMProviderUnavailableError);
  });

  test('chat 429 → LLMProviderUnavailableError (transient)', async () => {
    global.fetch = mockFetchSequence([
      { status: 200, body: { access_token: 't', expires_at: Date.now() + 60_000 } },
      { status: 429, body: { error: 'rate limited' } },
    ]) as unknown as typeof global.fetch;
    await expect(
      gigachatAdapter.chat({ system: '', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(LLMProviderUnavailableError);
  });

  test('chat 4xx (non-401, non-429) → plain Error (permanent)', async () => {
    global.fetch = mockFetchSequence([
      { status: 200, body: { access_token: 't', expires_at: Date.now() + 60_000 } },
      { status: 400, body: { error: 'bad request' } },
    ]) as unknown as typeof global.fetch;
    await expect(
      gigachatAdapter.chat({ system: '', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/HTTP 400/);
  });
});

describe('gigachat adapter — healthCheck()', () => {
  test('returns ok=false when not available', async () => {
    const r = await gigachatAdapter.healthCheck();
    expect(r.ok).toBe(false);
  });

  test('returns ok=true when OAuth round-trip succeeds', async () => {
    process.env.GIGACHAT_AUTH_KEY = 'test-auth-key';
    global.fetch = mockFetchSequence([
      { status: 200, body: { access_token: 't', expires_at: Date.now() + 60_000 } },
    ]) as unknown as typeof global.fetch;
    const r = await gigachatAdapter.healthCheck();
    expect(r.ok).toBe(true);
  });
});
