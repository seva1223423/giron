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
import { sendErrorToTelegram, lookupCachedError } from '../services/telegramLogger';
import { createIssueFromError } from '../services/githubIssueCreator';
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

// ─── Telegram webhook (button clicks → GitHub issues) ─────────────────────

/**
 * POST /api/telegram/webhook — receives Telegram bot updates including
 * callback_query events from the "🔧 Fix it" inline button on each
 * error message. On a `fix:<errorId>` callback:
 *   1. Look up the cached error context (in-memory in telegramLogger)
 *   2. Create a GitHub issue with full context (message + stack + tags)
 *   3. Reply in Telegram with the issue URL
 *
 * Security:
 *   - Telegram supports a secret_token validated via X-Telegram-Bot-Api-
 *     Secret-Token header. We require TELEGRAM_WEBHOOK_SECRET in env;
 *     missing secret = endpoint returns 401 (refuse all traffic). This
 *     prevents anyone who knows the URL from spoofing callback events.
 *
 * Setup AFTER deploy (one-time):
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d "url=https://iron-gym-swoe.onrender.com/api/telegram/webhook" \
 *     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 */
router.post('/telegram/webhook', async (req: Request, res: Response) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const gotSecret = req.header('X-Telegram-Bot-Api-Secret-Token');
  if (!expectedSecret || gotSecret !== expectedSecret) {
    return res.sendStatus(401);
  }

  try {
    const update = req.body as any;

    // Telegram callback_query — fires when user taps an inline button.
    if (update?.callback_query) {
      const cb = update.callback_query;
      const data: string | undefined = cb.data;
      const chatId = cb.message?.chat?.id;

      if (data?.startsWith('fix:') && chatId) {
        const errorId = data.slice(4);
        const cached = lookupCachedError(errorId);

        // Always answer the callback so the loading spinner stops.
        const token = process.env.TELEGRAM_BOT_TOKEN!;
        fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: cb.id, text: 'Работаю…' }),
        }).catch(() => {});

        if (!cached) {
          fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '⏳ Ошибка устарела — её контекст уже выпал из кэша. Дождись новой.',
            }),
          }).catch(() => {});
          return res.json({ ok: true });
        }

        // Create the issue. Fire-and-await so the reply has the link.
        const issue = await createIssueFromError(cached);
        const replyText = issue
          ? `✅ GitHub Issue #${issue.number} создан\n${issue.html_url}\n\nЧтобы починить — напиши Claude:\n\`почини issue #${issue.number}\``
          : '❌ Не удалось создать issue. Проверь что GITHUB_TOKEN и GITHUB_REPO заданы в Render env.';

        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            disable_web_page_preview: false,
          }),
        }).catch(() => {});
      }
    }

    res.json({ ok: true });
  } catch (e) {
    logger.error('POST /telegram/webhook:', e);
    res.status(500).json({ ok: false });
  }
});

export { router as loggingRouter };
