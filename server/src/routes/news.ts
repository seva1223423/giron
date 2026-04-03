import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { refreshNews } from '../services/newsRefreshService';

const router = Router();
const prisma = new PrismaClient();

// Get news feed
router.get('/', async (req, res: Response) => {
  try {
    const { category, limit = '20', offset = '0' } = req.query;

    const where = category
      ? { categories: { has: category as string } }
      : {};

    const articles = await prisma.newsArticle.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    res.json(articles);
  } catch (e) {
    console.error(e);
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
    console.error(e);
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
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения сохранённых' });
  }
});

// Manual news refresh (force fetch from RSS)
router.post('/refresh', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await refreshNews(true);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка обновления новостей' });
  }
});

export { router as newsRouter };
