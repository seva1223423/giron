/**
 * Unit tests for services/newsRefreshService.refreshNews.
 *
 * The two pieces of logic unique to this module — and easiest to break
 * with a lazy refactor — are:
 *
 *   1. The 6h cooldown gate (REFRESH_INTERVAL_MS). force=false skips
 *      the work entirely if last refresh was <6h ago. Without this
 *      the cron + a manual /admin/refresh-news click can DOS the
 *      upstream RSS feeds and burn DB writes.
 *   2. The isRefreshing mutex. Two concurrent calls (cron + manual)
 *      must not race. Second caller returns {added: 0, skipped: -1}
 *      without doing any work.
 *
 * Plus the per-item flow: dedup-by-title, category detection from
 * keywords, fault-isolation per source (one bad feed doesn't kill
 * the whole sweep).
 *
 * Module-level state (lastRefreshAt, isRefreshing) means we use
 * jest.isolateModulesAsync per test so each scenario starts fresh.
 */

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss>
  <channel>
    <item>
      <title>Российский пауэрлифтер установил рекорд</title>
      <description>Спортсмен из России поднял 350кг в становой тяге.</description>
      <link>https://example.com/article-1</link>
      <pubDate>Wed, 01 May 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Чемпионат мира по штанге 2026</title>
      <description>Турнир пройдёт в Москве в августе.</description>
      <link>https://example.com/article-2</link>
      <pubDate>Wed, 01 May 2026 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

beforeEach(() => {
  jest.resetModules();
});

// ── Cooldown gate ───────────────────────────────────────────────────────────

describe('refreshNews — 6h cooldown', () => {
  test('first call (lastRefreshAt=0) goes through and writes articles', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_RSS,
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'a-1' });

    let result: { added: number; skipped: number } | undefined;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../db', () => ({
        prisma: { newsArticle: { findFirst, create } },
      }));
      jest.doMock('../utils/logger', () => ({
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      }));
      const { refreshNews } = require('../services/newsRefreshService');
      result = await refreshNews();
    });

    expect(result?.skipped).not.toBe(-1); // -1 means "skipped due to mutex/cooldown"
    expect(create).toHaveBeenCalled();
  });

  test('second call within 6h with force=false returns {added:0, skipped:-1}', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_RSS,
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'a-1' });

    let secondResult: { added: number; skipped: number } | undefined;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../db', () => ({
        prisma: { newsArticle: { findFirst, create } },
      }));
      jest.doMock('../utils/logger', () => ({
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      }));
      const { refreshNews } = require('../services/newsRefreshService');
      await refreshNews();              // first run — sets lastRefreshAt
      const fetchCallsAfterFirst = fetchMock.mock.calls.length;
      secondResult = await refreshNews(); // second run — should be gated
      // Mutex/cooldown ⇒ no further fetch happens.
      expect(fetchMock.mock.calls.length).toBe(fetchCallsAfterFirst);
    });

    expect(secondResult).toEqual({ added: 0, skipped: -1 });
  });

  test('second call within 6h with force=true bypasses cooldown', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_RSS,
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'a-1' });

    let secondResult: { added: number; skipped: number } | undefined;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../db', () => ({
        prisma: { newsArticle: { findFirst, create } },
      }));
      jest.doMock('../utils/logger', () => ({
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      }));
      const { refreshNews } = require('../services/newsRefreshService');
      await refreshNews();
      secondResult = await refreshNews(true); // force=true
    });

    // force=true should produce a real result (not the {0,-1} sentinel).
    expect(secondResult?.skipped).not.toBe(-1);
  });
});

// ── Per-item flow ──────────────────────────────────────────────────────────

