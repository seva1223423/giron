/**
 * Unit tests for services/deepseekAI.chat — the OpenAI-compatible client
 * that drives every AI chat message + every tool call.
 *
 * The pure / token-math helpers (estimateTokens, trimHistory, validateResponse,
 * cleanResponse) already have their own suites. What's NOT yet covered:
 *
 *   1. chat() retry behavior on transient errors:
 *      - 429 rate limit (with retry-after header honored)
 *      - 5xx server errors
 *      - Network errors (AbortError, fetch errors, ECONNREFUSED)
 *   2. Tool call malformed-JSON recovery — Mistral occasionally emits
 *      single-quoted / trailing-comma JSON; the safe parser fixes
 *      typical mistakes before giving up.
 *   3. Successful response shape: content + parsed toolCalls + the
 *      hasToolCalls flag.
 *   4. AI_API_KEY missing → throws clearly, doesn't silent-succeed.
 *
 * We mock global.fetch and use jest.useFakeTimers to avoid spending the
 * real RETRY_DELAY_MS (1500ms × N) on every retry test.
 */

const recordAIRequest = jest.fn();

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../utils/aiMetrics', () => ({
  recordAIRequest: (...args: unknown[]) => recordAIRequest(...args),
}));

import { chat, estimateTokens } from '../services/deepseekAI';
import { logger } from '../utils/logger';

const fetchMock = jest.fn();

beforeAll(() => {
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  process.env.AI_API_KEY = 'test-key-abc';
});

beforeEach(() => {
  fetchMock.mockReset();
  recordAIRequest.mockReset();
  (logger.warn as jest.Mock).mockClear();
  (logger.error as jest.Mock).mockClear();
});

function okJson(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => payload,
  };
}

function errorResp(status: number, body: string, retryAfter?: string) {
  return {
    ok: false,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'retry-after' ? retryAfter ?? null : null) },
    text: async () => body,
  };
}

const BASE_OPTS = {
  system: 'You are a fitness coach.',
  messages: [{ role: 'user' as const, content: 'Hello', tool_calls: undefined }],
  maxTokens: 256,
};

// ── estimateTokens (smoke check — companion to trimHistory.test.ts) ─────────

describe('estimateTokens', () => {
  test('returns 0 for empty string (ceil of 0/3.5)', () => {
    expect(estimateTokens('')).toBe(0);
  });

  test('returns proportional count for plain text', () => {
    expect(estimateTokens('abc')).toBe(Math.ceil(3 / 3.5));
    expect(estimateTokens('a'.repeat(100))).toBe(Math.ceil(100 / 3.5));
  });
});

// ── Successful response shape ──────────────────────────────────────────────

describe('chat — happy path', () => {
  test('returns content + empty toolCalls when no tool_calls in response', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        choices: [
          { message: { content: 'Squats build leg strength.' }, finish_reason: 'stop' },
        ],
      }),
    );

    const result = await chat({ ...BASE_OPTS });

    expect(result.content).toBe('Squats build leg strength.');
    expect(result.hasToolCalls).toBe(false);
    expect(result.toolCalls).toEqual([]);
    expect(recordAIRequest).toHaveBeenCalledWith(
      expect.objectContaining({ cacheHit: false, tokensEstimate: expect.any(Number) }),
    );
  });

  test('parses tool_calls with valid JSON arguments', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'tc-1',
                  function: { name: 'log_meal', arguments: '{"name":"oats","kcal":300}' },
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await chat({ ...BASE_OPTS });

    expect(result.hasToolCalls).toBe(true);
    expect(result.toolCalls).toEqual([
      { id: 'tc-1', name: 'log_meal', arguments: { name: 'oats', kcal: 300 } },
    ]);
  });

  test('includes tools + tool_choice:auto in body when tools array provided', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({ choices: [{ message: { content: 'ok' } }] }),
    );

    const tools = [
      {
        type: 'function' as const,
        function: { name: 'log_meal', description: 'log a meal', parameters: {} },
      },
    ];

    await chat({ ...BASE_OPTS, tools });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toBe('auto');
  });
});

