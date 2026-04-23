/**
 * Shared LLM provider interface (MEGA-AI-03).
 *
 * Every concrete client (Mistral via deepseekAI.ts, YandexGPT,
 * GigaChat, future self-hosted Qwen) implements this contract. The router
 * in `./router.ts` uses it to swap providers without touching caller
 * code.
 *
 * This file is zero-runtime — only types. Safe to import from anywhere
 * without pulling a heavy client as a side effect.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMChatOptions {
  system: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMChatResult {
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  hasToolCalls: boolean;
}

/** Classification of what the user wants. Used by the router to pick a
 *  model cost-tier without the caller reasoning about it. See
 *  ai.ts:classifyIntent for today's rules. */
export type LLMIntent =
  | 'simple_qa'
  | 'food_log'
  | 'workout_advice'
  | 'complex_planning'
  | 'medical_concern'
  | 'greeting'
  | 'motivation'
  | 'general';

export interface LLMProvider {
  /** Human-readable name for logs + metrics: "mistral" / "yandex" / "giga" */
  readonly name: string;

  /** True when the provider is configured (env vars present). The router
   *  uses this to fall through to the next chain entry without trying a
   *  doomed call. */
  isAvailable(): boolean;

  /** Single-shot chat completion. Concrete providers MUST normalize their
   *  native response into LLMChatResult (empty toolCalls array if native
   *  function-calling isn't supported). */
  chat(options: LLMChatOptions): Promise<LLMChatResult>;

  /** Optional streaming variant — providers that don't support it should
   *  throw a distinguishable error so the router can fall back to
   *  non-stream chat. */
  chatStream?(options: LLMChatOptions): AsyncGenerator<string, void, unknown>;

  /** Vision / image analysis. Not all providers have this; the router
   *  caller should check before invoking. */
  analyzeImage?(imageBase64: string, prompt: string): Promise<string>;

  /** Cheap probe — used by the router to evict flaky providers from a
   *  rotation without hitting the pricier chat endpoint. */
  healthCheck(): Promise<{ ok: boolean; model?: string; error?: string }>;
}

export class LLMProviderUnavailableError extends Error {
  constructor(public readonly provider: string, message: string) {
    super(`[${provider}] ${message}`);
    this.name = 'LLMProviderUnavailableError';
  }
}
