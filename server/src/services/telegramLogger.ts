/**
 * Telegram error logger — drop-in alternative to Sentry for solo-dev /
 * single-admin deployments. Activates when `TELEGRAM_BOT_TOKEN` and
 * `TELEGRAM_CHAT_ID` are set in env; otherwise no-op.
 *
 * Why:
 *   - Sentry blocks Russian IPs at the edge (sanctions, 2022+)
 *   - For a single user (the admin) Telegram dashboard IS the dashboard
 *   - Real-time push to phone within seconds of a crash
 *   - Zero infrastructure: bot is free, no service to host
 *
 * Trade-offs vs Sentry:
 *   - No grouping UI — one message per unique error per cooldown window
 *   - No retention policy beyond Telegram's natural chat history
 *   - No release / cohort tagging
 *   - No performance monitoring
 *
 * Rate limit:
 *   - Each unique error (hashed by message + first stack frame) gets
 *     one Telegram message per 60-second window
 *   - Without this a tight crash loop would spam your chat
 *   - In-memory; resets on dyno restart
 *
 * Fire-and-forget: every call returns immediately, the HTTP POST runs
 * in the background. A network blip to Telegram must never break the
 * caller's flow.
 */
import { logger } from '../utils/logger';

const COOLDOWN_MS = 60_000;
const MAX_TELEGRAM_MESSAGE = 4000;
const lastSent = new Map<string, number>();

function hashKey(message: string, firstFrame: string): string {
  // Cheap deterministic key — first 80 chars of message + first stack frame.
  return (message.slice(0, 80) + '|' + firstFrame.slice(0, 80)).toLowerCase();
}

function escapeMarkdown(s: string): string {
  // MarkdownV2 reserved chars per Telegram docs.
  return s.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function getCreds(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  return { token, chatId };
}

/**
 * Send an error to Telegram. No-op when env vars are missing.
 * Always fire-and-forget; never throws.
 */
export function sendErrorToTelegram(
  err: unknown,
  context: { route?: string; userId?: string; source?: 'server' | 'client'; tags?: Record<string, string> } = {},
): void {
  const creds = getCreds();
  if (!creds) return;

  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  const message = e.message || 'Unknown error';
  const stack = e.stack ?? '';
  const firstFrame = stack.split('\n')[1]?.trim() ?? '';

  // Dedup
  const key = hashKey(message, firstFrame);
  const now = Date.now();
  const last = lastSent.get(key);
  if (last && now - last < COOLDOWN_MS) return;
  lastSent.set(key, now);

  // Cleanup old entries occasionally (5x cooldown = no longer rate-limited)
  if (lastSent.size > 500) {
    const cutoff = now - COOLDOWN_MS * 5;
    for (const [k, v] of lastSent) if (v < cutoff) lastSent.delete(k);
  }

  // Build message
  const source = context.source ?? 'server';
  const emoji = source === 'client' ? '📱' : '🖥️';
  const tagLines: string[] = [];
  if (context.route) tagLines.push(`route: \`${escapeMarkdown(context.route)}\``);
  if (context.userId) tagLines.push(`user: \`${escapeMarkdown(context.userId)}\``);
  if (context.tags) {
    for (const [k, v] of Object.entries(context.tags)) {
      tagLines.push(`${escapeMarkdown(k)}: \`${escapeMarkdown(String(v))}\``);
    }
  }
  const stackTrim = stack.split('\n').slice(0, 8).join('\n');

  const parts = [
    `${emoji} *${escapeMarkdown(source.toUpperCase())} ERROR*`,
    `\`${escapeMarkdown(message.slice(0, 300))}\``,
    tagLines.length > 0 ? tagLines.join('\n') : '',
    stackTrim ? '```\n' + stackTrim.slice(0, MAX_TELEGRAM_MESSAGE - 500) + '\n```' : '',
  ].filter(Boolean);
  const text = parts.join('\n\n').slice(0, MAX_TELEGRAM_MESSAGE);

  // Fire-and-forget POST
  fetch(`https://api.telegram.org/bot${creds.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: creds.chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    }),
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn('[telegram] sendMessage failed', { status: res.status, body: body.slice(0, 200) });
    }
  }).catch((e) => {
    logger.warn('[telegram] fetch failed', { error: String(e).slice(0, 200) });
  });
}

/** Health check — true when env vars are present. */
export function isTelegramLoggerActive(): boolean {
  return getCreds() !== null;
}
