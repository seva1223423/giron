/**
 * Tests for the Yandex GPT adapter.
 *
 * Uses mocked global fetch — no real network. Verifies:
 *   - isAvailable gates on env presence
 *   - chat() shape: returns content, empty toolCalls (no function-calling)
 *   - chat() normalises tool-role messages to user-role
 *   - 5xx/429 → LLMProviderUnavailableError (transient)
 *   - 4xx (non-rate-limit) → plain Error (bubbles)
 *   - tools in options are ignored (provider doesn't support them)
 */

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { yandexAdapter } from '../services/llm/yandexAdapter';
import { LLMProviderUnavailableError } from '../services/llm/types';

const originalFetch = global.fetch;

function mockFetchResponse(status: number, jsonBody: unknown): typeof global.fetch {
  return jest.fn(async () =>
    new Response(JSON.stringify(jsonBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof global.fetch;
}

beforeEach(() => {
  delete process.env.YANDEX_API_KEY;
  delete process.env.YANDEX_FOLDER_ID;
  delete process.env.YANDEX_MODEL;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('yandex adapter — isAvailable gating', () => {
  test('isAvailable false when no env', () => {
    expect(yandexAdapter.isAvailable()).toBe(false);
  });

  test('isAvailable false when only one of the two env vars set', () => {
    process.env.YANDEX_API_KEY = 'key';
    expect(yandexAdapter.isAvailable()).toBe(false);
    delete process.env.YANDEX_API_KEY;
    process.env.YANDEX_FOLDER_ID = 'folder';
    expect(yandexAdapter.isAvailable()).toBe(false);
  });

  test('isAvailable true when both env vars set', () => {
    process.env.YANDEX_API_KEY = 'key';
    process.env.YANDEX_FOLDER_ID = 'folder';
    expect(yandexAdapter.isAvailable()).toBe(true);
  });
});

describe('yandex adapter — chat()', () => {
  beforeEach(() => {
    process.env.YANDEX_API_KEY = 'test-key';
    process.env.YANDEX_FOLDER_ID = 'test-folder';
  });

  test('throws LLMProviderUnavailableError when not available', async () => {
    delete process.env.YANDEX_API_KEY;
    await expect(
      yandexAdapter.chat({ system: '', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(LLMProviderUnavailableError);
  });

  test('returns content from result.alternatives[0].message.text', async () => {
    global.fetch = mockFetchResponse(200, {
      result: {
        alternatives: [{ message: { role: 'assistant', text: 'привет, я Яндекс' } }],
      },
    });
    const r = await yandexAdapter.chat({ system: 'sys', messages: [{ role: 'user', content: 'hi' }] });
    expect(r.content).toBe('привет, я Яндекс');
    expect(r.toolCalls).toEqual([]);
    expect(r.hasToolCalls).toBe(false);
  });

  test('sends Authorization "Api-Key <key>" + x-folder-id headers', async () => {
    const fetchMock = mockFetchResponse(200, {
      result: { alternatives: [{ message: { text: 'ok' } }] },
    });
    global.fetch = fetchMock;
    await yandexAdapter.chat({ system: 'sys', messages: [{ role: 'user', content: 'hi' }] });
    const callArgs = (fetchMock as jest.Mock).mock.calls[0];
    const init = callArgs[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Api-Key test-key');
    expect(headers['x-folder-id']).toBe('test-folder');
  });

  test('5xx response → LLMProviderUnavailableError (transient)', async () => {
    global.fetch = mockFetchResponse(503, { error: { message: 'service down' } });
    await expect(
      yandexAdapter.chat({ system: '', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(LLMProviderUnavailableError);
  });

  test('429 response → LLMProviderUnavailableError (transient)', async () => {
    global.fetch = mockFetchResponse(429, { error: { message: 'rate limited' } });
    await expect(
      yandexAdapter.chat({ system: '', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(LLMProviderUnavailableError);
  });

  test('4xx (non-rate-limit) → plain Error (bubbles)', async () => {
    global.fetch = mockFetchResponse(400, { error: { message: 'bad request' } });
    await expect(
      yandexAdapter.chat({ system: '', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/HTTP 400/);
  });

  test('tool-role messages are collapsed to user-role (Yandex has no tool concept)', async () => {
    const fetchMock = mockFetchResponse(200, {
      result: { alternatives: [{ message: { text: 'ok' } }] },
    });
    global.fetch = fetchMock;
    await yandexAdapter.chat({
      system: 'sys',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'tool', content: 'tool result', tool_call_id: 'x' },
      ],
    });
    const callArgs = (fetchMock as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    // No 'tool' role anywhere in the messages array.
    const roles = body.messages.map((m: { role: string }) => m.role);
    expect(roles).not.toContain('tool');
    // Both the original user message AND the converted tool message present.
    expect(roles.filter((r: string) => r === 'user').length).toBe(2);
  });

  test('tools passed in options are silently ignored', async () => {
    const fetchMock = mockFetchResponse(200, {
      result: { alternatives: [{ message: { text: 'ok' } }] },
    });
    global.fetch = fetchMock;
    await yandexAdapter.chat({
      system: '',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'foo', description: 'd', parameters: {} } }],
    });
    const callArgs = (fetchMock as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    // Body must not contain "tools" / "functions" / "function_call".
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('functions');
    expect(body).not.toHaveProperty('function_call');
  });

  test('uses modelUri with YANDEX_MODEL when set', async () => {
    process.env.YANDEX_MODEL = 'yandexgpt';
    const fetchMock = mockFetchResponse(200, {
      result: { alternatives: [{ message: { text: 'ok' } }] },
    });
    global.fetch = fetchMock;
    await yandexAdapter.chat({ system: '', messages: [{ role: 'user', content: 'hi' }] });
    const body = JSON.parse((fetchMock as jest.Mock).mock.calls[0][1].body as string);
    expect(body.modelUri).toBe('gpt://test-folder/yandexgpt/latest');
  });
});

describe('yandex adapter — healthCheck()', () => {
  test('returns ok=false when not available', async () => {
    const r = await yandexAdapter.healthCheck();
    expect(r.ok).toBe(false);
  });
});
