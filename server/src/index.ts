import express from 'express';
import cors from 'cors';
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
app.use(cors());
// Capture raw body for webhook signature verification via verify callback
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { (req as any).rawBody = buf.toString(); },
}));

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/workouts', workoutRouter);
app.use('/api/nutrition', nutritionRouter);
app.use('/api/ai', aiRouter);
app.use('/api/news', newsRouter);
app.use('/api/subscription', subscriptionRouter);
app.use('/api/trainer', trainerRouter);
app.use('/api/cardio', cardioRouter);
app.use('/api/support', supportRouter);
app.use('/api/admin', adminRouter);

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

app.listen(PORT, () => {
  logger.info(`Iron Gym API server running on port ${PORT}`);
  startNewsRefreshScheduler();
});

export default app;
