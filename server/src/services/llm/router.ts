/**
 * LLM provider router (MEGA-AI-03).
 *
 * Picks a provider based on env config and an optional intent hint,
 * then retries via a fallback chain on transient failures. Today all
 * providers except the existing Mistral adapter are stubs that throw
 * LLMProviderUnavailableError — activation plan in `./README.md`.
 *
 * The router is intentionally tiny: no scoring, no rate-limit
 * negotiation, no streaming multiplex. Those belong in provider
 * adapters, not here.
 */

import { logger } from '../../utils/logger';
import { reportError } from '../../utils/errorReporter';
import {
  type LLMChatOptions,
  type LLMChatResult,
  type LLMIntent,
  type LLMProvider,
  LLMProviderUnavailableError,
} from './types';
import { mistralAdapter } from './mistralAdapter';
import { yandexAdapter } from './yandexAdapter';
import { gigachatAdapter } from './gigachatAdapter';

// Provider name → singleton. Each adapter's `isAvailable()` checks env
// vars at runtime, so listing them here is safe even without keys —
// `resolveChain()` below filters out unavailable ones.
const PROVIDERS: Record<string, LLMProvider> = {
  mistral: mistralAdapter,
  yandex: yandexAdapter,     // set YANDEX_API_KEY + YANDEX_FOLDER_ID
  gigachat: gigachatAdapter, // set GIGACHAT_AUTH_KEY (base64 clientId:secret)
};

function parseChain(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** Ordered list of provider names to try. Primary first, then fallbacks.
 *  Configurable via AI_PRIMARY_PROVIDER + AI_FALLBACK_CHAIN. Defaults to
 *  mistral-only to preserve existing behavior exactly. */
function resolveChain(): string[] {
  const primary = (process.env.AI_PRIMARY_PROVIDER || 'mistral').toLowerCase();
  const fallback = parseChain(process.env.AI_FALLBACK_CHAIN, []);
  const chain = [primary, ...fallback].filter((name, i, arr) => arr.indexOf(name) === i);
  // Drop providers that aren't registered (typo in env) AND providers
  // that don't have credentials. Without the isAvailable() filter the
  // router would log "trying yandex" on every call when YANDEX_API_KEY
  // isn't set — noisy and slow.
  return chain.filter((name) => PROVIDERS[name] && PROVIDERS[name].isAvailable());
}

/** Pick the best-matching intent-specific provider override. Returns null
 *  when no override applies and the router should fall through to the
 *  default chain. */
function intentOverride(intent?: LLMIntent): string | null {
  if (!intent) return null;
  // Rules are conservative — the default chain still handles everything.
  // Override ONLY when intent strongly signals a specific cost/safety tier.
  switch (intent) {
    case 'medical_concern':
      // Safety tier — prefer the strictest guardrails. Falls through to
      // default chain if the safety provider isn't configured.
      return process.env.AI_SAFETY_PROVIDER?.toLowerCase() ?? null;
    case 'complex_planning':
      // Tool-heavy, better with Mistral Medium/Large or equivalent.
      return process.env.AI_COMPLEX_PROVIDER?.toLowerCase() ?? null;
    default:
      return null;
  }
}

/**
 * Run a chat completion through the configured provider chain. On
 * transient errors (LLMProviderUnavailableError or network-level), try
 * the next chain entry. Permanent errors (bad request, auth) bubble.
 */
export async function chat(options: LLMChatOptions, intent?: LLMIntent): Promise<LLMChatResult> {
  const override = intentOverride(intent);
  const chain = override && PROVIDERS[override]
    ? [override, ...resolveChain().filter((n) => n !== override)]
    : resolveChain();

  if (chain.length === 0) {
    // No providers configured — indicates a misconfigured env. Don't
    // swallow silently.
    const err = new Error('No LLM providers configured. Check AI_PRIMARY_PROVIDER env var.');
    reportError(err, { tags: { origin: 'llm-router', reason: 'no-chain' } });
    throw err;
  }

  let lastError: unknown = null;
  for (const name of chain) {
    const provider = PROVIDERS[name];
    if (!provider.isAvailable()) {
      logger.warn(`[llm-router] skipping unavailable provider ${name}`);
      continue;
    }
    try {
      return await provider.chat(options);
    } catch (err) {
      lastError = err;
      // Only retry on transient/unavailable signals. Permanent errors
      // (4xx from LLM API, schema validation) should not mask themselves
      // as "try another provider".
      if (err instanceof LLMProviderUnavailableError) {
        logger.warn(`[llm-router] ${name} unavailable, trying next: ${err.message}`);
        continue;
      }
      // Non-transient — bubble up with context.
      reportError(err, { tags: { origin: 'llm-router', provider: name } });
      throw err;
    }
  }
  // Chain exhausted — throw the last error we saw. At this point every
  // provider was either unavailable or failed transiently.
  const exhausted = new Error(
    `All LLM providers failed. Chain: ${chain.join(' → ')}. Last error: ${String(lastError)}`,
  );
  reportError(exhausted, { tags: { origin: 'llm-router', reason: 'chain-exhausted' } });
  throw exhausted;
}

/** Aggregate health: primary + each fallback. Used by /health/deep
 *  (future) to gate deploys on LLM reachability. */
export async function healthCheckAll(): Promise<Array<{ name: string; ok: boolean; error?: string }>> {
  const chain = resolveChain();
  return Promise.all(
    chain.map(async (name) => {
      const provider = PROVIDERS[name];
      if (!provider.isAvailable()) return { name, ok: false, error: 'not-configured' };
      try {
        const h = await provider.healthCheck();
        return { name, ok: h.ok, error: h.error };
      } catch (e) {
        return { name, ok: false, error: String(e) };
      }
    }),
  );
}

/** Exposed for tests so we can manipulate the registry. Not part of the
 *  public API — do not call from route code. */
export const __internals = { PROVIDERS, resolveChain };
