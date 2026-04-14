import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { refreshNews } from '../services/newsRefreshService';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

// Get news feed
router.get('/', async (req, res: Response) => {
  try {
    const { category, limit = '20', offset = '0' } = req.query;

    // Validate category length to prevent oversized query strings
    if (category && (category as string).length > 100) {
      return res.status(400).json({ error: 'Некорректная категория' });
    }

    const where = category
      ? { categories: { has: category as string } }
      : {};

    const take = Math.min(Math.max(parseInt(limit as string) || 20, 1), 100);
    const skip = Math.min(Math.max(parseInt(offset as string) || 0, 0), 10000);

    const articles = await prisma.newsArticle.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take,
      skip,
    });

    res.json(articles);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения новостей' });
  }
});

// Save/unsave article
router.post('/:id/save', authenticate, async (req: AuthRequest, res: Response) => {
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
      await prisma.savedNews.delete({ where: { id: existing.id } });
      res.json({ saved: false });
    } else {
      await prisma.savedNews.create({
        data: { userId: req.userId!, articleId: id },
      });
      res.json({ saved: true });
    }
  } catch (e) {
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
    res.json({ success: true, ...result });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления новостей' });
  }
});

export { router as newsRouter };
