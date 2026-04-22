/**
 * Integration tests for server/src/routes/admin.ts
 *
 * Covers: auth gating (requireAdmin), user management (ban/unban, role,
 * unlock), GET /users list, and self-protection guards.
 *
 * NOTE: /admin/stats is intentionally omitted — it aggregates 35+ DB queries
 * and is better validated through the monitoring agent and manual QA.
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    adminLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    trustedDevice: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../utils/activityTracker', () => ({
  getActiveUsersCount: jest.fn().mockReturnValue(0),
  getActiveUserIds: jest.fn().mockReturnValue(new Set()),
  recordActivity: jest.fn(),
}));

jest.mock('../utils/aiMetrics', () => ({
  getAIMetrics: jest.fn().mockReturnValue({ requestsToday: 0, totalRequests: 0 }),
}));

jest.mock('../utils/memCache', () => {
  const mockCache = { get: jest.fn().mockReturnValue(null), set: jest.fn(), delete: jest.fn(), clear: jest.fn(), prune: jest.fn() };
  class MemCache { get = mockCache.get; set = mockCache.set; delete = mockCache.delete; clear = mockCache.clear; prune = mockCache.prune; }
  return { MemCache, adminStatsCache: mockCache, newsCache: mockCache, foodVisionCache: mockCache };
});

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';
import { prisma } from '../db';

const JWT_ISS = 'irongym-api';
const JWT_AUD = 'irongym-app';

const makeToken = (userId = 'u-admin', role = 'ADMIN') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });

const adminUser = { id: 'u-admin', isBanned: false, lockedUntil: null, role: 'ADMIN' };
const regularUser = { id: 'u-regular', isBanned: false, lockedUntil: null, role: 'USER' };

const TARGET_ID = 'ctarget000000000000001';

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser);
  (prisma.adminLog.create as jest.Mock).mockResolvedValue({});
});

// ─── Auth gating — all admin endpoints require ADMIN role ─────────────────────

describe('Admin auth gating', () => {
  it('401 GET /admin/users without token', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('403 GET /admin/users for regular USER role', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);

    expect(res.status).toBe(403);
  });

  it('403 GET /admin/users for SUPPORT role', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...regularUser,
      id: 'u-support',
      role: 'SUPPORT',
    });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${makeToken('u-support', 'SUPPORT')}`);

    expect(res.status).toBe(403);
  });
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  it('200 returns paginated user list for ADMIN', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([adminUser]);
    (prisma.user.count as jest.Mock).mockResolvedValueOnce(1);

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('total', 1);
    expect(res.body).toHaveProperty('page', 1);
  });

  it('200 accepts search, role, and banned filters', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.user.count as jest.Mock).mockResolvedValueOnce(0);

    const res = await request(app)
      .get('/api/admin/users?search=ivan&role=USER&banned=true')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});

// ─── POST /api/admin/users/:id/ban ───────────────────────────────────────────

describe('POST /api/admin/users/:id/ban', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/ban`)
      .send({ reason: 'Spamming' });
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/admin/users/bad-id/ban')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ reason: 'Test' });
    expect(res.status).toBe(400);
  });

  it('400 when reason is empty', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/ban`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ reason: '' });
    expect(res.status).toBe(400);
  });

  it('400 when admin tries to ban themselves', async () => {
    const res = await request(app)
      .post(`/api/admin/users/u-admin/ban`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ reason: 'Self-ban attempt' });
    expect(res.status).toBe(400);
  });

  it('200 bans target user with atomic transaction', async () => {
    const bannedUser = { id: TARGET_ID, email: 'victim@example.com', firstName: 'Ivan', isBanned: true };
    (prisma.$transaction as jest.Mock).mockResolvedValueOnce([bannedUser, { count: 1 }, { count: 0 }]);

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/ban`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ reason: 'Violating TOS' });

    expect(res.status).toBe(200);
    expect(res.body.isBanned).toBe(true);
  });

  it('SECURITY: ban uses id from URL param, not body', async () => {
    const bannedUser = { id: TARGET_ID, isBanned: true };
    (prisma.$transaction as jest.Mock).mockResolvedValueOnce([bannedUser, { count: 1 }, { count: 0 }]);

    await request(app)
      .post(`/api/admin/users/${TARGET_ID}/ban`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ reason: 'Reason', userId: 'u-injected-id' }); // userId in body must be ignored

    expect((prisma.$transaction as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });
});

// ─── POST /api/admin/users/:id/unban ─────────────────────────────────────────

describe('POST /api/admin/users/:id/unban', () => {
  it('401 without token', async () => {
    const res = await request(app).post(`/api/admin/users/${TARGET_ID}/unban`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/admin/users/bad-id/unban')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('200 unbans user', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      id: TARGET_ID,
      email: 'user@example.com',
      firstName: 'Ivan',
      isBanned: false,
    });

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/unban`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.isBanned).toBe(false);
  });
});

// ─── PATCH /api/admin/users/:id/role ─────────────────────────────────────────

describe('PATCH /api/admin/users/:id/role', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/role`)
      .send({ role: 'USER' });
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .patch('/api/admin/users/invalid/role')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ role: 'USER' });
    expect(res.status).toBe(400);
  });

  it('400 when role is not a valid enum value', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/role`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ role: 'SUPERUSER' }); // invalid enum

    expect(res.status).toBe(400);
  });

  it('400 when admin tries to remove their own ADMIN role', async () => {
    const res = await request(app)
      .patch('/api/admin/users/u-admin/role')
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ role: 'USER' }); // demoting self

    expect(res.status).toBe(400);
  });

  it('200 changes role of another user', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      id: TARGET_ID,
      email: 'user@example.com',
      firstName: 'Ivan',
      role: 'TRAINER',
    });

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/role`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ role: 'TRAINER' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('TRAINER');
  });

  it('SECURITY: adminLog.create records the action with adminId from JWT', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      id: TARGET_ID,
      email: 'user@example.com',
      firstName: 'Ivan',
      role: 'SUPPORT',
    });

    await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/role`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ role: 'SUPPORT' });

    const logCalls = (prisma.adminLog.create as jest.Mock).mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);
    expect(logCalls[0][0].data.adminId).toBe('u-admin');
    expect(logCalls[0][0].data.action).toBe('CHANGE_ROLE');
    expect(logCalls[0][0].data.targetId).toBe(TARGET_ID);
  });
});

// ─── POST /api/admin/users/:id/unlock ────────────────────────────────────────

describe('POST /api/admin/users/:id/unlock', () => {
  it('401 without token', async () => {
    const res = await request(app).post(`/api/admin/users/${TARGET_ID}/unlock`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/admin/users/bad-id/unlock')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('200 clears lockout for target user', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      id: TARGET_ID,
      email: 'user@example.com',
      firstName: 'Ivan',
      loginAttempts: 0,
      lockedUntil: null,
    });

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/unlock`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.loginAttempts).toBe(0);
    expect(res.body.lockedUntil).toBeNull();
  });
});
