/**
 * GigaChat (Sber) provider adapter.
 *
 * Activated via env:
 *   GIGACHAT_AUTH_KEY=<base64(clientId:clientSecret)>  # from cabinet
 *   GIGACHAT_SCOPE=GIGACHAT_API_PERS                   # optional
 *   GIGACHAT_MODEL=GigaChat                            # optional
 *
 * OAuth flow: client_credentials grant against
 *   https://ngw.devices.sberbank.ru:9443/api/v2/oauth
 * Returns a short-lived access token (currently 30 min). The adapter
 * caches and refreshes on demand.
 *
 * Chat endpoint:
 *   POST https://gigachat.devices.sberbank.ru/api/v1/chat/completions
 * with `Authorization: Bearer <access-token>`.
 *
 * API docs:
 *   https://developers.sber.ru/docs/ru/gigachat/api/overview
 *
 * Caveats:
 *   - Sber's TLS chain on `gigachat.devices.sberbank.ru` is signed by the
 *     Russian Trusted Root CA. Node.js default trust store on most
 *     non-RF servers will FAIL the TLS handshake until that CA is added
 *     via `NODE_EXTRA_CA_CERTS`. Document this in README before turning
 *     on in production.
 *   - GigaChat supports function-calling, but the schema differs from
 *     OpenAI's; the adapter passes tools through and parses the response
 *     in OpenAI-compatible shape — works for the common case but caller
 *     must keep tool definitions simple.
 *   - Streaming intentionally NOT implemented (router falls back to chat).
 */

import { randomUUID } from 'crypto';
import type {
  LLMProvider,
  LLMChatOptions,
  LLMChatResult,
} from './types';
import { LLMProviderUnavailableError } from './types';

const GIGACHAT_OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGACHAT_CHAT_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 60_000;
/** Refresh threshold — request a new token if the current one expires
 *  within this many ms. Avoids racing the expiry mid-request. */
const TOKEN_REFRESH_BUFFER_MS = 60_000;

interface TokenState {
  accessToken: string;
  expiresAt: number;
}

interface OAuthResponse {
  access_token: string;
  /** Sber documents this as ms since epoch. */
  expires_at: number;
}

interface GigaChatCompletionResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      function_call?: { name?: string; arguments?: string };
    };
  }>;
}

let tokenCache: TokenState | null = null;

function getAuthKey(): string {
  const key = process.env.GIGACHAT_AUTH_KEY;
  if (!key) throw new LLMProviderUnavailableError('gigachat', 'GIGACHAT_AUTH_KEY not set');
  return key;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return tokenCache.accessToken;
  }
  const scope = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
  const body = new URLSearchParams({ scope });

  let response: Response;
  try {
    response = await fetchWithTimeout(
      GIGACHAT_OAUTH_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'RqUID': randomUUID(),
          'Authorization': `Basic ${getAuthKey()}`,
        },
        body,
      },
      REQUEST_TIMEOUT_MS,
    );
  } catch (err) {
    throw new LLMProviderUnavailableError('gigachat', `OAuth network: ${String(err)}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // 4xx on OAuth is a config issue — permanent until env changes.
    throw new Error(`[gigachat] OAuth HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = (await response.json()) as OAuthResponse;
  if (!data.access_token || !data.expires_at) {
    throw new Error('[gigachat] OAuth response missing access_token/expires_at');
  }

  tokenCache = { accessToken: data.access_token, expiresAt: data.expires_at };
  return data.access_token;
}

/** Test-only escape hatch — drop the cached OAuth token so the next
 *  request re-authenticates. */
export function _clearTokenCacheForTest(): void {
  tokenCache = null;
}

export const gigachatAdapter: LLMProvider = {
  name: 'gigachat',

  isAvailable(): boolean {
    return Boolean(process.env.GIGACHAT_AUTH_KEY);
  },

  async chat(options: LLMChatOptions): Promise<LLMChatResult> {
    if (!this.isAvailable()) {
      throw new LLMProviderUnavailableError('gigachat', 'GIGACHAT_AUTH_KEY not set');
    }

    const token = await getAccessToken();

    const messages = [
      { role: 'system', content: options.system },
      ...options.messages.map((m) => ({
        role: m.role,
        content: m.content ?? '',
      })),
    ];

    const body: Record<string, unknown> = {
      model: options.model || process.env.GIGACHAT_MODEL || 'GigaChat',
      messages,
      stream: false,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    };

    if (options.tools && options.tools.length > 0) {
      body.functions = options.tools.map((t) => t.function);
      body.function_call = 'auto';
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(
        GIGACHAT_CHAT_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      );
    } catch (err) {
      throw new LLMProviderUnavailableError('gigachat', `network: ${String(err)}`);
    }

    if (response.status === 401) {
      // Token expired despite the buffer — drop the cache and tell the
      // router this attempt was transient.
      tokenCache = null;
      throw new LLMProviderUnavailableError('gigachat', 'auth token expired');
    }
    if (response.status === 429 || response.status >= 500) {
      const text = await response.text().catch(() => '');
      throw new LLMProviderUnavailableError('gigachat', `HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`[gigachat] HTTP ${response.status}: ${text.slice(0, 500)}`);
    }

    const data = (await response.json()) as GigaChatCompletionResponse;
    const choice = data.choices?.[0]?.message;
    const content = choice?.content ?? '';

    // Map GigaChat's function_call → OpenAI-style toolCalls so the
    // existing /chat handler can consume them without branching.
    const toolCalls: LLMChatResult['toolCalls'] = [];
    if (choice?.function_call?.name) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(choice.function_call.arguments || '{}');
      } catch {
        args = {};
      }
      toolCalls.push({
        id: `giga-${Date.now()}`,
        name: choice.function_call.name,
        arguments: args,
      });
    }

    return {
      content,
      toolCalls,
      hasToolCalls: toolCalls.length > 0,
    };
  },

  async healthCheck() {
    if (!this.isAvailable()) {
      return { ok: false, error: 'GIGACHAT_AUTH_KEY not set' };
    }
    try {
      // The cheapest live probe is fetching a fresh OAuth token — that's
      // one round-trip and confirms auth without hitting the chat endpoint.
      await getAccessToken();
      return { ok: true, model: process.env.GIGACHAT_MODEL || 'GigaChat' };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
};
