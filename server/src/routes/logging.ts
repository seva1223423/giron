/**
 * Client-error logging endpoint — forwards mobile-app crashes to
 * the same Telegram bot as server errors. Lets the founder see
 * runtime issues from his own phone without installing Sentry on
 * the client (which is blocked in RU anyway).
 *
 * Security:
 *   - Optional auth: if Authorization header is present, we use the
 *     authenticated userId for context. If not (e.g. crash happened
 *     before login completed), we accept anyway — rather lose user
 *     attribution than miss the crash.
 *   - Body capped at 10kb via the global limit; stack trace truncated
 *     server-side before forwarding to Telegram (which has its own
 *     4kb message cap).
 *   - Rate-limited: 30 errors/hour per IP. A buggy client in a tight
 *     loop won't drain the Telegram quota.
 */
import { Router, Response, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { sendErrorToTelegram } from '../services/telegramLogger';
import { logger } from '../utils/logger';

const router = Router();

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  route: z.string().max(200).optional(),
  appVersion: z.string().max(20).optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/log-client-error', limiter, async (req: Request, res: Response) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body' });
    }
    const { message, stack, route, appVersion, platform } = parsed.data;

    // Best-effort userId extraction. If the JWT is invalid or absent,
    // we still forward the crash — just without user attribution.
    let userId: string | undefined;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET!, {
          issuer: 'giron-api',
          audience: 'giron-app',
        }) as { userId?: string };
        userId = decoded.userId;
      } catch { /* unauth — proceed without userId */ }
    }

    const err = new Error(message);
    if (stack) err.stack = stack;
    sendErrorToTelegram(err, {
      route,
      userId,
      source: 'client',
      tags: {
        ...(appVersion ? { v: appVersion } : {}),
        ...(platform ? { plat: platform } : {}),
      },
    });

    res.json({ ok: true });
  } catch (e) {
    logger.error('POST /log-client-error:', e);
    res.status(500).json({ error: 'Не удалось залогировать' });
  }
});

export { router as loggingRouter };
