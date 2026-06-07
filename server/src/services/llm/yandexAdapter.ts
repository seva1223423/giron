/**
 * Yandex Foundation Models (YandexGPT) provider adapter.
 *
 * Activated via env:
 *   YANDEX_API_KEY=<Api-Key from yandex cloud console>
 *   YANDEX_FOLDER_ID=<folder catalog id>
 *   YANDEX_MODEL=yandexgpt-lite          # optional, default yandexgpt-lite
 *
 * API docs:
 *   https://yandex.cloud/docs/foundation-models/text-generation/api-ref/TextGeneration/completion
 *
 * Caveats:
 *   - No native function-calling. `toolCalls` always empty even when
 *     the caller passes `tools` — the router decides whether that's a
 *     deal-breaker for the intent.
 *   - Streaming: yandex returns chunked NDJSON but the shape differs from
 *     OpenAI's SSE. Streaming intentionally NOT implemented here — the
 *     router will fall back to the non-stream `chat()`.
 *   - Region: only `llm.api.cloud.yandex.net` works. Tied to RF cloud.
 */

import type {
  LLMProvider,
  LLMChatOptions,
  LLMChatResult,
  LLMMessage,
} from './types';
import { LLMProviderUnavailableError } from './types';
import { logger } from '../../utils/logger';

const YANDEX_API_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';
const REQUEST_TIMEOUT_MS = 60_000;

interface YandexCompletionResponse {
  result?: {
    alternatives?: Array<{
      message?: { role?: string; text?: string };
      status?: string;
    }>;
    usage?: {
      inputTextTokens?: string;
      completionTokens?: string;
      totalTokens?: string;
    };
  };
}

function getApiKey(): string {
  const key = process.env.YANDEX_API_KEY;
  if (!key) throw new LLMProviderUnavailableError('yandex', 'YANDEX_API_KEY not set');
  return key;
}

function getFolderId(): string {
  const folder = process.env.YANDEX_FOLDER_ID;
  if (!folder) throw new LLMProviderUnavailableError('yandex', 'YANDEX_FOLDER_ID not set');
  return folder;
}

function getModelUri(): string {
  const model = process.env.YANDEX_MODEL || 'yandexgpt-lite';
  return `gpt://${getFolderId()}/${model}/latest`;
}

/** Convert from the shared LLMMessage shape to Yandex's. Yandex uses
 *  `text` instead of `content`, and rejects `null` (we coerce to ''). */
function normalizeMessages(system: string, messages: LLMMessage[]): Array<{ role: string; text: string }> {
  const out: Array<{ role: string; text: string }> = [];
  if (system) out.push({ role: 'system', text: system });
  for (const m of messages) {
    // Yandex doesn't support tool messages; collapse to user-prefixed text.
    const role = m.role === 'tool' ? 'user' : m.role;
    const text = m.content ?? '';
    out.push({ role, text });
  }
  return out;
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

export const yandexAdapter: LLMProvider = {
  name: 'yandex',

  isAvailable(): boolean {
    return Boolean(process.env.YANDEX_API_KEY && process.env.YANDEX_FOLDER_ID);
  },

  async chat(options: LLMChatOptions): Promise<LLMChatResult> {
    if (!this.isAvailable()) {
      throw new LLMProviderUnavailableError('yandex', 'YANDEX_API_KEY or YANDEX_FOLDER_ID not set');
    }

    if (options.tools && options.tools.length > 0) {
      logger.debug('[yandex] tools requested but provider does not support function-calling; ignoring');
    }

    const body = {
      modelUri: getModelUri(),
      completionOptions: {
        stream: false,
        temperature: options.temperature ?? 0.7,
        maxTokens: String(options.maxTokens ?? 2000),
      },
      messages: normalizeMessages(options.system, options.messages),
    };

    let response: Response;
    try {
      response = await fetchWithTimeout(
        YANDEX_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Api-Key ${getApiKey()}`,
            'x-folder-id': getFolderId(),
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      );
    } catch (err) {
      // Network/abort errors → transient.
      throw new LLMProviderUnavailableError('yandex', `network: ${String(err)}`);
    }

    if (response.status === 429 || response.status >= 500) {
      const text = await response.text().catch(() => '');
      throw new LLMProviderUnavailableError('yandex', `HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`[yandex] HTTP ${response.status}: ${text.slice(0, 500)}`);
    }

    const data = (await response.json()) as YandexCompletionResponse;
    const message = data.result?.alternatives?.[0]?.message;
    const content = message?.text ?? '';

    return {
      content,
      toolCalls: [],
      hasToolCalls: false,
    };
  },

  async healthCheck() {
    if (!this.isAvailable()) {
      return { ok: false, error: 'YANDEX_API_KEY or YANDEX_FOLDER_ID not set' };
    }
    // Cheapest probe: one-token completion of a fixed prompt. Yandex has
    // no dedicated /models endpoint matching our health-check contract,
    // and sending a tiny chat call confirms both auth and routing.
    try {
      const r = await this.chat({
        system: '',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1,
        temperature: 0,
      });
      return { ok: true, model: process.env.YANDEX_MODEL || 'yandexgpt-lite', error: r.content ? undefined : 'empty response' };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
};
