import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { refreshNews } from '../services/newsRefreshService';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { newsCache } from '../utils/memCache';

const router = Router();

/** CUID v1 format: starts with 'c', ~25 chars, alphanumeric */
const CUID_RE = /^c[a-z0-9]{20,30}$/;
const isValidId = (id: string | string[]) => CUID_RE.test(String(id));

// Get news feed (cached 5 minutes per category/page combination)
router.get('/', async (req, res: Response) => {
  try {
    const { category, limit = '20', offset = '0' } = req.query;

    // Validate category length to prevent oversized query strings
    if (category && (category as string).length > 100) {
      return res.status(400).json({ error: 'Некорректная категория' });
    }

    const take = Math.min(Math.max(parseInt(limit as string, 10) || 20, 1), 100);
    const skip = Math.min(Math.max(parseInt(offset as string, 10) || 0, 0), 10000);

    const cacheKey = `news:${category ?? 'all'}:${take}:${skip}`;
    const cached = newsCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const where = category
      ? { categories: { has: category as string } }
      : {};

    const articles = await prisma.newsArticle.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take,
      skip,
    });

    newsCache.set(cacheKey, articles, 5 * 60 * 1000); // 5 minutes
    res.setHeader('X-Cache', 'MISS');
    res.json(articles);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения новостей' });
  }
});

// Save/unsave article
router.post('/:id/save', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const id = req.params.id as string;

    const existing = await prisma.savedNews.findUnique({
      where: {
        userId_articleId: {
          userId: req.userId!,
          articleId: id,
        },
      },
    });

    if (existing) {
      try {
        await prisma.savedNews.delete({ where: { id: existing.id } });
      } catch (e: any) {
        // P2025: concurrent delete already removed it — treat as success
        if (e?.code !== 'P2025') throw e;
      }
      res.json({ saved: false });
    } else {
      try {
        await prisma.savedNews.create({
          data: { userId: req.userId!, articleId: id },
        });
      } catch (e: any) {
        // P2002: concurrent save already created it — treat as success
        // P2003: FK constraint — article does not exist
        if (e?.code === 'P2003') return res.status(404).json({ error: 'Статья не найдена' });
        if (e?.code !== 'P2002') throw e;
      }
      res.json({ saved: true });
    }
  } catch (e: any) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

// Get saved articles
router.get('/saved', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const saved = await prisma.savedNews.findMany({
      where: { userId: req.userId },
      include: { article: true },
      orderBy: { savedAt: 'desc' },
      take: 500,
    });
    res.json(saved.map((s) => s.article));
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения сохранённых' });
  }
});

// Manual news refresh (force fetch from RSS) — admin only
router.post('/refresh', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await refreshNews(true);
    // Round 84: drop the cache so the next GET /news doesn't keep serving
    // the stale 5-min-old list. Without this clear, the admin clicks
    // "refresh news" and watches the feed not change for up to 5 minutes
    // — exactly the opposite of what the button promises.
    if ((result?.added ?? 0) > 0) newsCache.clear();
    res.json({ success: true, ...result });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления новостей' });
  }
});

export { router as newsRouter };
