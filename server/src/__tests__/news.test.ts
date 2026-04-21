/**
 * Tests for the news routes: GET /, POST /:id/save, GET /saved, POST /refresh
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    newsArticle: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    savedNews: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    refreshToken: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    securityEvent: { create: jest.fn().mockResolvedValue({}) },
    otpCode: { findFirst: jest.fn().mockResolvedValue(null) },
    passwordResetToken: { findUnique: jest.fn().mockResolvedValue(null) },
    passwordHistory: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../services/emailService', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendOtpEmail: jest.fn(),
  sendNewLoginAlert: jest.fn(),
  sendPasswordChangedAlert: jest.fn(),
}));

jest.mock('../services/smsService', () => ({
  sendSmsOtp: jest.fn(),
  normalizePhone: jest.fn((p: string) => p),
}));

jest.mock('../services/pushService', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/newsRefreshService', () => ({
  startNewsRefreshScheduler: jest.fn(),
  refreshNews: jest.fn().mockResolvedValue({ articlesAdded: 5 }),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';
import { prisma } from '../db';

const mp = prisma as jest.Mocked<typeof prisma>;

const mockUser = { id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' };
const mockAdmin = { id: 'u-admin', isBanned: false, lockedUntil: null, role: 'ADMIN' };

const makeToken = (userId = 'u-test', role = 'USER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h', issuer: 'irongym-api', audience: 'irongym-app',
  });

const articleId = 'ctest12345678901234567';

const mockArticle = {
  id: articleId,
  title: 'Test Article',
  url: 'https://example.com/article',
  categories: ['fitness'],
  publishedAt: new Date(),
  source: 'Test Source',
};

function resetMocks() {
  jest.clearAllMocks();
  (mp.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
  (mp.newsArticle.findMany as jest.Mock).mockResolvedValue([]);
  (mp.savedNews.findUnique as jest.Mock).mockResolvedValue(null);
  (mp.savedNews.findMany as jest.Mock).mockResolvedValue([]);
  (mp.savedNews.create as jest.Mock).mockResolvedValue({});
  (mp.savedNews.delete as jest.Mock).mockResolvedValue({});
}

// ─── GET /api/news ─────────────────────────────────────────────────────────────

describe('GET /api/news', () => {
  beforeEach(resetMocks);

  it('returns articles without authentication', async () => {
    (mp.newsArticle.findMany as jest.Mock).mockResolvedValueOnce([mockArticle]);

    const res = await request(app).get('/api/news');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe(articleId);
  });

  it('respects take and skip params', async () => {
    await request(app).get('/api/news?limit=5&offset=10');

    const callArgs = (mp.newsArticle.findMany as jest.Mock).mock.calls[0]?.[0];
    if (callArgs) {
      expect(callArgs.take).toBe(5);
      expect(callArgs.skip).toBe(10);
    }
  });

  it('caps take at 100', async () => {
    await request(app).get('/api/news?limit=999');

    const callArgs = (mp.newsArticle.findMany as jest.Mock).mock.calls[0]?.[0];
    if (callArgs) {
      expect(callArgs.take).toBeLessThanOrEqual(100);
    }
  });

  it('caps skip at 10000', async () => {
    await request(app).get('/api/news?offset=99999');

    const callArgs = (mp.newsArticle.findMany as jest.Mock).mock.calls[0]?.[0];
    if (callArgs) {
      expect(callArgs.skip).toBeLessThanOrEqual(10000);
    }
  });

  it('rejects oversized category query string', async () => {
    const longCategory = 'a'.repeat(101);
    const res = await request(app).get(`/api/news?category=${longCategory}`);
    expect(res.status).toBe(400);
  });

  it('filters by category when provided', async () => {
    await request(app).get('/api/news?category=fitness');

    const callArgs = (mp.newsArticle.findMany as jest.Mock).mock.calls[0]?.[0];
    if (callArgs) {
      expect(callArgs.where).toEqual({ categories: { has: 'fitness' } });
    }
  });

  it('returns empty array when no articles', async () => {
    const res = await request(app).get('/api/news');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── POST /api/news/:id/save ───────────────────────────────────────────────────

describe('POST /api/news/:id/save', () => {
  beforeEach(resetMocks);

  it('401 without token', async () => {
    const res = await request(app).post(`/api/news/${articleId}/save`);
    expect(res.status).toBe(401);
  });

  it('400 for invalid ID format', async () => {
    const res = await request(app)
      .post('/api/news/invalid-id/save')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('saves an article (not yet saved)', async () => {
    (mp.savedNews.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (mp.savedNews.create as jest.Mock).mockResolvedValueOnce({ id: 'save-1' });

    const res = await request(app)
      .post(`/api/news/${articleId}/save`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
    expect(mp.savedNews.create).toHaveBeenCalledWith({
      data: { userId: 'u-test', articleId },
    });
  });

  it('unsaves an already-saved article', async () => {
    (mp.savedNews.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'save-1' });

    const res = await request(app)
      .post(`/api/news/${articleId}/save`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
    expect(mp.savedNews.delete).toHaveBeenCalledWith({ where: { id: 'save-1' } });
  });

  it('returns 404 when saving non-existent article (FK violation)', async () => {
    (mp.savedNews.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (mp.savedNews.create as jest.Mock).mockRejectedValueOnce({ code: 'P2003' });

    const res = await request(app)
      .post(`/api/news/${articleId}/save`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/не найдена/);
  });

  it('handles concurrent save (P2002) gracefully — returns saved:true', async () => {
    (mp.savedNews.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (mp.savedNews.create as jest.Mock).mockRejectedValueOnce({ code: 'P2002' });

    const res = await request(app)
      .post(`/api/news/${articleId}/save`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
  });

  it('handles concurrent delete (P2025) gracefully — returns saved:false', async () => {
    (mp.savedNews.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'save-1' });
    (mp.savedNews.delete as jest.Mock).mockRejectedValueOnce({ code: 'P2025' });

    const res = await request(app)
      .post(`/api/news/${articleId}/save`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
  });
});

// ─── GET /api/news/saved ───────────────────────────────────────────────────────

describe('GET /api/news/saved', () => {
  beforeEach(resetMocks);

  it('401 without token', async () => {
    const res = await request(app).get('/api/news/saved');
    expect(res.status).toBe(401);
  });

  it('returns saved articles for authenticated user', async () => {
    (mp.savedNews.findMany as jest.Mock).mockResolvedValueOnce([
      { article: mockArticle },
      { article: { ...mockArticle, id: 'ctestotherid1234567890' } },
    ]);

    const res = await request(app)
      .get('/api/news/saved')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(articleId);
  });

  it('returns empty array when nothing saved', async () => {
    const res = await request(app)
      .get('/api/news/saved')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('query scoped to requesting user only', async () => {
    await request(app)
      .get('/api/news/saved')
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const callArgs = (mp.savedNews.findMany as jest.Mock).mock.calls[0]?.[0];
    expect(callArgs?.where?.userId).toBe('u-test');
  });
});

// ─── POST /api/news/refresh (admin only) ──────────────────────────────────────

describe('POST /api/news/refresh', () => {
  beforeEach(resetMocks);

  it('401 without token', async () => {
    const res = await request(app).post('/api/news/refresh');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin user', async () => {
    const res = await request(app)
      .post('/api/news/refresh')
      .set('Authorization', `Bearer ${makeToken('u-test', 'USER')}`);

    expect(res.status).toBe(403);
  });

  it('200 for admin user', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(mockAdmin);
    const { refreshNews } = require('../services/newsRefreshService');
    refreshNews.mockResolvedValueOnce({ articlesAdded: 3 });

    const res = await request(app)
      .post('/api/news/refresh')
      .set('Authorization', `Bearer ${makeToken('u-admin', 'ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
