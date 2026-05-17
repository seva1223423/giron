/**
 * Creates GitHub issues from cached Telegram error contexts.
 *
 * Activates when `GITHUB_TOKEN` (PAT with `Issues: write` permission
 * on `GITHUB_REPO`) and `GITHUB_REPO` (e.g. `seva1223423/giron`) are
 * set in env. Returns the issue URL + number on success, null
 * otherwise (no token, network fail, or 4xx/5xx from GitHub).
 *
 * The issue body is structured for Claude (or a human) to act on:
 * full message + stack + context tags + a hint that says exactly
 * what to paste in chat to trigger a fix.
 *
 * Token scope (fine-grained PAT, recommended):
 *   Repository access: just `seva1223423/giron`
 *   Permissions:
 *     - Issues: Read and write
 *     - Contents: Read-only (for the future Claude-action upgrade)
 *     - Metadata: Read-only (auto)
 *   Expiry: 90 days is reasonable
 */
import { logger } from '../utils/logger';
import type { CachedErrorContext } from './telegramLogger';

const MAX_BODY_LENGTH = 60_000; // GitHub issue body limit is ~65,536

export interface CreatedIssue {
  number: number;
  html_url: string;
}

function buildIssueBody(err: CachedErrorContext): string {
  const tagLines = err.tags
    ? Object.entries(err.tags).map(([k, v]) => `- ${k}: \`${v}\``).join('\n')
    : '';

  const sourceEmoji = err.source === 'client' ? '📱' : '🖥️';
  const isoTime = new Date(err.createdAt).toISOString();

  return `**Auto-created from Telegram error logger** ${sourceEmoji}

## Error

\`\`\`
${err.message}
\`\`\`

## Context

- **Source:** \`${err.source}\` ${err.source === 'client' ? '(mobile app crash)' : '(server-side error)'}
- **Route / Screen:** \`${err.route ?? '—'}\`
- **User ID:** \`${err.userId ?? '—'}\`
- **Time (UTC):** \`${isoTime}\`
${tagLines ? '\n### Tags\n\n' + tagLines : ''}

## Stack trace

\`\`\`
${err.stack || '(no stack)'}
\`\`\`

---

**How to fix:**

1. Paste this in your Claude chat: \`почини issue #N\` (replace N with this issue number)
2. Claude reads the full context above, investigates the codebase, writes a test that reproduces the bug, fixes it, opens a PR
3. You review the PR + merge

**Or trigger automatically:** add the \`claude-fix\` label (requires \`anthropics/claude-code-action\` workflow setup).
`.slice(0, MAX_BODY_LENGTH);
}

export async function createIssueFromError(err: CachedErrorContext): Promise<CreatedIssue | null> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // e.g. "seva1223423/giron"
  if (!token || !repo) {
    logger.warn('[github] createIssueFromError skipped — GITHUB_TOKEN or GITHUB_REPO missing');
    return null;
  }

  const title = `[auto/${err.source}] ${err.message.slice(0, 100)}`;
  const labels = ['auto-logged', err.source];

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'giron-telegram-bot/1.0',
      },
      body: JSON.stringify({ title, body: buildIssueBody(err), labels }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn('[github] createIssueFromError failed', { status: res.status, body: body.slice(0, 300) });
      return null;
    }
    const data = await res.json() as { number?: number; html_url?: string };
    if (typeof data.number !== 'number' || !data.html_url) return null;
    return { number: data.number, html_url: data.html_url };
  } catch (e) {
    logger.warn('[github] createIssueFromError network error', { error: String(e).slice(0, 200) });
    return null;
  }
}
