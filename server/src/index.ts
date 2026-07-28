import { isSmtpConfigured, verifySmtpConnection } from './services/emailService';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth';
import { userRouter } from './routes/user';
import { workoutRouter } from './routes/workout';
import { nutritionRouter } from './routes/nutrition';
import { aiRouter } from './routes/ai';
import { newsRouter } from './routes/news';
import { subscriptionRouter } from './routes/subscription';
import { trainerRouter } from './routes/trainer';
import { cardioRouter } from './routes/cardio';
import { healthRouter } from './routes/health';
import { loggingRouter } from './routes/logging';
import { supportRouter } from './routes/support';
import { adminRouter } from './routes/admin';
import { recipesRouter } from './routes/recipes';
import { startNewsRefreshScheduler } from './services/newsRefreshService';
import { logger } from './utils/logger';
import { reportError, sentryErrorHandler } from './utils/errorReporter';
import { clientVersionGate } from './middleware/clientVersion';
import { adminStatsCache, newsCache, foodVisionCache } from './utils/memCache';
import { prisma } from './db';
import { trackCron } from './utils/cronHealth';

dotenv.config();

// ── Startup env-var validation ────────────────────────────────────────────────
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'] as const;
const missingEnvVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
  console.error('[FATAL] JWT_SECRET must be at least 32 characters for security');
  process.exit(1);
}
if ((process.env.JWT_REFRESH_SECRET?.length ?? 0) < 32) {
  console.error('[FATAL] JWT_REFRESH_SECRET must be at least 32 characters for security');
  process.exit(1);
}
// Audit 2026-06-07 (L7): access and refresh tokens share the same {userId}/iss/aud shape
// and differ only by signing secret. If both secrets are identical (an easy copy-paste
// misconfig), a 30-day refresh token would verify as an access token in authenticate(),
// defeating the short-lived-access design. Refuse to boot on that misconfiguration.
if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
  console.error('[FATAL] JWT_SECRET and JWT_REFRESH_SECRET must differ');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust exactly one reverse-proxy hop. Without this, Express sees the
// PaaS load-balancer IP as the client IP for every request, which collapses
// every user into a single rate-limit bucket — that's why the admin panel
// kept returning "Слишком много запросов" on the second tap from the
// founder's phone. We auto-enable on the well-known PaaS env vars so a
// missing TRUST_PROXY env var can't silently regress behaviour again.
//
// SECURITY NOTE: trust-proxy makes the app honour X-Forwarded-For, which
// would let a direct-internet attacker spoof their IP. Auto-enable is
// gated on PaaS markers (Render / Railway / Heroku set these themselves;
// a malicious request can't fake the env var). For local dev or
// direct-internet deployments TRUST_PROXY=true is still required.
const ON_PAAS = Boolean(
  process.env.RENDER ||           // Render auto-sets RENDER=true
  process.env.RAILWAY_ENVIRONMENT || // Railway
  process.env.HEROKU_APP_NAME,    // Heroku
);
if (process.env.TRUST_PROXY === 'true' || ON_PAAS) {
  app.set('trust proxy', 1);
}

// Middleware — strict security headers. We're an API-only server (no HTML rendering),
// so default-src 'none' blocks every resource class; the handful of response bodies
// that are text/plain or application/json need no permissions to render.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // mobile clients don't need CORP/COEP negotiation
  // Headers hardening (audit 2026-06-07): explicit 1-year HSTS + preload (stronger than
  // helmet's ~180d default) so any browser / web-preview access is pinned to HTTPS.
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// Restrict CORS — allow Expo Go, production app, and local dev only
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    // Allow Expo development tools (dev only). The startsWith checks are
    // anchored on `:` (port) or end-of-string so an attacker-controlled
    // host like `http://localhost-evil.attacker.com` doesn't slip through
    // the bare-prefix substring trap. exp:// matches the full scheme.
    if (
      process.env.NODE_ENV !== 'production' &&
      (/^http:\/\/localhost(:\d+)?(\/|$)/.test(origin) ||
        /^http:\/\/127\.0\.0\.1(:\d+)?(\/|$)/.test(origin) ||
        origin.startsWith('exp://'))
    ) {
      return callback(null, true);
    }
    // Allow configured production origins
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Food image analysis needs up to 10MB for base64-encoded photos — apply before the global limit.
app.use('/api/ai/analyze-food', express.json({ limit: '10mb' }));
// Voice input: base64-encoded m4a (≤30s recording) is typically 200KB-1MB.
// 3MB cap fits worst-case low-bitrate recordings while matching the Zod
// schema's 2.5MB string cap in routes/ai.ts. Apply before global limit.
app.use('/api/ai/voice', express.json({ limit: '3mb' }));
// Watch sync ships GPS tracks (up to 5000 points × 30 bytes) and batches
// of cardio/sleep/samples capped at 2000 each. A first-time sync of
// historical data can realistically reach ~1-2 MB. The Zod schema caps
// arrays at 2000 items each, so the body parser limit is the only thing
// standing between us and DoS — 4mb fits a worst-case real sync without
// being permissive enough to abuse.
app.use('/api/user/health/sync', express.json({ limit: '4mb' }));
// Workout sync carries whole sessions: the Zod schemas here accept up to 500
// sets, which serialises well past the 10kb global limit, so a genuinely long
// workout used to be rejected as "too large" (audit R28). 512kb covers the
// worst case the schemas permit and nothing more.
app.use('/api/workouts', express.json({ limit: '512kb' }));

