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

function getApiKey(): string {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error('AI_API_KEY не задан в .env');
  return key;
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

  const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek error ${response.status}: ${errorText}`);
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

  return {
    content: msg.content || '',
    toolCalls: rawToolCalls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    })),
    hasToolCalls: rawToolCalls.length > 0,
  };
}

// ─── Vision (image analysis) ─────────────────────────────────────────────────

export async function analyzeImage(
  imageBase64: string,
  prompt: string,
): Promise<string> {
  // DeepSeek-V3 поддерживает vision через стандартный chat completions
  const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
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
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek vision error ${response.status}: ${errorText}`);
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
    const response = await fetch(`${AI_BASE_URL}/models`, {
      headers: { 'Authorization': `Bearer ${getApiKey()}` },
    });
    if (!response.ok) {
      return { ok: false, error: `DeepSeek API ответил ${response.status}` };
    }
    return { ok: true, model: DEFAULT_MODEL };
  } catch (e) {
    return {
      ok: false,
      error: 'Не удалось подключиться к DeepSeek API. Проверь DEEPSEEK_API_KEY в .env',
    };
  }
}
