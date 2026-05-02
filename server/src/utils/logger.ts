/**
 * Server logger with defense-in-depth PII scrubbing.
 *
 * Routes mostly log `userId` (already non-sensitive) — but the scrub layer
 * is here so that a future commit like `logger.info('user', user)` or
 * `logger.error('refresh failed', { token, refreshToken })` can't leak
 * credentials/PII into the log stream the moment someone forgets the
 * codebase convention. Also redacts inside nested objects (axios errors,
 * Zod parse errors, etc. love to capture the full request body).
 */

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'warn' : 'debug');

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

// Keys whose values are always replaced with '[REDACTED]' in logged objects.
// Match by exact lowercase key, not substring — `userId` would otherwise hit
// the substring `id` and we'd lose the audit-critical user reference.
const REDACT_KEYS = new Set<string>([
  'password',
  'newpassword',
  'oldpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'apikey',
  'api_key',
  'totpsecret',
  'backupcodes',
  // Sentry/PostHog convention
  'session',
  'sessiontoken',
]);

// Email pattern — redact any string that looks like an address, anywhere
// in a logged blob. Tight enough not to false-positive on a UUID with a
// dot in it.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// JWT-like tokens (header.payload.signature, base64url segments). Only
// redact when at least one segment is reasonably long — avoids matching
// version strings or hashes.
const JWT_RE = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b/g;

const MAX_DEPTH = 6;

function scrubString(s: string): string {
  return s.replace(EMAIL_RE, '[REDACTED_EMAIL]').replace(JWT_RE, '[REDACTED_TOKEN]');
}

function scrub(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[Object — max depth]';

  // Cycle protection: a logged Prisma error or axios error can self-reference.
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  // Error instances: keep name/message/stack but scrub each field.
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      stack: value.stack ? scrubString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((v) => scrub(v, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = scrub(v, depth + 1, seen);
    }
  }
  return out;
}

function scrubArgs(args: unknown[]): unknown[] {
  return args.map((a) => scrub(a));
}

export const logger = {
  error: (...args: unknown[]) => {
    if (shouldLog('error')) console.error(`[${timestamp()}] [ERROR]`, ...scrubArgs(args));
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(`[${timestamp()}] [WARN]`, ...scrubArgs(args));
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) console.log(`[${timestamp()}] [INFO]`, ...scrubArgs(args));
  },
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) console.log(`[${timestamp()}] [DEBUG]`, ...scrubArgs(args));
  },
};

// Exported for unit tests + any future log shipper that needs the same
// redaction (Sentry already has its own per errorReporter.ts).
export const _internal = { scrub, scrubString, REDACT_KEYS };