// Global 10kb limit for all other endpoints.
// Webhook rawBody captured here for HMAC signature verification in subscription/webhook routes.
app.use(express.json({
  limit: '10kb',
  verify: (req, _res, buf) => { (req as any).rawBody = buf.toString(); },
}));

// Client version gate (CLIENT-VERSION-01). When MIN_CLIENT_VERSION is set
// in env, requests from APKs older than that get a structured 426 response
// instead of silently breaking on shape changes. Disabled by default — the
// middleware checks the env var per-request so flipping it on/off is just
// an env update + Render restart, no deploy.
app.use(clientVersionGate);

// Health check — DB ping returns 503 when unreachable (used by Render health check URL)
app.get('/health', async (_, res) => {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Whether outbound email is wired up. A password reset that silently
    // sends nothing looks identical to one that worked — the endpoint
    // answers "письмо отправлено" either way, by design, so that no one can
    // probe which addresses exist. Without this flag the only way to tell
    // was to read Render's env, and the founder is the only one who can.
    res.json({
      status: 'ok',
      db: 'connected',
      dbLatencyMs: Date.now() - t0,
      email: isSmtpConfigured() ? 'configured' : 'disabled',
    });
  } catch {
    // Return 503 so Render/load-balancer knows service is unhealthy
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

// Liveness probe — cheap check that the process is responsive. Unlike /health
// it never touches the DB, so a transient Neon hiccup won't trigger a pod
// restart. Use this for Kubernetes liveness / Render keepalive.
app.get('/health/live', (_, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

// Readiness probe — are we ready to serve real traffic? Adds DB + shutdown
// gate on top of /health. Returns 503 during graceful shutdown so the load
// balancer stops routing new requests immediately (before SIGTERM fully
// drains).
app.get('/health/ready', async (_, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting_down' });
  }
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', dbLatencyMs: Date.now() - t0 });
  } catch {
    res.status(503).json({ status: 'not_ready', reason: 'db_unreachable' });
  }
});

// Sentry status — quick "did the wrapper pick up SENTRY_DSN at boot?"
// probe. Returns whether @sentry/node is loaded and the DSN host (not
// the full DSN — that's a credential). Useful right after a deploy to
// confirm error tracking is actually live before the first real crash
// would tell you the hard way. NOT a probe / not gated on shutdown —
// safe to hit any time.
app.get('/health/sentry', (_, res) => {
  // Touch the wrapper so its lazy init runs on first hit. If SENTRY_DSN
  // isn't set the wrapper returns null without trying to require the
  // module; reportError stays in console-only mode.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
  const { reportError } = require('./utils/errorReporter');
  // Send a synthetic breadcrumb so the wrapper has *something* to do —
  // the breadcrumb is dropped client-side if Sentry is inactive.
  reportError(new Error('[health/sentry] init probe'), {
    tags: { origin: 'health-check' },
  });

  const dsn = process.env.SENTRY_DSN ?? '';
  let host: string | null = null;
  try {
    host = dsn ? new URL(dsn).host : null;
  } catch {
    host = 'invalid-dsn-url';
  }
  // We don't try to probe whether the @sentry/node module *loaded*
  // because the wrapper hides that. Instead we report on env state which
  // is the only thing the operator can act on.
  // Audit 2026-06: this endpoint is unauthenticated. Return only the
  // boolean state the operator can act on — NOT the DSN host (which
  // fingerprints the Sentry project/ingest endpoint to anyone).
  void host;
  res.json({
    sentryDsnConfigured: Boolean(dsn),
    note: dsn
      ? 'A test error has been routed through reportError. Check sentry.io within 30s.'
      : 'SENTRY_DSN not set. errorReporter is in console-only mode; nothing leaves the server.',
  });
});

// Deep diagnostics — DB + every configured LLM provider. NOT a probe (don't
// wire to load balancer; the LLM probe takes a network round-trip and would
// flap). For ops dashboards / on-call triage. Cached lightly via the LB
// would be fine, but we don't bother — call frequency is human-paced.
app.get('/health/deep', async (_, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting_down' });
  }
  const t0 = Date.now();
  // Lazy require — keeps the LLM stack out of cold-start critical path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
  const { healthCheckAll } = require('./services/llm/router') as typeof import('./services/llm/router');
  const [dbResult, llmResults] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    healthCheckAll(),
  ]);
  const dbOk = dbResult.status === 'fulfilled';
  const llms = llmResults.status === 'fulfilled' ? llmResults.value : [];
  const allHealthy = dbOk && llms.every((p) => p.ok);
  // Audit 2026-06: unauthenticated endpoint — return ok/degraded booleans
  // only. Do NOT echo raw DB/LLM error strings (String(reason) /
  // provider error bodies leak the DB host + upstream LLM endpoints to
  // any anonymous caller). The detailed error is logged server-side.
  if (!dbOk) {
    logger.warn('[health/deep] db check failed:', (dbResult as PromiseRejectedResult).reason);
  }
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ok' : 'degraded',
    db: { ok: dbOk },
    llm: llms.map((p: { name?: string; ok: boolean }) => ({ name: p.name, ok: p.ok })),
    durationMs: Date.now() - t0,
  });
});

