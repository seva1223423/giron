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
import { startNewsRefreshScheduler } from './services/newsRefreshService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Iron Gym API server running on port ${PORT}`);
  startNewsRefreshScheduler();
});

export default app;
