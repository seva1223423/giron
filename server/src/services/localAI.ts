/**
 * Local AI Service — Ollama
 *
 * Полностью независимый AI, работает на твоём сервере.
 * Не зависит от внешних API (Anthropic, OpenAI и т.д.).
 *
 * Поддерживаемые модели:
 *   Чат + инструменты:  qwen2.5:14b, qwen2.5:7b, llama3.1:8b, mistral:7b
 *   Vision (фото еды):  llama3.2-vision, qwen2.5-vl:7b, llava:13b
 *
 * Установка Ollama: https://ollama.com/download
 *   ollama pull qwen2.5:14b
 *   ollama pull llama3.2-vision
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ChatOptions {
  system: string;
  messages: OllamaMessage[];
  tools?: OllamaTool[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  content: string;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  hasToolCalls: boolean;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_CHAT_MODEL = process.env.AI_MODEL || 'qwen2.5:14b';
const DEFAULT_VISION_MODEL = process.env.AI_VISION_MODEL || 'llama3.2-vision';

// ─── Chat (text + tool calling) ──────────────────────────────────────────────

export async function chat(options: ChatOptions): Promise<ChatResult> {
  const model = options.model || DEFAULT_CHAT_MODEL;

  const messages: OllamaMessage[] = [
    { role: 'system', content: options.system },
    ...options.messages,
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    options: {
      num_predict: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    },
  };

  // Only include tools if provided (some models don't support them)
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as {
    message?: {
      content?: string;
      tool_calls?: Array<{
        function: { name: string; arguments: Record<string, unknown> | string };
      }>;
    };
  };

  const msg = data.message || {};
  const rawToolCalls = msg.tool_calls || [];

  return {
    content: msg.content || '',
    toolCalls: rawToolCalls.map((tc) => ({
      name: tc.function.name,
      arguments:
        typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments,
    })),
    hasToolCalls: rawToolCalls.length > 0,
  };
}

// ─── Vision (image analysis) ─────────────────────────────────────────────────

export async function analyzeImage(
  imageBase64: string,
  prompt: string,
  model?: string,
): Promise<string> {
  const visionModel = model || DEFAULT_VISION_MODEL;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: prompt,
          images: [imageBase64],
        },
      ],
      stream: false,
      options: {
        num_predict: 1024,
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama vision error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as { message?: { content?: string } };
  return data.message?.content || '';
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

export async function healthCheck(): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      return { ok: false, error: `Ollama responded with ${response.status}` };
    }
    const data = await response.json() as { models?: Array<{ name: string }> };
    const models = (data.models || []).map((m) => m.name);
    return { ok: true, models };
  } catch (e) {
    return {
      ok: false,
      error: `Не удалось подключиться к Ollama (${OLLAMA_BASE_URL}). Убедись что Ollama запущена: ollama serve`,
    };
  }
}
