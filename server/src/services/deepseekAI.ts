/**
 * AI Service — универсальный OpenAI-совместимый клиент
 *
 * Работает через fetch — никаких внешних SDK.
 * Провайдер задаётся через .env — переключение без изменения кода:
 *
 * Mistral (сейчас, бесплатно):
 *   AI_BASE_URL=https://api.mistral.ai/v1
 *   AI_MODEL=mistral-small-latest
 *   AI_API_KEY=<mistral_key>
 *
 * DeepSeek (продакшен, $0.14/1M токенов):
 *   AI_BASE_URL=https://api.deepseek.com
 *   AI_MODEL=deepseek-chat
 *   AI_API_KEY=<deepseek_key>
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeepSeekTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface ChatOptions {
  system: string;
  messages: DeepSeekMessage[];
  tools?: DeepSeekTool[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  hasToolCalls: boolean;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.mistral.ai/v1';
const DEFAULT_MODEL = process.env.AI_MODEL || 'mistral-small-latest';
const REQUEST_TIMEOUT_MS = 60_000; // 60 секунд на запрос
const MAX_RETRIES = 2; // Повторы при ошибках сети/5xx
const RETRY_DELAY_MS = 1500;

function getApiKey(): string {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error('AI_API_KEY не задан в .env');
  return key;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** fetch с таймаутом */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Задержка для retry */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Безопасный парсинг JSON из tool call arguments (DeepSeek/Mistral иногда ломают JSON) */
function safeParseToolArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    // Попробуем исправить типичные ошибки DeepSeek: trailing commas, одинарные кавычки
    try {
      const fixed = raw
        .replace(/,\s*}/g, '}')           // trailing comma перед }
        .replace(/,\s*]/g, ']')           // trailing comma перед ]
        .replace(/'/g, '"')               // одинарные кавычки → двойные
        .replace(/(\w+)\s*:/g, '"$1":')   // ключи без кавычек
        .replace(/""(\w+)""/g, '"$1"');   // двойные кавычки
      return JSON.parse(fixed);
    } catch {
      console.error('Failed to parse tool arguments:', raw);
      return {};
    }
  }
}

/** Грубая оценка токенов (1 токен ≈ 4 символа для русского текста, ~3.5 для английского) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Обрезка истории сообщений чтобы влезть в контекст */
export function trimHistory(
  messages: DeepSeekMessage[],
  maxTokens: number,
  systemTokens: number,
): DeepSeekMessage[] {
  const available = maxTokens - systemTokens - 2000; // запас на ответ
  if (available <= 0) return messages.slice(-2); // только последние 2 сообщения

  let totalTokens = 0;
  const result: DeepSeekMessage[] = [];

  // Идём с конца (новые сообщения важнее)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const tokens = estimateTokens(msg.content || '');
    if (totalTokens + tokens > available && result.length >= 2) break;
    totalTokens += tokens;
    result.unshift(msg);
  }

  return result;
}

// ─── Chat (text + tool calling) ──────────────────────────────────────────────

export async function chat(options: ChatOptions): Promise<ChatResult> {
  const model = options.model || DEFAULT_MODEL;

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: options.system },
    ...options.messages,
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
  };

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = 'auto';
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getApiKey()}`,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        `${AI_BASE_URL}/chat/completions`,
        { method: 'POST', headers, body: JSON.stringify(body) },
        REQUEST_TIMEOUT_MS,
      );

      // 429 (rate limit) или 5xx — retry с задержкой
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAY_MS * (attempt + 1);
        console.warn(`AI API ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason?: string;
        }>;
      };

      const msg = data.choices?.[0]?.message || {};
      const rawToolCalls = msg.tool_calls || [];

      // Безопасный парсинг tool call arguments
      const toolCalls = rawToolCalls
        .map((tc) => {
          const args = safeParseToolArgs(tc.function.arguments);
          // Пропускаем tool calls с пустыми аргументами (ошибка парсинга)
          if (Object.keys(args).length === 0 && tc.function.arguments.trim().length > 2) {
            console.warn(`Skipping malformed tool call: ${tc.function.name}, raw: ${tc.function.arguments}`);
            return null;
          }
          return { id: tc.id, name: tc.function.name, arguments: args };
        })
        .filter((tc): tc is NonNullable<typeof tc> => tc !== null);

      return {
        content: msg.content || '',
        toolCalls,
        hasToolCalls: toolCalls.length > 0,
      };
    } catch (err) {
      lastError = err as Error;

      // AbortError = таймаут; TypeError/fetch errors = сеть — retry
      const isRetryable = (err as Error).name === 'AbortError' ||
        (err as Error).message?.includes('fetch') ||
        (err as Error).message?.includes('ECONNREFUSED') ||
        (err as Error).message?.includes('ETIMEDOUT');

      if (isRetryable && attempt < MAX_RETRIES) {
        console.warn(`AI API network error, retry ${attempt + 1}/${MAX_RETRIES}: ${(err as Error).message}`);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error('AI API: все попытки исчерпаны');
}

// ─── Chat without tools (fallback) ──────────────────────────────────────────

export async function chatWithoutTools(options: Omit<ChatOptions, 'tools'>): Promise<string> {
  const result = await chat({ ...options, tools: undefined });
  return result.content;
}

// ─── Vision (image analysis) ─────────────────────────────────────────────────

export async function analyzeImage(
  imageBase64: string,
  prompt: string,
): Promise<string> {
  const model = process.env.AI_VISION_MODEL || process.env.AI_MODEL || DEFAULT_MODEL;

  const response = await fetchWithTimeout(
    `${AI_BASE_URL}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
        stream: false,
        max_tokens: 1024,
        temperature: 0.3,
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI vision error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content || '';
}

// ─── Simple generation (no tools) ────────────────────────────────────────────

export async function generate(
  prompt: string,
  options?: { system?: string; model?: string; maxTokens?: number; temperature?: number },
): Promise<string> {
  const result = await chat({
    system: options?.system || '',
    messages: [{ role: 'user', content: prompt }],
    model: options?.model,
    maxTokens: options?.maxTokens || 1024,
    temperature: options?.temperature ?? 0.7,
  });
  return result.content;
}

// ─── Health check ────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{ ok: boolean; model?: string; error?: string }> {
  try {
    const response = await fetchWithTimeout(
      `${AI_BASE_URL}/models`,
      { headers: { 'Authorization': `Bearer ${getApiKey()}` } },
      10_000,
    );
    if (!response.ok) {
      return { ok: false, error: `AI API ответил ${response.status}` };
    }
    return { ok: true, model: DEFAULT_MODEL };
  } catch (e) {
    return {
      ok: false,
      error: 'Не удалось подключиться к AI API. Проверь AI_API_KEY в .env',
    };
  }
}