describe('refreshNews — per-item flow', () => {
  test('dedupes by title — existing article is skipped, not re-created', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_RSS,
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const findFirst = jest.fn().mockImplementation(async ({ where }: { where: { title: string } }) => {
      if (where.title.includes('Чемпионат')) return { id: 'existing-1' };
      return null;
    });
    const create = jest.fn().mockResolvedValue({ id: 'a-1' });

    let result: { added: number; skipped: number } | undefined;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../db', () => ({
        prisma: { newsArticle: { findFirst, create } },
      }));
      jest.doMock('../utils/logger', () => ({
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      }));
      const { refreshNews } = require('../services/newsRefreshService');
      result = await refreshNews();
    });

    // 4 sources × 2 items each = 8 total. With one duplicate per source
    // we expect added < total, skipped > 0.
    expect(result?.added).toBeGreaterThan(0);
    expect(result?.skipped).toBeGreaterThan(0);
  });

  test('detects category keywords from title (powerlifting, championships)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_RSS,
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'a-1' });

    await jest.isolateModulesAsync(async () => {
      jest.doMock('../db', () => ({
        prisma: { newsArticle: { findFirst, create } },
      }));
      jest.doMock('../utils/logger', () => ({
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      }));
      const { refreshNews } = require('../services/newsRefreshService');
      await refreshNews();
    });

    // The "пауэрлифтер" / "рекорд" article should pick up the
    // 'powerlifting' + 'records' categories on top of the source's
    // base ['sport', 'russian'] tags.
    const calls = create.mock.calls.map((c) => c[0].data);
    const powerlifterCall = calls.find((d: { title: string }) =>
      d.title.includes('пауэрлифтер'),
    );
    expect(powerlifterCall).toBeDefined();
    expect(powerlifterCall.categories).toEqual(
      expect.arrayContaining(['sport', 'russian', 'powerlifting', 'records']),
    );

    const championatCall = calls.find((d: { title: string }) =>
      d.title.includes('Чемпионат'),
    );
    expect(championatCall).toBeDefined();
    expect(championatCall.categories).toEqual(
      expect.arrayContaining(['sport', 'russian', 'championships']),
    );
  });

  test('drops items with missing/invalid pubDate (was: fallback to now)', async () => {
    // Use a fitness-relevant title so the item passes the relevance gate
    // and the ONLY reason it would be dropped is the missing pubDate.
    const noDateRss = `<?xml version="1.0"?><rss><channel>
      <item>
        <title>Тренировка пресса без даты</title>
        <description>Тренировка для подтянутого пресса.</description>
        <link>https://example.com/x</link>
      </item>
    </channel></rss>`;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => noDateRss,
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'a-1' });
    const warn = jest.fn();

    await jest.isolateModulesAsync(async () => {
      jest.doMock('../db', () => ({
        prisma: { newsArticle: { findFirst, create } },
      }));
      jest.doMock('../utils/logger', () => ({
        logger: { info: jest.fn(), warn, error: jest.fn() },
      }));
      const { refreshNews } = require('../services/newsRefreshService');
      await refreshNews();
    });

    // Item with no pubDate is now dropped, not stamped with `now()`. The
    // earlier behavior caused every untagged article to surface as
    // 'Сейчас' on the client (formatArticleDate returns 'Сейчас' for
    // <1h ago) — a misleading fresh-news indicator for old content.
    expect(create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Dropping item without parseable pubDate/),
    );
  });

  test('drops items that do not match the fitness-relevance whitelist', async () => {
    // Article title is general-sport (NBA / theatrical) — not fitness.
    // Should be dropped at ingest before the dedup step.
    const offTopicRss = `<?xml version="1.0"?><rss><channel>
      <item>
        <title>Блейзеры обыграли Мэджик в драматичной концовке</title>
        <description>Команда из Орегона победила со счётом 110:108.</description>
        <link>https://example.com/nba</link>
        <pubDate>Wed, 01 May 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>`;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => offTopicRss,
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'a-1' });

    await jest.isolateModulesAsync(async () => {
      jest.doMock('../db', () => ({
        prisma: { newsArticle: { findFirst, create } },
      }));
      jest.doMock('../utils/logger', () => ({
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      }));
      const { refreshNews } = require('../services/newsRefreshService');
      await refreshNews();
    });

    expect(create).not.toHaveBeenCalled();
  });
});

// ── Fault isolation ────────────────────────────────────────────────────────

describe('refreshNews — fault isolation per source', () => {
  test('one source returning HTTP 500 does NOT abort the sweep — other sources run', async () => {
    let callIdx = 0;
    const fetchMock = jest.fn().mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        return { ok: false, status: 500, text: async () => '<error/>' };
      }
      return { ok: true, text: async () => SAMPLE_RSS };
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'a-1' });
    const warn = jest.fn();

    let result: { added: number; skipped: number } | undefined;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../db', () => ({
        prisma: { newsArticle: { findFirst, create } },
      }));
      jest.doMock('../utils/logger', () => ({
        logger: { info: jest.fn(), warn, error: jest.fn() },
      }));
      const { refreshNews } = require('../services/newsRefreshService');
      result = await refreshNews();
    });

    // Failed source warned; remaining 3 sources still produced articles.
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/\[NewsRefresh\] Failed to fetch/),
      expect.any(String),
    );
    expect(result?.added).toBeGreaterThan(0);
  });

  test('5MB RSS body cap rejects oversized responses without parsing', async () => {
    const huge = 'x'.repeat(6 * 1024 * 1024);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => huge,
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'a-1' });
    const warn = jest.fn();

    await jest.isolateModulesAsync(async () => {
      jest.doMock('../db', () => ({
        prisma: { newsArticle: { findFirst, create } },
      }));
      jest.doMock('../utils/logger', () => ({
        logger: { info: jest.fn(), warn, error: jest.fn() },
      }));
      const { refreshNews } = require('../services/newsRefreshService');
      await refreshNews();
    });

    // No articles parsed/created — the size cap rejected the body.
    expect(create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/\[NewsRefresh\] Failed to fetch/),
      expect.stringMatching(/RSS body too large/),
    );
  });
});
