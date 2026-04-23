/**
 * Mistral / OpenAI-compatible provider adapter (MEGA-AI-03).
 *
 * Thin shim over the existing deepseekAI.ts service — keeps the legacy
 * client-level retry + timeout logic intact while exposing the
 * LLMProvider interface to the router. When the caller eventually
 * migrates to the router, this module replaces direct imports from
 * deepseekAI without any behavioral change.
 */

import { chat as legacyChat, healthCheck as legacyHealthCheck } from '../deepseekAI';
import type { LLMProvider, LLMChatOptions, LLMChatResult } from './types';
import { LLMProviderUnavailableError } from './types';

export const mistralAdapter: LLMProvider = {
  name: 'mistral',

  isAvailable(): boolean {
    // The shared OpenAI-compatible config is considered "mistral" here
    // because that's the default. DeepSeek / OpenRouter users who set
    // AI_BASE_URL to a non-Mistral endpoint are STILL routed through
    // this adapter — the name is a cost-tier label, not a strict match.
    return Boolean(process.env.AI_API_KEY);
  },

  async chat(options: LLMChatOptions): Promise<LLMChatResult> {
    if (!this.isAvailable()) {
      throw new LLMProviderUnavailableError('mistral', 'AI_API_KEY not set');
    }
    try {
      const result = await legacyChat(options);
      return {
        content: result.content,
        toolCalls: result.toolCalls,
        hasToolCalls: result.hasToolCalls,
      };
    } catch (err) {
      // Classify transient vs permanent. Network errors / 5xx → transient;
      // 4xx (bad request, auth) stays a plain Error so the router bubbles.
      const msg = String(err);
      const transientSignals = [
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ECONNRESET',
        'network',
        'timeout',
        'AbortError',
        '5', // matches "500", "502", "503", "504" substrings in error text
      ];
      const isTransient = transientSignals.some((sig) => msg.includes(sig));
      if (isTransient) {
        throw new LLMProviderUnavailableError('mistral', msg);
      }
      throw err;
    }
  },

  async healthCheck() {
    if (!this.isAvailable()) {
      return { ok: false, error: 'AI_API_KEY not set' };
    }
    return legacyHealthCheck();
  },
};