// ── Malformed tool-call JSON recovery ──────────────────────────────────────

describe('chat — malformed tool call JSON recovery', () => {
  test('trailing-comma JSON is repaired, tool call returned successfully', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'tc-1',
                  function: { name: 'log_meal', arguments: '{"name":"oats","kcal":300,}' },
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await chat({ ...BASE_OPTS });
    expect(result.toolCalls).toEqual([
      { id: 'tc-1', name: 'log_meal', arguments: { name: 'oats', kcal: 300 } },
    ]);
  });

  test('completely unparseable JSON → tool call dropped + warn logged', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        choices: [
          {
            message: {
              content: 'fallback text',
              tool_calls: [
                {
                  id: 'tc-1',
                  function: { name: 'log_meal', arguments: 'NOT JSON AT ALL :{[' },
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await chat({ ...BASE_OPTS });

    // Malformed call dropped, content survives.
    expect(result.toolCalls).toEqual([]);
    expect(result.content).toBe('fallback text');
    // The "Skipping malformed tool call" warn is fired.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/Skipping malformed tool call: log_meal/),
    );
  });
});

// ── 429 + 5xx retry ────────────────────────────────────────────────────────

describe('chat — retry on transient errors', () => {
  test('429 → retries; success on attempt 2 returns the response', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    fetchMock
      .mockResolvedValueOnce(errorResp(429, 'rate limit', '1'))
      .mockResolvedValueOnce(okJson({ choices: [{ message: { content: 'recovered' } }] }));

    const promise = chat({ ...BASE_OPTS });
    await jest.runAllTimersAsync();
    const result = await promise;
    jest.useRealTimers();

    expect(result.content).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('500 → retries up to MAX_RETRIES; throws if all attempts fail', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    fetchMock
      .mockResolvedValueOnce(errorResp(500, 'oops'))
      .mockResolvedValueOnce(errorResp(500, 'oops'))
      .mockResolvedValueOnce(errorResp(500, 'oops'));

    // Set up the rejection expectation BEFORE running timers — otherwise
    // the rejection bubbles up as an unhandled promise rejection in the
    // window between runAllTimersAsync resolving and the await expect line.
    const promise = chat({ ...BASE_OPTS });
    const rejectionAssert = expect(promise).rejects.toThrow(/AI API error 500/);
    await jest.runAllTimersAsync();
    await rejectionAssert;
    jest.useRealTimers();

    // 1 initial + 2 retries = 3 calls (MAX_RETRIES=2 in source)
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(recordAIRequest).toHaveBeenCalledWith(
      expect.objectContaining({ error: true }),
    );
  });

  test('400 (bad request) → does NOT retry, throws immediately', async () => {
    fetchMock.mockResolvedValueOnce(errorResp(400, 'invalid model'));

    await expect(chat({ ...BASE_OPTS })).rejects.toThrow(/AI API error 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── Network error retry ────────────────────────────────────────────────────

describe('chat — network errors', () => {
  test('AbortError (timeout) → retries with backoff', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce(okJson({ choices: [{ message: { content: 'recovered' } }] }));

    const promise = chat({ ...BASE_OPTS });
    await jest.runAllTimersAsync();
    const result = await promise;
    jest.useRealTimers();

    expect(result.content).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('non-retryable error (TypeError-like with custom message) → throws on first failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('schema validation failed'));
    await expect(chat({ ...BASE_OPTS })).rejects.toThrow(/schema validation failed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── Missing API key ────────────────────────────────────────────────────────

describe('chat — env validation', () => {
  test('throws clearly when AI_API_KEY is unset', async () => {
    const saved = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;

    await expect(chat({ ...BASE_OPTS })).rejects.toThrow(/AI_API_KEY/);

    process.env.AI_API_KEY = saved;
  });
});
