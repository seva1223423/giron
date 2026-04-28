import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import { supportRouter } from './routes/support';
import { adminRouter } from './routes/admin';
import { startNewsRefreshScheduler } from './services/newsRefreshService';
import { logger } from './utils/logger';
import { reportError } from './utils/errorReporter';
import { clientVersionGate } from './middleware/clientVersion';
import { adminStatsCache, newsCache } from './utils/memCache';
import { prisma } from './db';

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

const app = express();
const PORT = process.env.PORT || 3000;

// Trust exactly one reverse-proxy hop when TRUST_PROXY=true (e.g. nginx, Heroku, Railway).
// This makes req.ip correct and prevents rate-limiter collapse (all traffic showing proxy IP).
// DO NOT enable in direct-internet deployments — it would allow spoofed X-Forwarded-For.
if (process.env.TRUST_PROXY === 'true') {
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
}));

// Restrict CORS — allow Expo Go, production app, and local dev only
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    // Allow Expo development tools (dev only)
    if (process.env.NODE_ENV !== 'production' && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.startsWith('exp://'))) return callback(null, true);
    // Allow configured production origins
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Food image analysis needs up to 10MB for base64-encoded photos — apply before the global limit.
app.use('/api/ai/analyze-food', express.json({ limit: '10mb' }));

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
    res.json({ status: 'ok', db: 'connected', dbLatencyMs: Date.now() - t0 });
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
  res.json({
    sentryDsnConfigured: Boolean(dsn),
    dsnHost: host,
    nodeEnv: process.env.NODE_ENV || 'development',
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
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ok' : 'degraded',
    db: { ok: dbOk, error: dbOk ? undefined : String((dbResult as PromiseRejectedResult).reason) },
    llm: llms,
    durationMs: Date.now() - t0,
  });
});

// ── Rate limiters ────────────────────────────────────────────────────────────

/** Admin endpoints: very strict — 30 requests per 15 minutes per IP */
const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
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

/** TOTP verify: strict 5 attempts per 5 minutes per IP to mitigate brute-force */
const totpRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
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
 * these once per form submit, so 15 per 15 minutes is plenty for real users. */
const enumRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Подождите 15 минут.' },
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
app.use('/api/user/2fa', totpRateLimiter);
app.use('/api/user', userRateLimiter, userRouter);
app.use('/api/workouts', userRateLimiter, workoutRouter);
app.use('/api/nutrition', userRateLimiter, nutritionRouter);
app.use('/api/ai/analyze-food', foodAnalysisRateLimiter);
app.use('/api/ai', aiRateLimiter, aiRouter);
app.use('/api/news', userRateLimiter, newsRouter);
app.use('/api/subscription', userRateLimiter, subscriptionRouter);
app.use('/api/trainer', userRateLimiter, trainerRouter);
app.use('/api/cardio', userRateLimiter, cardioRouter);
app.use('/api/support', userRateLimiter, supportRouter);
app.use('/api/admin', adminRateLimiter, adminRouter);

// Global error handler (catches both sync and async errors forwarded via next()).
// reportError routes to Sentry when SENTRY_DSN + @sentry/node are active,
// otherwise falls through to logger.error — so call is unconditional.
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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

// Cleanup expired/revoked refresh tokens and expired trusted devices every 6 hours
setInterval(async () => {
  try {
    const db = (await import('./db')).prisma;
    const { count: rtCount } = await db.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revoked: true, createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }] },
    });
    const { count: tdCount } = await db.trustedDevice.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (rtCount > 0) logger.info(`[Cleanup] Deleted ${rtCount} expired/revoked refresh tokens`);
    if (tdCount > 0) logger.info(`[Cleanup] Deleted ${tdCount} expired trusted devices`);
  } catch (err) {
    // Cleanup failures aren't user-facing but compounding silent failures
    // mean we'd silently leak storage; surface them to Sentry so they're
    // visible in the issue feed.
    reportError(err as Error, { tags: { origin: 'cleanup-tokens-devices' } });
  }
}, 6 * 60 * 60 * 1000).unref();

// Cleanup used TOTP codes older than 90s (replay window) every 5 minutes
setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - 90 * 1000);
    await (await import('./db')).prisma.usedTotpCode.deleteMany({
      where: { usedAt: { lt: cutoff } },
    });
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'cleanup-totp-replay' } });
  }
}, 5 * 60 * 1000).unref();

// Cleanup expired/used OTP codes and stale TOTP replay records every hour
setInterval(async () => {
  try {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const db = (await import('./db')).prisma;
    const { count } = await db.otpCode.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } }, // expired (regardless of used status)
          { used: true, createdAt: { lt: cutoff24h } }, // used + older than 24h
        ],
      },
    });
    if (count > 0) logger.info(`[Cleanup] Deleted ${count} expired/used OTP codes`);
    // UsedTotpCode only needs 90s replay window; purge anything older than 5 minutes
    const totpCutoff = new Date(Date.now() - 5 * 60 * 1000);
    const { count: totpCount } = await db.usedTotpCode.deleteMany({ where: { usedAt: { lt: totpCutoff } } });
    if (totpCount > 0) logger.info(`[Cleanup] Deleted ${totpCount} stale TOTP replay records`);
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'cleanup-otp-codes' } });
  }
}, 60 * 60 * 1000).unref();

// Cleanup expired password reset tokens every 6 hours
setInterval(async () => {
  try {
    const { count } = await (await import('./db')).prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { used: true, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }] },
    });
    if (count > 0) logger.info(`[Cleanup] Deleted ${count} expired/used password reset tokens`);
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'cleanup-password-reset' } });
  }
}, 6 * 60 * 60 * 1000).unref();

// Prune expired in-memory cache entries every 10 minutes to prevent memory growth
setInterval(() => {
  adminStatsCache.prune();
  newsCache.prune();
}, 10 * 60 * 1000).unref();

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
      const { runAllRetentionCohorts } = await import('./services/retentionService');
      await runAllRetentionCohorts();
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
    const { processWeeklySummaryEmails } = await import('./services/retentionService');
    await processWeeklySummaryEmails();
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
    const { sendDailyAdminDigest } = await import('./services/adminDigestService');
    await sendDailyAdminDigest();
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

const server = app.listen(PORT, () => {
  logger.info(`Iron Gym API server running on port ${PORT}`);
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
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (bootstrapEmail) {
    prisma.user.updateMany({
      where: { email: bootstrapEmail, role: { not: 'ADMIN' } },
      data: { role: 'ADMIN' },
    }).then((r) => {
      if (r.count > 0) {
        logger.info(`[AdminBootstrap] Promoted ${bootstrapEmail} to ADMIN`);
      } else {
        // Either already admin (fine) or user not yet registered (also fine —
        // the upsert will fire on the next boot after they register).
        logger.info(`[AdminBootstrap] No promotion needed for ${bootstrapEmail}`);
      }
    }).catch((err) => {
      reportError(err as Error, { tags: { origin: 'admin-bootstrap' } });
    });
  }
});

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return; // idempotent — avoid double-handling SIGTERM+SIGINT
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
