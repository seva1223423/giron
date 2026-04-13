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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // CSP disabled — API-only server

// Restrict CORS — allow Expo Go, production app, and local dev only
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    // Allow Expo development tools
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.startsWith('exp://')) return callback(null, true);
    // Allow configured production origins
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Capture raw body for webhook signature verification via verify callback
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { (req as any).rawBody = buf.toString(); },
}));

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// ── Rate limiters ────────────────────────────────────────────────────────────

/** Admin endpoints: very strict — 30 requests per 15 minutes per IP */
const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов к панели администратора. Попробуйте через 15 минут.' },
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/** Auth endpoints: 20 attempts per 15 minutes per IP to slow brute-force */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/** AI endpoints: 60 requests per minute per IP — prevents cost abuse */
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов к ИИ. Подождите минуту.' },
  keyGenerator: (req) => req.ip ?? 'unknown',
});

// Routes
app.use('/api/auth', authRateLimiter, authRouter);
app.use('/api/user', userRouter);
app.use('/api/workouts', workoutRouter);
app.use('/api/nutrition', nutritionRouter);
app.use('/api/ai', aiRateLimiter, aiRouter);
app.use('/api/news', newsRouter);
app.use('/api/subscription', subscriptionRouter);
app.use('/api/trainer', trainerRouter);
app.use('/api/cardio', cardioRouter);
app.use('/api/support', supportRouter);
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

// Cleanup expired/revoked refresh tokens every 6 hours
setInterval(async () => {
  try {
    const { count } = await (await import('./db')).prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revoked: true, createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }] },
    });
    if (count > 0) logger.info(`[Cleanup] Deleted ${count} expired/revoked refresh tokens`);
  } catch {}
}, 6 * 60 * 60 * 1000);

app.listen(PORT, () => {
  logger.info(`Iron Gym API server running on port ${PORT}`);
  startNewsRefreshScheduler();
});

export default app;
