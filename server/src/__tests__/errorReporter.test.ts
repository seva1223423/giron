/**
 * Smoke tests for the error-reporter wrapper (Tech-05 prep).
 *
 * Confirm that the wrapper is safe to call unconditionally — every public
 * function must be a no-op when:
 *   (a) @sentry/node is NOT installed (the current state), AND
 *   (b) SENTRY_DSN is not set.
 *
 * This matters because route handlers across the codebase will start
 * calling reportError() eagerly, and we don't want any of them to throw
 * or stall just because Sentry isn't wired up yet.
 */

import { reportError, setUser, clearUser, addBreadcrumb, sentryErrorHandler } from '../utils/errorReporter';

// Keep logger quiet — reportError falls back to console.error, which
// pollutes jest output without adding signal.
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('errorReporter — no-op mode (Sentry inactive)', () => {
  beforeEach(() => {
    delete process.env.SENTRY_DSN;
  });

  test('reportError does not throw on plain Error', () => {
    expect(() => reportError(new Error('boom'))).not.toThrow();
  });

  test('reportError does not throw on non-Error values', () => {
    expect(() => reportError('a string')).not.toThrow();
    expect(() => reportError(42)).not.toThrow();
    expect(() => reportError(null)).not.toThrow();
    expect(() => reportError(undefined)).not.toThrow();
    expect(() => reportError({ weird: 'object' })).not.toThrow();
  });

  test('reportError accepts optional context', () => {
    expect(() => reportError(new Error('boom'), {
      userId: 'u-123',
      route: '/ai/chat',
      tags: { plan: 'pro' },
      extra: { messageCount: 42 },
    })).not.toThrow();
  });

  test('setUser / clearUser are no-ops', () => {
    expect(() => setUser('u-123')).not.toThrow();
    expect(() => clearUser()).not.toThrow();
  });

  test('addBreadcrumb does not throw at any level', () => {
    expect(() => addBreadcrumb('user clicked')).not.toThrow();
    expect(() => addBreadcrumb('warning event', { code: 42 }, 'warning')).not.toThrow();
    expect(() => addBreadcrumb('debug', undefined, 'debug')).not.toThrow();
  });

  test('sentryErrorHandler returns a passthrough middleware', () => {
    const handler = sentryErrorHandler();
    expect(typeof handler).toBe('function');
    // Passthrough should call next(err) without doing anything else.
    const next = jest.fn();
    const err = new Error('boom');
    handler(err, {}, {}, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  test('reportError is safe to call in a tight loop', () => {
    // Paranoia — if the lazy-load retries on every call it could tank
    // hot paths. This verifies we don't re-import @sentry/node per call.
    for (let i = 0; i < 1000; i++) {
      reportError(new Error(`iter ${i}`));
    }
    // If the above took longer than a couple hundred ms something is
    // wrong. Jest's default 5s timeout will catch a pathological case.
  });
});

describe('errorReporter — activation with missing package', () => {
  beforeEach(() => {
    // Pretend Sentry DSN is set but @sentry/node is not installed —
    // the most likely real-world partial state.
    process.env.SENTRY_DSN = 'https://fake@o0.ingest.sentry.io/1';
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  test('reportError still does not throw when Sentry not installed', () => {
    // require('@sentry/node') will throw MODULE_NOT_FOUND — wrapper
    // catches it and logs a warning, then proceeds as if inactive.
    expect(() => reportError(new Error('boom'))).not.toThrow();
  });

  test('setUser still does not throw', () => {
    expect(() => setUser('u-123')).not.toThrow();
  });
});
