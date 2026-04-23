/**
 * Tests for the LLM provider router (MEGA-AI-03).
 *
 * The router is a tiny policy layer — its responsibilities are:
 *   1. Resolve a chain of providers from env.
 *   2. Skip unavailable providers.
 *   3. Retry transient failures down the chain.
 *   4. Bubble permanent errors.
 *   5. Intent overrides.
 *
 * We stub the provider registry directly (via __internals.PROVIDERS) so
 * these tests don't depend on any real HTTP client.
 */

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/errorReporter', () => ({
  reportError: jest.fn(),
}));

import { chat, healthCheckAll, __internals } from '../services/llm/router';
import type { LLMProvider, LLMChatResult } from '../services/llm/types';
import { LLMProviderUnavailableError } from '../services/llm/types';

function makeStub(overrides: Partial<LLMProvider> & { name: string }): LLMProvider {
  return {
    isAvailable: () => true,
    chat: jest.fn(async (): Promise<LLMChatResult> => ({
      content: `hello from ${overrides.name}`,
      toolCalls: [],
      hasToolCalls: false,
    })),
    healthCheck: jest.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

const originalProviders = { ...__internals.PROVIDERS };

beforeEach(() => {
  // Wipe the registry between tests so each case builds its own providers.
  for (const key of Object.keys(__internals.PROVIDERS)) delete __internals.PROVIDERS[key];
  // Clean env — router reads AI_PRIMARY_PROVIDER / AI_FALLBACK_CHAIN at
  // resolve time, so we reset for deterministic runs.
  delete process.env.AI_PRIMARY_PROVIDER;
  delete process.env.AI_FALLBACK_CHAIN;
  delete process.env.AI_SAFETY_PROVIDER;
  delete process.env.AI_COMPLEX_PROVIDER;
});

afterAll(() => {
  // Restore original registry for other test files that might share module.
  for (const [k, v] of Object.entries(originalProviders)) __internals.PROVIDERS[k] = v;
});

describe('chat — happy path', () => {
  test('uses the single configured provider', async () => {
    __internals.PROVIDERS.alpha = makeStub({ name: 'alpha' });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';

    const result = await chat({ system: 'sys', messages: [] });

    expect(result.content).toBe('hello from alpha');
    expect(__internals.PROVIDERS.alpha.chat).toHaveBeenCalledTimes(1);
  });

  test('default chain is mistral-only when env is unset', async () => {
    __internals.PROVIDERS.mistral = makeStub({ name: 'mistral' });

    const result = await chat({ system: 'sys', messages: [] });

    expect(result.content).toBe('hello from mistral');
  });
});

describe('chat — fallback chain', () => {
  test('skips unavailable primary and tries next in chain', async () => {
    __internals.PROVIDERS.alpha = makeStub({ name: 'alpha', isAvailable: () => false });
    __internals.PROVIDERS.beta = makeStub({ name: 'beta' });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';
    process.env.AI_FALLBACK_CHAIN = 'beta';

    const result = await chat({ system: 'sys', messages: [] });

    expect(result.content).toBe('hello from beta');
    expect(__internals.PROVIDERS.alpha.chat).not.toHaveBeenCalled();
  });

  test('retries on transient (LLMProviderUnavailableError) down the chain', async () => {
    __internals.PROVIDERS.alpha = makeStub({
      name: 'alpha',
      chat: jest.fn(async () => {
        throw new LLMProviderUnavailableError('alpha', '503');
      }),
    });
    __internals.PROVIDERS.beta = makeStub({ name: 'beta' });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';
    process.env.AI_FALLBACK_CHAIN = 'beta';

    const result = await chat({ system: 'sys', messages: [] });

    expect(result.content).toBe('hello from beta');
    expect(__internals.PROVIDERS.alpha.chat).toHaveBeenCalledTimes(1);
    expect(__internals.PROVIDERS.beta.chat).toHaveBeenCalledTimes(1);
  });

  test('bubbles permanent error (non-transient) without trying fallback', async () => {
    const permanent = new Error('400 Bad Request');
    __internals.PROVIDERS.alpha = makeStub({
      name: 'alpha',
      chat: jest.fn(async () => {
        throw permanent;
      }),
    });
    __internals.PROVIDERS.beta = makeStub({ name: 'beta' });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';
    process.env.AI_FALLBACK_CHAIN = 'beta';

    await expect(chat({ system: 'sys', messages: [] })).rejects.toThrow('400 Bad Request');
    expect(__internals.PROVIDERS.beta.chat).not.toHaveBeenCalled();
  });

  test('throws when entire chain exhausted by transient errors', async () => {
    __internals.PROVIDERS.alpha = makeStub({
      name: 'alpha',
      chat: jest.fn(async () => {
        throw new LLMProviderUnavailableError('alpha', 'boom');
      }),
    });
    __internals.PROVIDERS.beta = makeStub({
      name: 'beta',
      chat: jest.fn(async () => {
        throw new LLMProviderUnavailableError('beta', 'boom');
      }),
    });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';
    process.env.AI_FALLBACK_CHAIN = 'beta';

    await expect(chat({ system: 'sys', messages: [] })).rejects.toThrow(/All LLM providers failed/);
  });

  test('throws when no providers are configured at all', async () => {
    // Empty registry AND primary pointing at a non-existent key.
    process.env.AI_PRIMARY_PROVIDER = 'ghost';

    await expect(chat({ system: 'sys', messages: [] })).rejects.toThrow(/No LLM providers/);
  });
});

describe('chat — intent override', () => {
  test('AI_SAFETY_PROVIDER wins for medical_concern', async () => {
    __internals.PROVIDERS.alpha = makeStub({ name: 'alpha' });
    __internals.PROVIDERS.safe = makeStub({ name: 'safe' });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';
    process.env.AI_SAFETY_PROVIDER = 'safe';

    const result = await chat({ system: 'sys', messages: [] }, 'medical_concern');

    expect(result.content).toBe('hello from safe');
    expect(__internals.PROVIDERS.alpha.chat).not.toHaveBeenCalled();
  });

  test('safety override falls through to default chain when provider missing', async () => {
    __internals.PROVIDERS.alpha = makeStub({ name: 'alpha' });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';
    // AI_SAFETY_PROVIDER unset — medical_concern falls back to default.

    const result = await chat({ system: 'sys', messages: [] }, 'medical_concern');

    expect(result.content).toBe('hello from alpha');
  });

  test('AI_COMPLEX_PROVIDER wins for complex_planning', async () => {
    __internals.PROVIDERS.alpha = makeStub({ name: 'alpha' });
    __internals.PROVIDERS.heavy = makeStub({ name: 'heavy' });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';
    process.env.AI_COMPLEX_PROVIDER = 'heavy';

    const result = await chat({ system: 'sys', messages: [] }, 'complex_planning');

    expect(result.content).toBe('hello from heavy');
  });

  test('override does NOT fire for unrelated intent', async () => {
    __internals.PROVIDERS.alpha = makeStub({ name: 'alpha' });
    __internals.PROVIDERS.safe = makeStub({ name: 'safe' });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';
    process.env.AI_SAFETY_PROVIDER = 'safe';

    const result = await chat({ system: 'sys', messages: [] }, 'food_log');

    expect(result.content).toBe('hello from alpha');
  });
});

describe('chain resolution — dedup + ordering', () => {
  test('duplicate entries in fallback chain are collapsed', async () => {
    __internals.PROVIDERS.alpha = makeStub({
      name: 'alpha',
      chat: jest.fn(async () => {
        throw new LLMProviderUnavailableError('alpha', 'boom');
      }),
    });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';
    process.env.AI_FALLBACK_CHAIN = 'alpha,alpha,alpha';

    // Should try alpha exactly once (dedup), then fail.
    await expect(chat({ system: 'sys', messages: [] })).rejects.toThrow(/All LLM providers failed/);
    expect(__internals.PROVIDERS.alpha.chat).toHaveBeenCalledTimes(1);
  });

  test('unknown provider names in chain are ignored gracefully', async () => {
    __internals.PROVIDERS.alpha = makeStub({ name: 'alpha' });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';
    process.env.AI_FALLBACK_CHAIN = 'does-not-exist,also-missing';

    const result = await chat({ system: 'sys', messages: [] });

    expect(result.content).toBe('hello from alpha');
  });
});

describe('healthCheckAll', () => {
  test('reports status for every configured provider', async () => {
    __internals.PROVIDERS.alpha = makeStub({ name: 'alpha' });
    __internals.PROVIDERS.beta = makeStub({
      name: 'beta',
      healthCheck: jest.fn(async () => ({ ok: false, error: 'down' })),
    });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';
    process.env.AI_FALLBACK_CHAIN = 'beta';

    const health = await healthCheckAll();

    expect(health).toEqual([
      { name: 'alpha', ok: true, error: undefined },
      { name: 'beta', ok: false, error: 'down' },
    ]);
  });

  test('catches healthCheck throwers without failing the whole report', async () => {
    __internals.PROVIDERS.alpha = makeStub({
      name: 'alpha',
      healthCheck: jest.fn(async () => {
        throw new Error('probe exploded');
      }),
    });
    process.env.AI_PRIMARY_PROVIDER = 'alpha';

    const health = await healthCheckAll();

    expect(health[0].name).toBe('alpha');
    expect(health[0].ok).toBe(false);
    expect(health[0].error).toContain('probe exploded');
  });
});
