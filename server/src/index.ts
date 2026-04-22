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

// Global error handler (catches both sync and async errors forwarded via next())
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`${req.method} ${req.path}:`, err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Process-level crash guards
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
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
  } catch {}
}, 6 * 60 * 60 * 1000);

// Cleanup used TOTP codes older than 90s (replay window) every 5 minutes
setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - 90 * 1000);
    await (await import('./db')).prisma.usedTotpCode.deleteMany({
      where: { usedAt: { lt: cutoff } },
    });
  } catch {}
}, 5 * 60 * 1000);

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
  } catch {}
}, 60 * 60 * 1000);

// Cleanup expired password reset tokens every 6 hours
setInterval(async () => {
  try {
    const { count } = await (await import('./db')).prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { used: true, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }] },
    });
    if (count > 0) logger.info(`[Cleanup] Deleted ${count} expired/used password reset tokens`);
  } catch {}
}, 6 * 60 * 60 * 1000);

// Prune expired in-memory cache entries every 10 minutes to prevent memory growth
setInterval(() => {
  adminStatsCache.prune();
  newsCache.prune();
}, 10 * 60 * 1000);

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
  } catch {}
}, 24 * 60 * 60 * 1000);

app.listen(PORT, () => {
  logger.info(`Iron Gym API server running on port ${PORT}`);
  startNewsRefreshScheduler();
});

export default app;
