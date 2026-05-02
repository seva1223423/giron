/**
 * Client-side error reporter (mirror of server/src/utils/errorReporter.ts).
 *
 * Same activation pattern as the server: lazy-require @sentry/react-native
 * inside try/catch so the app boots even if the package isn't installed and
 * SENTRY_DSN isn't configured. Once the founder runs `npx expo install
 * @sentry/react-native` and sets EXPO_PUBLIC_SENTRY_DSN, init runs at first
 * call and every subsequent reportError() routes to Sentry.
 *
 * Why client + server need separate wrappers:
 *   - @sentry/node is pure JS; @sentry/react-native has native modules and
 *     a different init signature.
 *   - Client-side scrubbing rules differ (no health-data PII enters the
 *     event payload from the client because requests carry the JWT only).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SentryModule = any;

let sentry: SentryModule | null = null;
let initialized = false;

// Mirror of server-side scrub list. Health data is спец-категория under
// 152-ФЗ, so even though the client mostly sends JWT-only requests, error
// `extra` payloads or breadcrumb data can still carry user-supplied content
// (e.g. a screen-level handler attaching the form being submitted).
//
// Round 235 (security audit follow-up): mirrored the server's switch from
// substring to camelCase/snake_case-aware token matching. Without this,
// `'card'` was scrubbing every `'cardio'`-prefixed breadcrumb key
// (CardioSession data) — actively destroying useful telemetry.
const EXACT_TOKENS = new Set<string>([
  'password', 'passwd', 'secret', 'token', 'authorization', 'cookie', 'session',
  'totp', 'otp', 'pin',
  'email', 'phone', 'address',
  'weight', 'height', 'pulse', 'bmi', 'bodyfat', 'goal',
  'healthrestriction', 'healthrestrictions', 'disease',
  'card', 'cvv', 'iban', 'pan',
]);
const PREFIX_TOKENS = ['injur', 'allerg', 'medicat'];
// firstName/lastName/fullName tokenize to ['first','name'] etc. — none of
// the parts is sensitive on its own, so we match the concat form instead.
const CONCAT_PATTERNS = [
  'apikey', 'api_key', 'totpsecret', 'idtoken',
  'firstname', 'lastname', 'fullname', 'givenname', 'surname',
];
const MAX_SCRUB_DEPTH = 6;

function tokenizeKey(key: string): string[] {
  return key
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\-\s.]+/)
    .filter(Boolean);
}

function shouldScrubKey(key: string): boolean {
  const lower = key.toLowerCase();
  for (const concat of CONCAT_PATTERNS) {
    if (lower.includes(concat)) return true;
  }
  const tokens = tokenizeKey(key);
  for (const tok of tokens) {
    if (EXACT_TOKENS.has(tok)) return true;
    for (const prefix of PREFIX_TOKENS) {
      if (tok.startsWith(prefix)) return true;
    }
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function tryLoadSentry(): SentryModule | null {
  if (initialized) return sentry;
  initialized = true;

  // Sentry DSN must be exposed to the client bundle via EXPO_PUBLIC_*
  // (regular process.env is server-only at build time). When unset, the
  // wrapper stays in console-only mode — safe default for dev devices.
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const mod = require('@sentry/react-native');
    mod.init({
      dsn,
      // 10% perf sample rate — same default as server. Cheap enough on quota,
      // dense enough to spot regressions in core flows (auth, AI chat).
      tracesSampleRate: 0.1,
      // Disable native crash collection on Expo Go (it requires a custom
      // dev build). When the user runs through EAS-built binaries this is
      // automatically true; in Expo Go it would silently no-op anyway.
      enableNative: true,
      // Round 234 (security audit): explicit opt-OUT of auto-PII so the SDK
      // doesn't attach username / IP / req.body on its own. Mirrors the
      // server-side errorReporter init.
      sendDefaultPii: false,
      // Keep PII scrubbing strict — Giron handles health data which counts
      // as спец-категория under 152-ФЗ. We never want goal/weight/height
      // strings landing in Sentry breadcrumbs.
      beforeSend(event: any) {
        if (event?.contexts?.app?.profile) delete event.contexts.app.profile;
        if (event?.request) {
          if (event.request.data) scrubObject(event.request.data);
          if (event.request.headers) scrubObject(event.request.headers);
          if (event.request.cookies) scrubObject(event.request.cookies);
          // Round 234 (security audit): mirror the server scrub —
          // query strings can carry reset tokens / OTPs / refresh
          // params on shared-link copy-paste flows.
          if (typeof event.request.query_string === 'string' && event.request.query_string.length > 0) {
            event.request.query_string = '[scrubbed]';
          }
        }
        // Round 234: defensive scrub of `event.user`. setUser({id}) wrapper
        // sends only the userId, but a future direct Sentry.setUser({id,
        // email}) bypassing the wrapper would leak email — strip here.
        if (event?.user && typeof event.user === 'object') {
          delete event.user.email;
          delete event.user.ip_address;
          delete event.user.username;
        }
        if (event?.extra) scrubObject(event.extra);
        if (event?.contexts) scrubObject(event.contexts);
        if (Array.isArray(event?.breadcrumbs)) {
          for (const b of event.breadcrumbs) {
            if (b?.data) scrubObject(b.data);
          }
        }
        return event;
      },
      beforeBreadcrumb(breadcrumb: any) {
        if (breadcrumb?.data) scrubObject(breadcrumb.data);
        return breadcrumb;
      },
    });
    sentry = mod;
    return sentry;
  } catch {
    // Module not installed yet — fall through to console-only mode. This is
    // the expected state until the founder activates Sentry.
    return null;
  }
}

export interface ErrorContext {
  userId?: string;
  screen?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>;
  tags?: Record<string, string>;
}

/**
 * Capture an error with optional context. Falls back to console.error when
 * Sentry isn't active.
 */
export function reportError(err: unknown, context: ErrorContext = {}): void {
  const s = tryLoadSentry();
  if (s) {
    s.withScope((scope: any) => {
      if (context.userId) scope.setUser({ id: context.userId });
      if (context.screen) scope.setTag('screen', context.screen);
      if (context.tags) {
        for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
      }
      if (context.extra) scope.setExtras(context.extra);
      s.captureException(err);
    });
    return;
  }
  // Round 277: gate console fallback on __DEV__. In production with
  // Sentry inactive, the only place this logs is the device's own
  // console — which on a rooted/jailbroken device or via USB-attached
  // logcat could leak stack traces + scrubbed-but-not-perfect context.
  // Keeping the fallback in dev (where it's useful) and dropping it in
  // production reduces the attack surface.
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.error('[reportError]', err instanceof Error ? err.stack ?? err.message : err, context);
  }
}

export function setUser(userId: string): void {
  const s = tryLoadSentry();
  if (s) s.setUser({ id: userId });
}

export function clearUser(): void {
  const s = tryLoadSentry();
  if (s) s.setUser(null);
}

export function addBreadcrumb(
  message: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
): void {
  const s = tryLoadSentry();
  if (s) s.addBreadcrumb({ message, data, level });
}
