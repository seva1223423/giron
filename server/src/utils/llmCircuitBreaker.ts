/**
 * llmCircuitBreaker — guard for the Mistral / DeepSeek API in
 * deepseekAI.ts.
 *
 * Why this exists (audit R-2026-05-22 finding C4/H8):
 * The `/chat` handler retries the LLM up to 3× inside the same request
 * with a 3-tier fallback (full context → trimmed → minimal). Each
 * underlying chat() call itself does 2 retries on 5xx/network errors.
 * So a single user message that hits a Mistral regional outage burns
 * up to 9 API attempts × 60s timeout = 540s wall-clock per request
 * before failing.
 *
 * The breaker short-circuits the storm: after N consecutive failures,
 * subsequent calls throw immediately with a clear error for COOLDOWN_MS,
 * then allow one "probe" request to see if Mistral is back.
 *
 * State machine:
 *   CLOSED   (normal)  — count failures; on success, reset to 0
 *   OPEN     (storm)   — reject every call instantly
 *   HALF_OPEN (probe)  — let exactly one through; success → CLOSED;
 *                        failure → re-OPEN with fresh cooldown
 *
 * Module-level singleton because the API is process-global. If the
 * dyno restarts (Render free tier), the breaker resets — that's fine,
 * the next storm will re-trip it within a few requests.
 *
 * Tunables:
 *   FAILURE_THRESHOLD — 5 consecutive failures = clearly a storm,
 *     not a one-off blip. Lower would false-trip on transient network
 *     glitches; higher would let users wait through too many storms.
 *   COOLDOWN_MS — 30s. Mistral 5xx storms historically clear in
 *     1-5 minutes; 30s is short enough that recovery happens on a
 *     soon-following probe, long enough that we don't probe-storm
 *     during a sustained outage.
 *   HALF_OPEN_LIMIT — exactly 1 probe at a time. Concurrent probes
 *     would defeat the purpose.
 */

import { logger } from './logger';

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 30_000;

interface BreakerInternal {
  state: BreakerState;
  consecutiveFailures: number;
  openedAt: number; // ms timestamp; valid only when state !== 'CLOSED'
  halfOpenProbeInFlight: boolean;
}

const breaker: BreakerInternal = {
  state: 'CLOSED',
  consecutiveFailures: 0,
  openedAt: 0,
  halfOpenProbeInFlight: false,
};

/** Thrown when the breaker is OPEN. Caller should surface a friendly
 *  user-facing message — the underlying provider is unreachable and
 *  retrying will not help. */
export class LlmCircuitOpenError extends Error {
  constructor(public readonly cooldownRemainingMs: number) {
    super(
      `LLM circuit breaker OPEN — provider unreachable, retry in ${Math.ceil(
        cooldownRemainingMs / 1000,
      )}s`,
    );
    this.name = 'LlmCircuitOpenError';
  }
}

/** Called BEFORE issuing an LLM API request. Throws LlmCircuitOpenError
 *  if the breaker is OPEN. If HALF_OPEN, allows exactly one probe call
 *  through (marks halfOpenProbeInFlight = true) and rejects the rest. */
export function guardLlmCall(): void {
  const now = Date.now();

  if (breaker.state === 'OPEN') {
    const elapsed = now - breaker.openedAt;
    if (elapsed >= COOLDOWN_MS) {
      // Cooldown elapsed — move to HALF_OPEN and let this call probe.
      breaker.state = 'HALF_OPEN';
      breaker.halfOpenProbeInFlight = true;
      logger.info(
        `[LLM Breaker] cooldown elapsed (${elapsed}ms ≥ ${COOLDOWN_MS}ms) — moving to HALF_OPEN, probe in flight`,
      );
      return;
    }
    throw new LlmCircuitOpenError(COOLDOWN_MS - elapsed);
  }

  if (breaker.state === 'HALF_OPEN') {
    if (breaker.halfOpenProbeInFlight) {
      // A probe is already in flight — reject concurrent calls so we
      // get a clean signal from the single probe.
      throw new LlmCircuitOpenError(COOLDOWN_MS);
    }
    breaker.halfOpenProbeInFlight = true;
    return;
  }

  // CLOSED — let through.
}

/** Called AFTER the LLM API call succeeds. Resets failure count and
 *  closes the breaker if it was HALF_OPEN. */
export function recordLlmSuccess(): void {
  if (breaker.state === 'HALF_OPEN') {
    logger.info('[LLM Breaker] probe succeeded — moving to CLOSED');
  }
  breaker.state = 'CLOSED';
  breaker.consecutiveFailures = 0;
  breaker.openedAt = 0;
  breaker.halfOpenProbeInFlight = false;
}

/** Called AFTER the LLM API call fails (after its own retries). Increments
 *  the failure counter; trips the breaker on the FAILURE_THRESHOLD-th
 *  consecutive failure. */
export function recordLlmFailure(): void {
  if (breaker.state === 'HALF_OPEN') {
    // Probe failed — re-open with a fresh cooldown.
    breaker.state = 'OPEN';
    breaker.openedAt = Date.now();
    breaker.halfOpenProbeInFlight = false;
    logger.warn(
      `[LLM Breaker] probe failed — re-OPEN for another ${COOLDOWN_MS / 1000}s`,
    );
    return;
  }

  breaker.consecutiveFailures += 1;
  if (
    breaker.state === 'CLOSED' &&
    breaker.consecutiveFailures >= FAILURE_THRESHOLD
  ) {
    breaker.state = 'OPEN';
    breaker.openedAt = Date.now();
    logger.warn(
      `[LLM Breaker] ${FAILURE_THRESHOLD} consecutive failures — OPEN for ${
        COOLDOWN_MS / 1000
      }s`,
    );
  }
}

/** Inspect current state — for tests, /admin diagnostics, or
 *  monitoring. Returns a snapshot, not a live reference. */
export function getBreakerState(): {
  state: BreakerState;
  consecutiveFailures: number;
  cooldownRemainingMs: number;
} {
  const cooldownRemainingMs =
    breaker.state === 'OPEN'
      ? Math.max(0, COOLDOWN_MS - (Date.now() - breaker.openedAt))
      : 0;
  return {
    state: breaker.state,
    consecutiveFailures: breaker.consecutiveFailures,
    cooldownRemainingMs,
  };
}

/** Force-reset to CLOSED. Only for tests. */
export function _resetBreakerForTest(): void {
  breaker.state = 'CLOSED';
  breaker.consecutiveFailures = 0;
  breaker.openedAt = 0;
  breaker.halfOpenProbeInFlight = false;
}

/** Constants exposed for tests so all magic numbers live in one place. */
export const _internal = {
  FAILURE_THRESHOLD,
  COOLDOWN_MS,
};