// ── Rate limiters ────────────────────────────────────────────────────────────

/**
 * Admin endpoints: 200 requests per 15 minutes per IP.
 *
 * The 30-req cap was too strict for legit founder use: AdminDashboardScreen
 * fires 4 parallel requests on mount and again every 60s of auto-refresh
 * (stats, analytics, logs, activityFeed). Eight minutes of having the
 * dashboard open would burn the budget — and that's BEFORE the metrics-key
 * screen, support inbox, or any user-detail drill-downs.
 *
 * 200/15min = ~13/min sustained which still defends against scraping but
 * comfortably absorbs an active admin session. Combined with the
 * trust-proxy fix above, each user gets their own bucket, so this cap is
 * per-admin not global.
 */
const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов к панели администратора. Попробуйте через 15 минут.' },
});

/** Auth endpoints: 20 attempts per 15 minutes per IP to slow brute-force */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
});

/** AI endpoints: 60 requests per minute per IP — prevents cost abuse */
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов к ИИ. Подождите минуту.' },
});

/** User endpoints: 200 requests per minute per IP — prevents enumeration/scraping */
const userRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Подождите минуту.' },
});

/**
 * TOTP verify: strict 5 attempts per 5 minutes to mitigate brute-force.
 *
 * Two fixes from audit R27. This single instance is mounted on seven prefixes,
 * and express-rate-limit keys purely by IP, so all seven shared ONE bucket:
 * simply setting 2FA up (read status, start setup, confirm) spent the budget
 * and one mistyped code returned 429 on a clean configuration. The key now
 * includes the mounted path so each endpoint gets its own bucket, and
 * read-only requests are skipped — a GET cannot brute-force anything.
 *
 * Known remaining limit: the key is still IP-based, so subscribers behind one
 * mobile-carrier NAT share a bucket. Keying per account is not possible here —
 * this middleware runs before `authenticate`, so req.userId does not exist yet.
 */
const totpRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET',
  // ipKeyGenerator normalises IPv6 into a /56 subnet — required by
  // express-rate-limit v7 when supplying a custom keyGenerator.
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${req.baseUrl.toLowerCase()}`,
  message: { error: 'Слишком много попыток ввода кода 2FA. Подождите 5 минут.', code: 'TOTP_RATE_LIMIT' },
});

/** Food vision analysis: 20 per hour per IP — vision API is expensive; client enforces 5/day for free users */
const foodAnalysisRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов на анализ фото. Попробуйте через час.', code: 'VISION_RATE_LIMIT' },
});

/** AI recipe generation: 20 per hour per IP — same shape as foodAnalysis
 *  because each call burns ~1500 Mistral tokens (full recipe JSON). The
 *  recipes route otherwise inherits the userRateLimiter (200/min) which
 *  is fine for the CRUD endpoints but lets cost-abuse pile up on the
 *  one paid-LLM call. Mirror the food-analysis split: tight per-endpoint
 *  cap stacked over the generic CRUD cap. */
const recipeAiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов на ИИ-рецепты. Попробуйте через час.', code: 'RECIPE_AI_RATE_LIMIT' },
});

/** Password-reset flow: 5 requests per hour per IP — prevents email-spam abuse */
const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов на сброс пароля. Попробуйте через час.', code: 'RESET_RATE_LIMIT' },
});

/** Account-existence probes (check-email / check-phone) — stricter than the
 * generic auth limiter to slow mass enumeration. The UI login picker only needs
 * these once per form submit, so 10 per 15 minutes is plenty for real users.
 *
 * Round 237: tightened from 15 to 10 — still enough for legit users (a typical
 * login flow probes once per attempt; 10 attempts in 15 min is plenty). The
 * audit identified these as enumeration oracles since both endpoints leak
 * "user exists" / which auth methods are linked. The endpoints can't be
 * removed without breaking the auth picker UX, so the strict rate limit
 * + the `account_enumeration_probe` audit log (added below) are the
 * mitigations. */
const enumRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Подождите 15 минут.' },
});

// Does outbound email actually work? Opens an SMTP connection, authenticates
// and disconnects — nothing is sent. Rate-limited because it makes the server
// dial out on demand, and deliberately vague in its answer: the underlying
// error quotes the SMTP username back, and this needs no auth.
app.get('/health/email', authRateLimiter, async (_, res) => {
  const result = await verifySmtpConnection();
  res.json({ configured: isSmtpConfigured(), smtp: result.ok ? 'ok' : result.error, code: result.code, smtpCode: result.smtpCode });
});


// Routes
app.use('/api/auth/totp-verify', totpRateLimiter);
app.use('/api/auth/forgot-password', passwordResetRateLimiter);
app.use('/api/auth/reset-password', passwordResetRateLimiter);
app.use('/api/auth/reset-password-by-phone', passwordResetRateLimiter);
// Account-enumeration probes — must be declared BEFORE the general authRateLimiter
// below so both limiters apply (enum is stricter; auth is a safety net).
app.use('/api/auth/check-email', enumRateLimiter);
app.use('/api/auth/check-phone', enumRateLimiter);
app.use('/api/auth', authRateLimiter, authRouter);
// Apply strict TOTP rate limiter to 2FA code-accepting user endpoints
// AND to anything that accepts a password / TOTP / OTP guess as part of
// step-up reauth. Without the per-endpoint limiter the generic
// userRateLimiter (200/min) would still let an attacker holding a
// stolen access token brute-force passwords on these flows.
app.use('/api/user/2fa', totpRateLimiter);
app.use('/api/user/account', totpRateLimiter);
app.use('/api/user/change-email', totpRateLimiter);
app.use('/api/user/change-phone', totpRateLimiter);
// Audit 2026-05-29 (HIGH): /change-password and /linked-accounts also accept a
// password/TOTP step-up guess but were missing the strict limiter — only the
// generic userRateLimiter (200/min) applied, enough to brute-force a password
// with a stolen access token. Mount the strict limiter before the generic mount.
app.use('/api/user/change-password', totpRateLimiter);
app.use('/api/user/linked-accounts', totpRateLimiter);
app.use('/api/user', userRateLimiter, userRouter);
app.use('/api/workouts', userRateLimiter, workoutRouter);
app.use('/api/nutrition', userRateLimiter, nutritionRouter);
app.use('/api/ai/analyze-food', foodAnalysisRateLimiter);
// Audit: /analyze-food-text is also a Mistral call (text-mode prompt
// with the same prompt complexity / token cost as the vision path),
// but it was previously only gated by the generic aiRateLimiter
// (60/min). A user could fire 60 text-analyse calls per minute and
// burn the Mistral budget far faster than via the photo path.
// Apply the same 20/h-per-IP cap so cost-abuse symmetry holds.
app.use('/api/ai/analyze-food-text', foodAnalysisRateLimiter);
app.use('/api/ai', aiRateLimiter, aiRouter);
app.use('/api/news', userRateLimiter, newsRouter);
app.use('/api/subscription', userRateLimiter, subscriptionRouter);
app.use('/api/trainer', userRateLimiter, trainerRouter);
app.use('/api/cardio', userRateLimiter, cardioRouter);
// Round 240 — smartwatch / health integration. Mounted under /api/user
// so routes like /api/user/health/sync and /api/user/devices co-locate
// with the existing /api/user/profile namespace. No conflict with
// userRouter — health.ts uses /health/* and /devices/* paths only.
app.use('/api/user', userRateLimiter, healthRouter);
// Client-error logging endpoint (forwards to Telegram bot). Mounted
// at /api so a client crash at /, /login or any pre-auth path can post
// here without going through user-rate-limit (it has its own limiter).
app.use('/api', loggingRouter);
app.use('/api/support', userRateLimiter, supportRouter);
app.use('/api/admin', adminRateLimiter, adminRouter);
// Tight per-endpoint cap for the LLM-backed recipe generator — must be
// declared BEFORE the general /api/recipes mount so both limiters stack
// (same pattern as /api/ai/analyze-food above).
app.use('/api/recipes/ai-generate', recipeAiRateLimiter);
app.use('/api/recipes', userRateLimiter, recipesRouter);

// CORS origin rejections are an expected client-side condition (a request
// arrived with a disallowed `Origin` header — a web dev origin like
// http://localhost:8081 hitting prod, a scanner, or a misconfigured client),
// NOT a server fault. Handle them quietly with 403 BEFORE the Sentry/Telegram
// reporters below so a blocked preflight doesn't page the error channel on
// every hit. A genuine route/DB failure has no such message and still flows
// through to the reporters. Keep this in sync with the `cors({ origin })`
// rejection message above.
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && err.message === 'Not allowed by CORS') {
    logger.warn(`CORS blocked ${req.method} ${req.path} from origin ${req.headers.origin ?? 'unknown'}`);
    if (!res.headersSent) {
      res.status(403).json({ error: 'Origin not allowed' });
    }
    return; // swallow — do not forward to Sentry/Telegram reporters
  }
  next(err);
});

// Round 234 (security audit): Sentry's Express error handler must run
// AFTER all route handlers and BEFORE our generic 500 fallback below.
// Without it, the SDK's default integrations capture req.body / headers
// on their own — going around our `beforeSend` scrub for events that
// originate from un-instrumented code paths. The wrapper passes through
// when SENTRY_DSN isn't set, so this is a no-op in dev.
app.use(sentryErrorHandler());

// Global error handler (catches both sync and async errors forwarded via next()).
// reportError routes to Sentry when SENTRY_DSN + @sentry/node are active,
// otherwise falls through to logger.error — so call is unconditional.
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // body-parser flags caller mistakes with a 4xx status: malformed JSON is
  // 400 entity.parse.failed, an oversized body is 413 entity.too.large. This
  // handler ignored that and treated everything as a server fault, so the
  // caller got a misleading "Внутренняя ошибка сервера" and the founder got
  // a Sentry event plus a Telegram page for someone else's broken request
  // (audit R28). Answer honestly and stay quiet.
  const clientStatus = Number(
    (err as { status?: number; statusCode?: number }).status
    ?? (err as { statusCode?: number }).statusCode
    ?? 0,
  );
  if (clientStatus >= 400 && clientStatus < 500) {
    logger.warn(`${req.method} ${req.path}: ${clientStatus} ${err.message}`);
    if (!res.headersSent) {
      res.status(clientStatus).json({
        error: clientStatus === 413 ? 'Слишком большой запрос' : 'Некорректный запрос',
      });
    }
    return;
  }

  const userId = (req as { userId?: string }).userId;
  reportError(err, {
    route: `${req.method} ${req.path}`,
    userId,
    tags: { origin: 'express-error-handler' },
  });
  logger.error(`${req.method} ${req.path}:`, err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Process-level crash guards. These fire for async errors that nobody
// awaited (stray `.then()` chains) and synchronous throws outside a
// request context (e.g. scheduled intervals below).
process.on('unhandledRejection', (reason) => {
  reportError(reason, { tags: { origin: 'unhandled-rejection' } });
  logger.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  reportError(err, { tags: { origin: 'uncaught-exception' } });
  logger.error('Uncaught exception:', err);
  // Flush-then-exit: give Sentry up to 2s to dispatch the event before we
  // die. reportError is a no-op when Sentry is inactive, so this is just
  // a short delay in dev. process.exit is still synchronous — we only
  // delay it via setTimeout.
  setTimeout(() => process.exit(1), 2000).unref();
});

// Cleanup jobs — extracted to utils/cleanupJobs.ts so each predicate is
// directly unit-testable. Schedules stay here; logic + reportError tags
// live in the extracted functions.
import {
  runRefreshTokenAndDeviceCleanup,
  runTotpReplayCleanup,
  runOtpCodesCleanup,
  runPasswordResetCleanup,
  runFoodScanLogCleanup,
  runHealthSampleCleanup,
} from './utils/cleanupJobs';

// Cleanup expired/revoked refresh tokens and expired trusted devices every 6 hours
// Wrapped in `trackCron` so /admin/cron-health correctly reports the cleanup
// jobs as alive — previously they fired but the liveness ledger never marked
// them, leaving the dashboard showing "never run" on a working server.
setInterval(() => {
  void trackCron('cleanup-tokens-devices', async () => {
    const db = (await import('./db')).prisma;
    await runRefreshTokenAndDeviceCleanup(db);
  });
}, 6 * 60 * 60 * 1000).unref();

// Cleanup used TOTP codes older than 90s (replay window) every 5 minutes
setInterval(() => {
  void trackCron('cleanup-totp-replay', async () => {
    const db = (await import('./db')).prisma;
    await runTotpReplayCleanup(db);
  });
}, 5 * 60 * 1000).unref();

// Cleanup expired/used OTP codes and stale TOTP replay records every hour
setInterval(() => {
  void trackCron('cleanup-otp-codes', async () => {
    const db = (await import('./db')).prisma;
    await runOtpCodesCleanup(db);
  });
}, 60 * 60 * 1000).unref();

// Cleanup expired password reset tokens every 6 hours
setInterval(() => {
  void trackCron('cleanup-password-reset', async () => {
    const db = (await import('./db')).prisma;
    await runPasswordResetCleanup(db);
  });
}, 6 * 60 * 60 * 1000).unref();

// Cleanup stale food-scan log entries (>90d) once a day. The aggregate
// Meal/MealItem rows live forever; this only drops the per-scan diagnostic
// blob that has no value past the day the meal was logged.
setInterval(() => {
  void trackCron('cleanup-food-scan-log', async () => {
    const db = (await import('./db')).prisma;
    await runFoodScanLogCleanup(db);
  });
}, 24 * 60 * 60 * 1000).unref();

// Cleanup stale HealthSample rows (>90d) once a day. Raw watch samples
// (HR/HRV/SpO2) can balloon fast — 1440 HR samples/day/user if a wearable
// is connected. Dashboards/AI context only read the last 30-60 days.
setInterval(() => {
  void trackCron('cleanup-health-sample', async () => {
    const db = (await import('./db')).prisma;
    await runHealthSampleCleanup(db);
  });
}, 24 * 60 * 60 * 1000).unref();

// Prune expired in-memory cache entries every 10 minutes to prevent memory growth.
// foodVisionCache (24h TTL, 100 entries, 200KB/entry) was missing from this list —
// without proactive pruning, cold entries that never get read again sit until
// capacity-eviction kicks them out (a minor leak — up to ~20MB worst-case).
setInterval(() => {
  adminStatsCache.prune();
  newsCache.prune();
  foodVisionCache.prune();
}, 10 * 60 * 1000).unref();

// DB keep-warm ping (PERF-01). Render free tier sleeps the service after
// 15 min of idle, and Neon free tier scale-to-zero adds another 200-700ms
// to the first query after sleep. The dashboard "DB ping 705мс" warning
// the founder hit was that combined cold-start. A no-op SELECT 1 every
// 10 minutes keeps NEON warm — the connection pool stays active.
//
// It does NOT keep Render awake, whatever this comment used to claim:
// Render's free tier spins down on the absence of INBOUND HTTP traffic,
// and a setInterval inside the process is not inbound traffic. The dyno
// still sleeps after 15 idle minutes and still takes 30-50s to answer the
// first request. Only a paid plan or an external pinger fixes that.
// Doesn't help if the request
// queue is genuinely loaded — but for a 5-user product it eliminates
// the worst-case visible latency.
//
// Skip in test environment (NODE_ENV=test) — Jest test suites mock the
// db module, and an unstubbed prisma reference here would break the
// suite that imports index.ts (subscription_gating, trainer_invite,
// otp). Production / development run as normal.
if (process.env.NODE_ENV !== 'test') {
  setInterval(async () => {
    try {
      await trackCron('keep-warm', async () => {
        await prisma.$queryRaw`SELECT 1`;
      });
    } catch (err) {
      // Don't reportError — the keep-warm is best-effort and a transient
      // failure here doesn't surface a real user-facing issue. Logging
      // every transient failure would just clutter Sentry/Render logs.
      logger.debug('[KeepWarm] ping failed:', err);
    }
  }, 10 * 60 * 1000).unref();
}

// Trim security events per user to last 200 entries (prevents unbounded DB growth) — runs daily
setInterval(async () => {
  try {
    const db = (await import('./db')).prisma;
    // Find users with more than 200 security events and delete the oldest
    const users = await db.$queryRaw<Array<{ userId: string; cnt: bigint }>>`
      SELECT "userId", COUNT(*) as cnt FROM "SecurityEvent" GROUP BY "userId" HAVING COUNT(*) > 200
    `;
    let deletedTotal = 0;
    for (const row of users) {
      const keepIds = await db.securityEvent.findMany({
        where: { userId: row.userId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { id: true },
      });
      const { count } = await db.securityEvent.deleteMany({
        where: { userId: row.userId, id: { notIn: keepIds.map((r) => r.id) } },
      });
      deletedTotal += count;
    }
    if (deletedTotal > 0) logger.info(`[Cleanup] Trimmed ${deletedTotal} old security events`);
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'cleanup-security-events' } });
  }
}, 24 * 60 * 60 * 1000).unref();

// Retention pushes (RETENTION-01..04). Runs hourly so the activation cohort
// fires reasonably close to the 24h mark; reactivation cohorts only "fire"
// once per user (gated by *SentAt) so calling them hourly is safe and
// self-deduplicating. The first invocation is delayed 5 minutes after boot
// to avoid sending a backlog burst during a deploy/restart.
setTimeout(() => {
  setInterval(async () => {
    try {
      await trackCron('retention', async () => {
        const { runAllRetentionCohorts } = await import('./services/retentionService');
        await runAllRetentionCohorts();
      });
    } catch (err) {
      reportError(err as Error, { tags: { origin: 'retention-cron' } });
    }
  }, 60 * 60 * 1000).unref();
}, 5 * 60 * 1000).unref();

// Weekly summary email (RETENTION-03). Runs every hour but only fires the
// expensive aggregation if it's currently Sunday 18:00-18:59 UTC. We pick
// 18:00 UTC = 21:00 МСК — late enough that most users finished their
// Sunday workout, early enough that the email isn't seen as Monday clutter.
// The lookback window dedupes naturally — even if the cron tick is missed
// once and runs at 19:00, the same eligibility set would still be processed
// (no harm because email send is idempotent at the SMTP level for the
// purpose of this lightweight version).
setInterval(async () => {
  const now = new Date();
  if (now.getUTCDay() !== 0 /* Sunday */ || now.getUTCHours() !== 18) return;
  try {
    await trackCron('weekly-summary', async () => {
      const { processWeeklySummaryEmails } = await import('./services/retentionService');
      await processWeeklySummaryEmails();
    });
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'weekly-summary-cron' } });
  }
}, 60 * 60 * 1000).unref();

// Daily admin digest (ADMIN-DIGEST-01). Fires once a day at 06:00 UTC =
// 09:00 МСК. The hourly tick + hour gate is the same pattern as weekly
// summary above — keeps the cron schedule trivial without adding a real
// cron library. If a deploy lands during 06:00-06:59 UTC the digest still
// fires within the hour window; if it lands at 06:55 we may double-fire
// once, which is harmless (admins just get two pushes — annoying not
// dangerous, and only on deploy days).
setInterval(async () => {
  const now = new Date();
  if (now.getUTCHours() !== 6) return;
  try {
    await trackCron('admin-digest', async () => {
      const { sendDailyAdminDigest } = await import('./services/adminDigestService');
      await sendDailyAdminDigest();
    });
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'admin-digest-cron' } });
  }
}, 60 * 60 * 1000).unref();

// ── Graceful shutdown ───────────────────────────────────────────────────────
// Render / Railway / Kubernetes send SIGTERM ~30s before SIGKILL. Without this
// handler we drop in-flight requests (esp. AI calls up to 60s) and leave
// Prisma pool connections dangling. The gate also flips the readiness probe
// to 503 so the load balancer stops routing new traffic immediately.

let isShuttingDown = false;

// Audit 2026-05-29 (CRITICAL): guard listen behind NODE_ENV so importing this
// module in tests (supertest) does NOT bind a real TCP port and leak the handle
// ("worker failed to exit gracefully" / EADDRINUSE on parallel suites).
const server = process.env.NODE_ENV !== 'test' ? app.listen(PORT, () => {
  logger.info(`Giron API server running on port ${PORT}`);
  startNewsRefreshScheduler();

  // ── Admin bootstrap (ADMIN-BOOTSTRAP-01) ──────────────────────────────
  // If ADMIN_BOOTSTRAP_EMAIL is set in env, find the matching user and
  // ensure their role is 'ADMIN'. Idempotent — re-running is a no-op when
  // the user is already admin or the email isn't registered yet. Lets the
  // founder promote themselves with one env var instead of running raw SQL
  // against Neon.
  //
  // Runs *after* listen so a missing user doesn't block server start
  // (e.g. fresh deploy on an empty DB) — fire-and-forget, log only.
  // NFKC-normalize to match the Zod email pipeline applied at register/
  // login (sec audit 2026-04 HIGH-14). Without it, a precomposed-vs-
  // decomposed Unicode mismatch in the env var would silently skip
  // the admin promotion even when the user is registered.
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase().normalize('NFKC');
  if (bootstrapEmail) {
    // Fire-and-forget with a small retry: this runs right after `listen`, so on
    // a fresh Render deploy it can race a cold Neon compute that's still waking
    // up — the first query then throws a transient "Can't reach database"
    // PrismaClientInitializationError. Retry a few times with backoff so that
    // self-healing cold-starts don't page the error channel; only a *persistent*
    // failure (real outage / misconfig) still reports — and a real outage is
    // already loudly visible via failing requests elsewhere.
    void (async () => {
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const r = await prisma.user.updateMany({
            where: { email: bootstrapEmail, role: { not: 'ADMIN' } },
            data: { role: 'ADMIN' },
          });
          if (r.count > 0) {
            logger.info(`[AdminBootstrap] Promoted ${bootstrapEmail} to ADMIN`);
          } else {
            // Either already admin (fine) or user not yet registered (also fine —
            // the upsert will fire on the next boot after they register).
            logger.info(`[AdminBootstrap] No promotion needed for ${bootstrapEmail}`);
          }
          return;
        } catch (err) {
          if (attempt === MAX_ATTEMPTS) {
            reportError(err as Error, { tags: { origin: 'admin-bootstrap' } });
          } else {
            logger.warn(`[AdminBootstrap] DB not ready (attempt ${attempt}/${MAX_ATTEMPTS}), retrying…`);
            await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
          }
        }
      }
    })();
  }
}) : null;

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return; // idempotent — avoid double-handling SIGTERM+SIGINT
  if (!server) return; // test env (NODE_ENV=test): no server started, nothing to drain
  isShuttingDown = true;
  logger.info(`[Shutdown] Received ${signal}, draining connections...`);

  // Hard ceiling. Render sends SIGTERM then SIGKILL 30s later; for longer
  // drains we must request a higher terminationGracePeriodSeconds (K8s) or
  // upgrade the Render plan. Our AI calls time out at 60s against Mistral,
  // so setting this below 60s guarantees we'll SIGKILL mid-response on
  // deploy windows that happen to catch a long-running AI chat.
  //
  // Compromise: 25s here keeps Render-free happy while at least giving
  // most non-AI requests time to drain. When SENTRY_DSN is active this
  // constant should be re-tuned against real p99 latency numbers.
  const HARD_TIMEOUT_MS = 25_000;
  const killTimer = setTimeout(() => {
    logger.error('[Shutdown] Drain timeout exceeded, forcing exit');
    process.exit(1);
  }, HARD_TIMEOUT_MS);
  // Don't let this timer keep the event loop alive — if everything drains
  // cleanly we exit via the success path below.
  killTimer.unref();

  // Stop accepting new connections. In-flight requests continue until done.
  server.close(async (err) => {
    if (err) {
      logger.error('[Shutdown] server.close error:', err);
    }
    try {
      await prisma.$disconnect();
      logger.info('[Shutdown] Prisma disconnected cleanly');
    } catch (e) {
      logger.error('[Shutdown] Prisma disconnect failed:', e);
    }
    clearTimeout(killTimer);
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
