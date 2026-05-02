import { prisma } from '../db';
import { logger } from '../utils/logger';

let lastRefreshAt = 0;
let isRefreshing = false; // mutex: prevent concurrent refreshes
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// RSS sources: Russian fitness/sport news.
//
// Previous URLs (championat /lifestyle/, sport.rbc.ru/rss, rsport.ria.ru/*)
// all returned 404 — verified in prod logs. These endpoints were silently
// deprecated by the publishers some time before 2026-04. Replaced with the
// current working feeds, probed on 2026-04-21.
const RSS_SOURCES = [
  {
    url: 'https://www.championat.com/rss/news/',
    category: 'sport',
    source: 'Чемпионат',
    categories: ['sport', 'russian'],
  },
  {
    url: 'https://www.sports.ru/rss/main.xml',
    category: 'sport',
    source: 'Sports.ru',
    categories: ['sport', 'russian'],
  },
  {
    url: 'https://lenta.ru/rss/news/sport',
    category: 'sport',
    source: 'Lenta.ru Спорт',
    categories: ['sport', 'russian'],
  },
  {
    url: 'https://tass.ru/rss/v2.xml?sections=MjA%3D',
    category: 'sport',
    source: 'ТАСС Спорт',
    categories: ['sport', 'russian'],
  },
];

// Additional category detection from title/summary text
const CATEGORY_KEYWORDS: { pattern: RegExp; category: string }[] = [
  { pattern: /пауэрлифт|присед|становая|жим|троеборье/i, category: 'powerlifting' },
  { pattern: /рекорд|рекордн/i, category: 'records' },
  { pattern: /чемпионат|турнир|соревнован/i, category: 'championships' },
  { pattern: /россия|российск|сборн|РФ/i, category: 'russian' },
];

function extractTagContent(xml: string, tag: string): string {
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i').exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();
  const plainMatch = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  if (plainMatch) return plainMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
  return '';
}

function parseRssItems(xml: string): Array<{ title: string; summary: string; link: string; pubDate: string }> {
  const items: Array<{ title: string; summary: string; link: string; pubDate: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < 50) {
    const itemXml = match[1];
    const title = extractTagContent(itemXml, 'title');
    const description = extractTagContent(itemXml, 'description');
    const link = extractTagContent(itemXml, 'link');
    const pubDate = extractTagContent(itemXml, 'pubDate');

    // Strip HTML tags from description
    const summary = description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);

    if (title && title.length > 5) {
      items.push({ title, summary: summary || title, link, pubDate });
    }
  }

  return items;
}

function detectCategories(text: string, baseCategories: string[]): string[] {
  const cats = new Set(baseCategories);
  CATEGORY_KEYWORDS.forEach(({ pattern, category }) => {
    if (pattern.test(text)) cats.add(category);
  });
  return Array.from(cats);
}

async function fetchRssFeed(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IronGymBot/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  // Round 256: enforce a 5MB body cap. Without this, a hostile or
  // misbehaving RSS source could return hundreds of MB of XML and the
  // downstream regex parser would either exhaust memory or trigger
  // catastrophic backtracking on the `[\s\S]*?` patterns. 5MB covers
  // 99% of legitimate RSS feeds (Google News, ТАСС max ~500KB).
  const text = await response.text();
  const MAX_RSS_BYTES = 5 * 1024 * 1024;
  if (text.length > MAX_RSS_BYTES) {
    throw new Error(`RSS body too large: ${text.length} bytes from ${url} (max ${MAX_RSS_BYTES})`);
  }
  return text;
}

export async function refreshNews(force = false): Promise<{ added: number; skipped: number }> {
  if (isRefreshing) return { added: 0, skipped: -1 }; // already running
  const now = Date.now();
  if (!force && now - lastRefreshAt < REFRESH_INTERVAL_MS) {
    return { added: 0, skipped: -1 }; // too soon
  }

  isRefreshing = true;
  let added = 0;
  let skipped = 0;

  try {
    for (const source of RSS_SOURCES) {
      try {
        const xml = await fetchRssFeed(source.url);
        const items = parseRssItems(xml);

        for (const item of items.slice(0, 10)) {
          const categories = detectCategories(item.title + ' ' + item.summary, source.categories);
          const parsedDate = item.pubDate ? new Date(item.pubDate) : null;
          const publishedAt = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : new Date();

          // Use title as deduplication key
          const existing = await prisma.newsArticle.findFirst({
            where: { title: item.title },
            select: { id: true },
          });

          if (existing) {
            skipped++;
            continue;
          }

          await prisma.newsArticle.create({
            data: {
              title: item.title,
              summary: item.summary || item.title,
              content: item.link ? `Источник: ${item.link}` : item.summary,
              categories,
              publishedAt,
            },
          });
          added++;
        }
      } catch (err) {
        logger.warn(`[NewsRefresh] Failed to fetch ${source.url}:`, (err as Error).message);
      }
    }

    lastRefreshAt = Date.now();
    logger.info(`[NewsRefresh] Done: +${added} new, ${skipped} existing`);
    return { added, skipped };
  } finally {
    isRefreshing = false;
  }
}

// Run every 6 hours
export function startNewsRefreshScheduler(): void {
  // Lazy import — keeps the module load order clean and avoids a circular
  // import path through utils → services → utils.
  const { trackCron } = require('../utils/cronHealth');

  // Initial refresh after 5s startup delay (non-blocking). The setTimeout
  // doesn't need .unref() because it's a one-shot fire and clears itself.
  setTimeout(() => {
    trackCron('news-refresh', () =>
      refreshNews().catch((e: Error) =>
        logger.warn('[NewsRefresh] Initial refresh failed:', e.message),
      ),
    ).catch(() => { /* trackCron only rethrows; we already swallow the news error */ });
  }, 5000);

  // .unref() so the timer doesn't keep the Node process alive in tests
  // that import this module (e.g. via the index.ts app for supertest).
  setInterval(() => {
    trackCron('news-refresh', () =>
      refreshNews().catch((e: Error) =>
        logger.warn('[NewsRefresh] Scheduled refresh failed:', e.message),
      ),
    ).catch(() => { /* see above */ });
  }, REFRESH_INTERVAL_MS).unref();
}
