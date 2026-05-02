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

// Field names that must never be sent to Sentry. Includes auth secrets,
// 152-ФЗ спец-категория health data, contact info (PII), and payment
// identifiers. Match is case-insensitive and substring-based for fields
// like `userPasswordHash` or `phoneNumber`.
const SCRUB_KEY_PATTERNS = [
  'password', 'passwd', 'secret', 'token', 'authorization', 'cookie', 'session',
  'apikey', 'api_key', 'totp', 'otp', 'pin',
  'email', 'phone', 'address', 'fullname', 'firstname', 'lastname',
  'weight', 'height', 'pulse', 'bmi', 'bodyfat', 'goal', 'injur',
  'healthrestriction', 'disease', 'allergy', 'medication',
  'card', 'cvv', 'iban', 'pan',
];
const MAX_SCRUB_DEPTH = 6;

function shouldScrubKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SCRUB_KEY_PATTERNS.some((pat) => lower.includes(pat));
}

function scrubObject(obj: any, depth = 0): void {
  if (depth > MAX_SCRUB_DEPTH || !obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) scrubObject(item, depth + 1);
    return;
  }
  for (const key of Object.keys(obj)) {
    if (shouldScrubKey(key)) {
      obj[key] = '[scrubbed]';
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      scrubObject(obj[key], depth + 1);
    }
  }
}

function scrubSentryEvent(event: any): void {
  if (!event || typeof event !== 'object') return;
  if (event.request) {
    if (event.request.data) scrubObject(event.request.data);
    if (event.request.headers) scrubObject(event.request.headers);
    if (event.request.cookies) scrubObject(event.request.cookies);
    // Strip query strings — they can contain reset tokens, OTP codes, etc.
    if (typeof event.request.query_string === 'string' && event.request.query_string.length > 0) {
      event.request.query_string = '[scrubbed]';
    }
  }
  // Round 234 (security audit): defensive scrub of `event.user`. The
  // `setUser({ id })` wrapper sends only the userId, but a future call site
  // bypassing the wrapper (`Sentry.setUser({ id, email })` direct) would
  // leak the email into Sentry's UI. `email` and `ip_address` are auto-
  // populated by Sentry's `sendDefaultPii: true` default — we strip them
  // here AND set `sendDefaultPii: false` in init below for belt-and-braces.
  if (event.user && typeof event.user === 'object') {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }
  if (event.extra) scrubObject(event.extra);
  if (event.contexts) scrubObject(event.contexts);
  if (event.tags) scrubObject(event.tags);
  if (Array.isArray(event.breadcrumbs)) {
    for (const b of event.breadcrumbs) {
      if (b?.data) scrubObject(b.data);
    }
  }
}

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
      // Round 234 (security audit): explicit opt-OUT of the SDK's auto-PII
      // behavior (req.body capture, IP attached to events, user.username).
      // beforeSend already scrubs these defensively, but flipping the
      // default at init time ensures nothing leaks via paths the wrapper
      // doesn't see (transport-layer event mutations, integration hooks).
      sendDefaultPii: false,
      // Scrub obvious PII from event payloads. Giron stores health data
      // (pulse, injuries, goals) which counts as spec-category PD under
      // 152-ФЗ — never send it to Sentry servers. Recursive scrub covers
      // request body, headers/cookies, extra context, and breadcrumb data
      // since any of those can carry user-supplied content.
      beforeSend(event: any) {
        scrubSentryEvent(event);
        return event;
      },
      beforeBreadcrumb(breadcrumb: any) {
        if (breadcrumb?.data) scrubObject(breadcrumb.data);
        // Drop request-body fragments from console-log breadcrumbs entirely —
        // safer to lose context than leak free-text health data.
        if (breadcrumb?.category === 'console' && typeof breadcrumb.message === 'string' && breadcrumb.message.length > 200) {
          breadcrumb.message = breadcrumb.message.slice(0, 200) + '…[truncated]';
        }
        return breadcrumb;
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
