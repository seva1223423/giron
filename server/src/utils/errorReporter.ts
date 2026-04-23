/**
 * Thin error-reporting wrapper (Tech-05 prep).
 *
 * Design goals:
 * 1. Call sites (route handlers, scheduled jobs, AI failures) can call
 *    reportError() today without knowing whether Sentry is wired up.
 * 2. Zero runtime dependency until Sentry is actually activated. We
 *    lazily require `@sentry/node` inside a try/catch so the server
 *    boots cleanly even without the package installed.
 * 3. Activation is flipping one env var (SENTRY_DSN) and running one
 *    install command — no code changes in the hot path.
 *
 * Activation checklist when ready:
 *   1. cd server && npm install @sentry/node
 *   2. Create project in sentry.io → copy DSN
 *   3. Add SENTRY_DSN to Render env (or .env locally)
 *   4. Re-deploy — init runs automatically at boot
 *   5. (Optional) Wire `sentryErrorHandler` middleware in index.ts
 *      AFTER all routes so unhandled errors surface with stack traces.
 *
 * Until then reportError() logs to console (same as logger.error), and
 * setUser/addBreadcrumb are no-ops.
 */

import { logger } from './logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SentryModule = any;

let sentry: SentryModule | null = null;
let initialized = false;

function tryLoadSentry(): SentryModule | null {
  if (initialized) return sentry;
  initialized = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // Explicitly disabled — don't even try to load the module. Keeps CI
    // logs clean and prevents accidental Sentry traffic from dev machines.
    return null;
  }

  try {
    // Dynamic require so TS/webpack don't complain about missing types
    // when the package isn't installed yet.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const mod = require('@sentry/node');
    mod.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT,
      // 10% perf sample rate — enough to spot regressions, cheap on quota.
      tracesSampleRate: 0.1,
      // Scrub obvious PII from event payloads. Iron Gym stores health data
      // (pulse, injuries, goals) which counts as spec-category PD under
      // 152-ФЗ — never send it to Sentry servers.
      beforeSend(event: any) {
        if (event.request?.data && typeof event.request.data === 'object') {
          const scrubKeys = ['password', 'passwordHash', 'refreshToken', 'token', 'weightKg', 'heightCm', 'healthRestrictions'];
          for (const key of scrubKeys) {
            if (key in event.request.data) event.request.data[key] = '[scrubbed]';
          }
        }
        return event;
      },
    });
    sentry = mod;
    logger.info('[errorReporter] Sentry initialized');
    return sentry;
  } catch (err) {
    // @sentry/node not installed yet — fall through to console-only mode.
    // This is the expected state until the founder activates Sentry.
    if ((err as { code?: string }).code !== 'MODULE_NOT_FOUND') {
      logger.warn('[errorReporter] Sentry init failed, falling back to console:', err);
    }
    return null;
  }
}

export interface ErrorContext {
  userId?: string;
  route?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>;
  tags?: Record<string, string>;
}

/**
 * Capture an error with optional context. Falls back to console.error when
 * Sentry isn't active — so call sites can use this instead of logger.error
 * and get automatic upgrading once SENTRY_DSN is set.
 */
export function reportError(err: unknown, context: ErrorContext = {}): void {
  const s = tryLoadSentry();
  if (s) {
    s.withScope((scope: any) => {
      if (context.userId) scope.setUser({ id: context.userId });
      if (context.route) scope.setTag('route', context.route);
      if (context.tags) {
        for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
      }
      if (context.extra) scope.setExtras(context.extra);
      s.captureException(err);
    });
    return;
  }
  // Local dev / Sentry not activated — log to console with context.
  logger.error('[reportError]', err instanceof Error ? err.stack ?? err.message : err, context);
}

/**
 * Associate subsequent Sentry events with a userId. Call from the auth
 * middleware once JWT is verified. No-op without Sentry.
 */
export function setUser(userId: string): void {
  const s = tryLoadSentry();
  if (s) s.setUser({ id: userId });
}

/**
 * Clear user association on logout. No-op without Sentry.
 */
export function clearUser(): void {
  const s = tryLoadSentry();
  if (s) s.setUser(null);
}

/**
 * Add a breadcrumb (timeline event) that will be attached to the next
 * captured error. Useful for tracing "what happened before the crash".
 */
export function addBreadcrumb(
  message: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
): void {
  const s = tryLoadSentry();
  if (s) s.addBreadcrumb({ message, data, level });
}

/**
 * Express error-handler middleware. Mount AFTER all route handlers, BEFORE
 * a final 500-response fallback. Only active when Sentry is wired up —
 * otherwise returns a passthrough.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sentryErrorHandler(): any {
  const s = tryLoadSentry();
  if (s && s.expressErrorHandler) {
    return s.expressErrorHandler({
      // Report 500+ errors only — 4xx are client issues, not alertable.
      shouldHandleError: (err: { status?: number; statusCode?: number }) => {
        const status = err.status ?? err.statusCode ?? 500;
        return status >= 500;
      },
    });
  }
  // Passthrough middleware — does nothing when Sentry is inactive.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (_err: any, _req: any, _res: any, next: any) => next(_err);
}
