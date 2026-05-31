/**
 * Tests for utils/llmCircuitBreaker — the breaker around chat() /
 * chatStream() that protects against Mistral storm-retries chewing
 * through 9 attempts × 60s on every user message during an outage.
 *
 * State machine pins:
 *   CLOSED   → counts failures until threshold
 *   OPEN     → throws LlmCircuitOpenError instantly
 *   HALF_OPEN → lets one probe through; success → CLOSED, fail → re-OPEN
 */

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  guardLlmCall,
  recordLlmSuccess,
  recordLlmFailure,
  getBreakerState,
  _resetBreakerForTest,
  LlmCircuitOpenError,
  _internal,
} from '../utils/llmCircuitBreaker';

beforeEach(() => {
  _resetBreakerForTest();
});

describe('llmCircuitBreaker — CLOSED state', () => {
  test('starts in CLOSED with zero failures', () => {
    const s = getBreakerState();
    expect(s.state).toBe('CLOSED');
    expect(s.consecutiveFailures).toBe(0);
    expect(s.cooldownRemainingMs).toBe(0);
  });

  test('guardLlmCall passes when CLOSED', () => {
    expect(() => guardLlmCall()).not.toThrow();
  });

  test('recordLlmSuccess keeps it CLOSED with zero failures', () => {
    recordLlmSuccess();
    expect(getBreakerState().state).toBe('CLOSED');
    expect(getBreakerState().consecutiveFailures).toBe(0);
  });

  test('failures below threshold do NOT trip the breaker', () => {
    for (let i = 0; i < _internal.FAILURE_THRESHOLD - 1; i++) {
      recordLlmFailure();
    }
    expect(getBreakerState().state).toBe('CLOSED');
    expect(getBreakerState().consecutiveFailures).toBe(_internal.FAILURE_THRESHOLD - 1);
    expect(() => guardLlmCall()).not.toThrow();
  });

  test('any success between failures resets the counter', () => {
    recordLlmFailure();
    recordLlmFailure();
    expect(getBreakerState().consecutiveFailures).toBe(2);
    recordLlmSuccess();
    expect(getBreakerState().consecutiveFailures).toBe(0);
    // Two more failures should NOT trip the breaker — counter reset.
    recordLlmFailure();
    recordLlmFailure();
    expect(getBreakerState().state).toBe('CLOSED');
  });
});

describe('llmCircuitBreaker — tripping to OPEN', () => {
  test('FAILURE_THRESHOLD-th consecutive failure trips OPEN', () => {
    for (let i = 0; i < _internal.FAILURE_THRESHOLD; i++) {
      recordLlmFailure();
    }
    expect(getBreakerState().state).toBe('OPEN');
  });

  test('OPEN throws LlmCircuitOpenError with remaining cooldown', () => {
    for (let i = 0; i < _internal.FAILURE_THRESHOLD; i++) {
      recordLlmFailure();
    }
    expect(() => guardLlmCall()).toThrow(LlmCircuitOpenError);
    try {
      guardLlmCall();
    } catch (err) {
      expect(err).toBeInstanceOf(LlmCircuitOpenError);
      expect((err as LlmCircuitOpenError).cooldownRemainingMs).toBeGreaterThan(0);
      expect((err as LlmCircuitOpenError).cooldownRemainingMs).toBeLessThanOrEqual(_internal.COOLDOWN_MS);
    }
  });

  test('OPEN rejects multiple consecutive calls without changing state', () => {
    for (let i = 0; i < _internal.FAILURE_THRESHOLD; i++) {
      recordLlmFailure();
    }
    for (let i = 0; i < 100; i++) {
      expect(() => guardLlmCall()).toThrow(LlmCircuitOpenError);
    }
    expect(getBreakerState().state).toBe('OPEN');
  });
});

describe('llmCircuitBreaker — HALF_OPEN after cooldown', () => {
  test('after COOLDOWN_MS elapses, next guardLlmCall moves to HALF_OPEN and lets probe through', () => {
    jest.useFakeTimers();
    try {
      for (let i = 0; i < _internal.FAILURE_THRESHOLD; i++) {
        recordLlmFailure();
      }
      expect(getBreakerState().state).toBe('OPEN');

      // Jump past cooldown.
      jest.advanceTimersByTime(_internal.COOLDOWN_MS + 1);

      // The probe call must NOT throw.
      expect(() => guardLlmCall()).not.toThrow();
      expect(getBreakerState().state).toBe('HALF_OPEN');
    } finally {
      jest.useRealTimers();
    }
  });

  test('HALF_OPEN rejects concurrent calls while a probe is in flight', () => {
    jest.useFakeTimers();
    try {
      for (let i = 0; i < _internal.FAILURE_THRESHOLD; i++) {
        recordLlmFailure();
      }
      jest.advanceTimersByTime(_internal.COOLDOWN_MS + 1);

      guardLlmCall(); // probe accepted, halfOpenProbeInFlight=true
      expect(() => guardLlmCall()).toThrow(LlmCircuitOpenError);
    } finally {
      jest.useRealTimers();
    }
  });

  test('probe SUCCESS moves HALF_OPEN → CLOSED with reset counter', () => {
    jest.useFakeTimers();
    try {
      for (let i = 0; i < _internal.FAILURE_THRESHOLD; i++) {
        recordLlmFailure();
      }
      jest.advanceTimersByTime(_internal.COOLDOWN_MS + 1);
      guardLlmCall();
      recordLlmSuccess();
      expect(getBreakerState().state).toBe('CLOSED');
      expect(getBreakerState().consecutiveFailures).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('probe FAILURE moves HALF_OPEN → OPEN with fresh cooldown', () => {
    jest.useFakeTimers();
    try {
      for (let i = 0; i < _internal.FAILURE_THRESHOLD; i++) {
        recordLlmFailure();
      }
      const firstOpenedAt = Date.now();
      jest.advanceTimersByTime(_internal.COOLDOWN_MS + 1);
      guardLlmCall();
      const tWhenProbed = Date.now();
      recordLlmFailure();
      // Breaker MUST be OPEN again, with cooldown starting from "now"
      // (the probe failure time), not from the original trip.
      expect(getBreakerState().state).toBe('OPEN');
      expect(getBreakerState().cooldownRemainingMs).toBeGreaterThan(_internal.COOLDOWN_MS - 100);
      // Sanity: probe time should be after first trip + cooldown.
      expect(tWhenProbed - firstOpenedAt).toBeGreaterThanOrEqual(_internal.COOLDOWN_MS);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('llmCircuitBreaker — constants pin', () => {
  test('FAILURE_THRESHOLD is 5 (audit decision — clearly a storm, not a blip)', () => {
    expect(_internal.FAILURE_THRESHOLD).toBe(5);
  });

  test('COOLDOWN_MS is 30s (audit decision — matches typical Mistral storm window)', () => {
    expect(_internal.COOLDOWN_MS).toBe(30_000);
  });
});
