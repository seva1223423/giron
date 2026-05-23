/**
 * Two-tier degradation for the /chat handler when the primary AI call
 * fails (Mistral 5xx, circuit-breaker open, schema-validation throw,
 * tool-loop blow-up).
 *
 * Extracted from routes/ai.ts (audit R-2026-05-22, /chat split step 2).
 * The inline try/catch/catch/catch ladder was 35 lines of nested
 * logic that ran on every /chat request that hit a primary failure.
 * Pulling it out makes the route handler shorter and lets the
 * fallback logic get its own unit tests.
 *
 * Strategy:
 *   1. Tier 1 — same system prompt, no tools, shorter context (last
 *      6 messages only). Drops tools because most primary failures
 *      are tool-loop or schema-validation; without tools the LLM
 *      just generates prose.
 *   2. Tier 2 — minimal system prompt (just "you're Iron Coach"),
 *      only the user's current message. Last-ditch attempt to get
 *      ANY response.
 *
 * Returns the content string on success, or null when both tiers
 * fail. The caller decides what HTTP response shape to send (route
 * is SSE-aware, this function isn't).
 */

import { chatWithoutTools, type DeepSeekMessage } from '../services/deepseekAI';
import { logger } from '../utils/logger';

export interface ChatFallbackInput {
  messages: DeepSeekMessage[];
  finalSystemPrompt: string;
  userContext: string;
  /** Raw current user message — used by tier-2's minimal prompt. */
  userMessage: string;
}

export interface ChatFallbackSuccess {
  ok: true;
  content: string;
  /** Which tier produced the content. Useful for metrics + logs. */
  tier: 1 | 2;
}

export interface ChatFallbackFailure {
  ok: false;
  /** The error from tier 2 (after tier 1 also failed). Caller logs +
   *  surfaces a friendly 503 to the user. */
  lastError: unknown;
}

export type ChatFallbackResult = ChatFallbackSuccess | ChatFallbackFailure;

export async function runChatFallback(
  input: ChatFallbackInput,
): Promise<ChatFallbackResult> {
  // ── Tier 1: shorter context, no tools ───────────────────────────────
  try {
    const shortMessages = input.messages.slice(-6); // only last 3 exchanges
    const fallbackContent = await chatWithoutTools({
      system: input.finalSystemPrompt,
      messages: shortMessages,
      maxTokens: 4096,
      temperature: 0.6,
    });
    return { ok: true, content: fallbackContent, tier: 1 };
  } catch (fallback1Error) {
    logger.error('Fallback 1 failed, trying minimal prompt:', fallback1Error);
    // ── Tier 2: minimal system, only current message ──────────────────
    try {
      const minimalSystem = `Ты Iron Coach — ИИ-тренер в приложении Giron. Отвечай на русском, коротко и по делу. ${input.userContext}`;
      const minimalMessages: DeepSeekMessage[] = [
        { role: 'user', content: input.userMessage },
      ];
      const fallback2Content = await chatWithoutTools({
        system: minimalSystem,
        messages: minimalMessages,
        maxTokens: 2048,
        temperature: 0.5,
      });
      return { ok: true, content: fallback2Content, tier: 2 };
    } catch (fallback2Error) {
      logger.error('All AI fallbacks failed:', fallback2Error);
      return { ok: false, lastError: fallback2Error };
    }
  }
}
