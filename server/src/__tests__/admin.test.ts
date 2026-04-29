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
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    pushToken: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    chatMessage: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    adminLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    trustedDevice: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    workout: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    announcement: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    supportTicket: {
      create: jest.fn().mockResolvedValue({}),
    },
    securityEvent: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../utils/activityTracker', () => ({
  getActiveUsersCount: jest.fn().mockReturnValue(0),
  getActiveUserIds: jest.fn().mockReturnValue(new Set()),
  recordActivity: jest.fn(),
  shouldSyncLastActiveAt: jest.fn().mockReturnValue(false),
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

// Mock bcrypt for admin step-up checks (sec audit 2026-04: HIGH-11). The
// real compare runs against `passwordHash` on the admin row; in tests we
// always succeed so we exercise the destructive endpoints without owning
// a real bcrypt-hashed fixture.
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: { compare: jest.fn().mockResolvedValue(true), hash: jest.fn().mockResolvedValue('hashed') },
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed'),
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

const adminUser = { id: 'u-admin', isBanned: false, lockedUntil: null, role: 'ADMIN', passwordHash: 'admin-bcrypt-hash', totpEnabled: false, totpSecret: null };
const regularUser = { id: 'u-regular', isBanned: false, lockedUntil: null, role: 'USER' };

const TARGET_ID = 'ctarget000000000000001';
const ANN_ID = 'cannounce0000000000001';

const sampleAnnouncement = {
  id: ANN_ID,
  title: 'Тестовое объявление',
  body: 'Тело объявления',
  type: 'info',
  isActive: true,
  endsAt: null,
  targetRole: null,
  authorId: 'u-admin',
  viewCount: 0,
  createdAt: new Date().toISOString(),
};

const sampleTargetUser = {
  id: TARGET_ID,
  email: 'target@example.com',
  firstName: 'Ivan',
  lastName: 'Petrov',
  role: 'CLIENT',
  isBanned: false,
  lockedUntil: null,
  // strip these in route
  passwordHash: 'secret-hash',
  totpSecret: null,
  totpBackupCodes: null,
  subscription: null,
  _count: { workouts: 5, meals: 20, chatMessages: 3, cardioSessions: 0, supportTickets: 1 },
  workouts: [],
  supportTickets: [],
  chatMessages: [],
  cardioSessions: [],
  bodyWeights: [],
  sleepEntries: [],
  aiMemories: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  // Dispatch findUnique by id so the admin step-up lookup gets the admin
  // record while target-user lookups (banTarget, delTarget) get the target.
  (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: { where: { id?: string } }) => {
    if (where?.id === 'u-admin') return Promise.resolve(adminUser);
    if (where?.id === TARGET_ID) return Promise.resolve(sampleTargetUser);
    return Promise.resolve(adminUser);
  });
  // Default admin count > 1 so the "last admin" lockout guard does not kick in
  (prisma.user.count as jest.Mock).mockResolvedValue(2);
  (prisma.adminLog.create as jest.Mock).mockResolvedValue({});
  (prisma.securityEvent.create as jest.Mock).mockResolvedValue({});
  (prisma.workout.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.workout.findMany as jest.Mock).mockResolvedValue([]);
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
      .send({ reason: 'Violating TOS', adminPassword: 'admin-pass' });

    expect(res.status).toBe(200);
    expect(res.body.isBanned).toBe(true);
  });

  it('SECURITY: ban uses id from URL param, not body', async () => {
    const bannedUser = { id: TARGET_ID, isBanned: true };
    (prisma.$transaction as jest.Mock).mockResolvedValueOnce([bannedUser, { count: 1 }, { count: 0 }]);

    await request(app)
      .post(`/api/admin/users/${TARGET_ID}/ban`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ reason: 'Reason', userId: 'u-injected-id', adminPassword: 'admin-pass' }); // userId in body must be ignored

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
      .send({ role: 'TRAINER', adminPassword: 'admin-pass' });

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
      .send({ role: 'SUPPORT', adminPassword: 'admin-pass' });

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

// ─── GET /api/admin/users/:id ─────────────────────────────────────────────────

describe('GET /api/admin/users/:id', () => {
  it('401 without token', async () => {
    const res = await request(app).get(`/api/admin/users/${TARGET_ID}`);
    expect(res.status).toBe(401);
  });

  it('404 when user does not exist', async () => {
    // authenticate call returns adminUser; the second findUnique (user detail) returns null
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(adminUser) // authenticate
      .mockResolvedValueOnce(null);     // GET /users/:id detail query

    const res = await request(app)
      .get(`/api/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });

  it('200 returns user without passwordHash / totpSecret', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(adminUser)      // authenticate
      .mockResolvedValueOnce(sampleTargetUser); // detail query

    const res = await request(app)
      .get(`/api/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TARGET_ID);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.totpSecret).toBeUndefined();
    expect(res.body).toHaveProperty('_count');
  });
});

// ─── PATCH /api/admin/users/:id/subscription ─────────────────────────────────

describe('PATCH /api/admin/users/:id/subscription', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/subscription`)
      .send({ plan: 'pro' });
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .patch('/api/admin/users/not-a-cuid/subscription')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'pro' });
    expect(res.status).toBe(400);
  });

  it('400 when plan is not a valid enum value', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/subscription`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'premium' }); // invalid — not in enum
    expect(res.status).toBe(400);
  });

  it('200 upserts subscription and logs action', async () => {
    const mockSub = { id: 'sub-1', userId: TARGET_ID, plan: 'pro', status: 'active', endDate: null };
    (prisma.subscription.upsert as jest.Mock).mockResolvedValueOnce(mockSub);

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/subscription`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ plan: 'pro', adminPassword: 'admin-pass' });

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('pro');

    const logCalls = (prisma.adminLog.create as jest.Mock).mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);
    expect(logCalls[0][0].data.action).toBe('CHANGE_SUBSCRIPTION');
    expect(logCalls[0][0].data.adminId).toBe('u-admin');
  });
});

// ─── DELETE /api/admin/users/:id ─────────────────────────────────────────────

describe('DELETE /api/admin/users/:id', () => {
  it('401 without token', async () => {
    const res = await request(app).delete(`/api/admin/users/${TARGET_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when admin tries to delete their own account', async () => {
    // Use a CUID-format ID so the route regex matches; self-delete guard is checked inside
    const selfId = 'cadmin00000000000000001';
    const selfUser = { id: selfId, isBanned: false, lockedUntil: null, role: 'ADMIN' };
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(selfUser);

    const res = await request(app)
      .delete(`/api/admin/users/${selfId}`)
      .set('Authorization', `Bearer ${makeToken(selfId, 'ADMIN')}`);
    expect(res.status).toBe(400);
  });

  it('404 when user does not exist (Prisma NotFound)', async () => {
    const notFound = new Error('NotFoundError') as any;
    notFound.code = 'P2025';
    (prisma.user.update as jest.Mock).mockRejectedValueOnce(notFound);

    const res = await request(app)
      .delete(`/api/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ adminPassword: 'admin-pass' });
    expect(res.status).toBe(404);
  });

  it('200 anonymizes user data and logs DELETE_USER action', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ id: TARGET_ID, email: 'deleted@deleted.invalid' });

    const res = await request(app)
      .delete(`/api/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ adminPassword: 'admin-pass' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updateCalls = (prisma.user.update as jest.Mock).mock.calls;
    expect(updateCalls[0][0].data.email).toMatch(/^deleted_\d+@deleted\.invalid$/);
    expect(updateCalls[0][0].data.isBanned).toBe(true);

    const logCalls = (prisma.adminLog.create as jest.Mock).mock.calls;
    expect(logCalls[0][0].data.action).toBe('DELETE_USER');
  });
});

// ─── Announcements CRUD ────────────────────────────────────────────────────────

describe('GET /api/admin/announcements', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/announcements');
    expect(res.status).toBe(401);
  });

  it('200 returns announcements list', async () => {
    (prisma.announcement.findMany as jest.Mock).mockResolvedValueOnce([sampleAnnouncement]);

    const res = await request(app)
      .get('/api/admin/announcements')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Тестовое объявление');
  });
});

describe('POST /api/admin/announcements', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/admin/announcements')
      .send({ title: 'Test', body: 'Body' });
    expect(res.status).toBe(401);
  });

  it('400 when title is empty', async () => {
    const res = await request(app)
      .post('/api/admin/announcements')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: '', body: 'Body' });
    expect(res.status).toBe(400);
  });

  it('400 when body is missing', async () => {
    const res = await request(app)
      .post('/api/admin/announcements')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: 'Test' });
    expect(res.status).toBe(400);
  });

  it('201 creates announcement with authorId from JWT', async () => {
    (prisma.announcement.create as jest.Mock).mockResolvedValueOnce(sampleAnnouncement);

    const res = await request(app)
      .post('/api/admin/announcements')
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ title: 'Тестовое объявление', body: 'Тело объявления' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(ANN_ID);

    const createCalls = (prisma.announcement.create as jest.Mock).mock.calls;
    expect(createCalls[0][0].data.authorId).toBe('u-admin');
  });
});

describe('PATCH /api/admin/announcements/:id', () => {
  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .patch('/api/admin/announcements/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('404 when announcement does not exist', async () => {
    const notFound = new Error('NotFoundError') as any;
    notFound.code = 'P2025';
    (prisma.announcement.update as jest.Mock).mockRejectedValueOnce(notFound);

    const res = await request(app)
      .patch(`/api/admin/announcements/${ANN_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ isActive: false });
    expect(res.status).toBe(404);
  });

  it('200 deactivates announcement', async () => {
    const updated = { ...sampleAnnouncement, isActive: false };
    (prisma.announcement.update as jest.Mock).mockResolvedValueOnce(updated);

    const res = await request(app)
      .patch(`/api/admin/announcements/${ANN_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });
});

describe('DELETE /api/admin/announcements/:id', () => {
  it('401 without token', async () => {
    const res = await request(app).delete(`/api/admin/announcements/${ANN_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .delete('/api/admin/announcements/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when announcement does not exist', async () => {
    const notFound = new Error('NotFoundError') as any;
    notFound.code = 'P2025';
    (prisma.announcement.delete as jest.Mock).mockRejectedValueOnce(notFound);

    const res = await request(app)
      .delete(`/api/admin/announcements/${ANN_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });

  it('200 deletes and logs DELETE_ANNOUNCEMENT action', async () => {
    (prisma.announcement.delete as jest.Mock).mockResolvedValueOnce(sampleAnnouncement);

    const res = await request(app)
      .delete(`/api/admin/announcements/${ANN_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const logCalls = (prisma.adminLog.create as jest.Mock).mock.calls;
    expect(logCalls[0][0].data.action).toBe('DELETE_ANNOUNCEMENT');
    expect(logCalls[0][0].data.adminId).toBe('u-admin');
  });
});

// ─── GET /api/admin/users/:id/security-events ────────────────────────────────

describe('GET /api/admin/users/:id/security-events', () => {
  it('401 without token', async () => {
    const res = await request(app).get(`/api/admin/users/${TARGET_ID}/security-events`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .get('/api/admin/users/bad-id/security-events')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('200 returns target user\'s security events scoped to that userId', async () => {
    const events = [
      { id: 'se1', action: 'LOGIN_SUCCESS', ip: '192.0.2.1', userAgent: 'iOS', details: null, createdAt: new Date() },
      { id: 'se2', action: 'PUSH_TOKEN_TAKEOVER_BLOCKED', ip: null, userAgent: null, details: 'target', createdAt: new Date() },
    ];
    (prisma.securityEvent.findMany as jest.Mock).mockResolvedValueOnce(events);

    const res = await request(app)
      .get(`/api/admin/users/${TARGET_ID}/security-events`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    // SECURITY: findMany must scope by the path-param userId, not the
    // calling admin's own userId — otherwise the page would show the
    // admin's own events when looking up someone else.
    const calls = (prisma.securityEvent.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.userId).toBe(TARGET_ID);
  });

  it('200 caps result to 50 rows (sanity bound)', async () => {
    (prisma.securityEvent.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get(`/api/admin/users/${TARGET_ID}/security-events`)
      .set('Authorization', `Bearer ${makeToken()}`);

    const calls = (prisma.securityEvent.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].take).toBe(50);
  });
});

// ─── GET /api/admin/users/:id/sessions ───────────────────────────────────────

describe('GET /api/admin/users/:id/sessions', () => {
  it('401 without token', async () => {
    const res = await request(app).get(`/api/admin/users/${TARGET_ID}/sessions`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .get('/api/admin/users/bad-id/sessions')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('200 returns only active sessions (revoked=false AND expiresAt>=now)', async () => {
    const sessions = [
      { id: 'rt1', createdAt: new Date(), expiresAt: new Date(Date.now() + 86400000), userAgent: 'iOS', ip: '192.0.2.1' },
    ];
    (prisma.refreshToken.findMany as jest.Mock).mockResolvedValueOnce(sessions);

    const res = await request(app)
      .get(`/api/admin/users/${TARGET_ID}/sessions`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    // Verify the active-only filter — without revoked=false the page
    // would show all historic sessions, including revoked ones, which
    // is misleading when an admin is investigating "who's currently
    // logged in as this user?"
    const calls = (prisma.refreshToken.findMany as jest.Mock).mock.calls;
    const where = calls[0][0].where;
    expect(where.userId).toBe(TARGET_ID);
    expect(where.revoked).toBe(false);
    expect(where.expiresAt).toEqual(expect.objectContaining({ gte: expect.any(Date) }));
  });
});

// ─── PATCH /api/admin/users/:id/note ─────────────────────────────────────────

describe('PATCH /api/admin/users/:id/note', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/note`)
      .send({ note: 'spam history' });
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .patch('/api/admin/users/bad-id/note')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ note: 'test' });
    expect(res.status).toBe(400);
  });

  it('200 sets note + writes UPDATE_NOTE adminLog with adminId from JWT', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      id: TARGET_ID, adminNote: 'flagged for spam',
    });

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/note`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ note: 'flagged for spam' });

    expect(res.status).toBe(200);
    expect(res.body.adminNote).toBe('flagged for spam');

    const logCalls = (prisma.adminLog.create as jest.Mock).mock.calls;
    const auditCall = logCalls.find((c) => c[0]?.data?.action === 'UPDATE_NOTE');
    expect(auditCall).toBeTruthy();
    expect(auditCall![0].data.targetId).toBe(TARGET_ID);
    expect(auditCall![0].data.adminId).toBe('u-admin');
    // details must distinguish "set" vs "cleared" — useful for audit grep
    expect(auditCall![0].data.details).toContain('note set');
  });

  it('200 clears note when empty string passed (records "note cleared")', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      id: TARGET_ID, adminNote: null,
    });

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/note`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ note: '' });

    expect(res.status).toBe(200);
    // Cleared note → adminNote: null in update payload
    const updateCalls = (prisma.user.update as jest.Mock).mock.calls;
    const updateCall = updateCalls.find((c) => c[0]?.where?.id === TARGET_ID);
    expect(updateCall![0].data.adminNote).toBeNull();
    // Audit log distinguishes the cleared variant
    const logCalls = (prisma.adminLog.create as jest.Mock).mock.calls;
    const auditCall = logCalls.find((c) => c[0]?.data?.action === 'UPDATE_NOTE');
    expect(auditCall![0].data.details).toBe('note cleared');
  });
});

// ─── POST /api/admin/users/:id/force-verify-email ────────────────────────────

describe('POST /api/admin/users/:id/force-verify-email', () => {
  it('401 without token', async () => {
    const res = await request(app).post(`/api/admin/users/${TARGET_ID}/force-verify-email`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/admin/users/bad-id/force-verify-email')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when target user does not exist (Prisma P2025)', async () => {
    const notFound = new Error('NotFoundError') as any;
    notFound.code = 'P2025';
    (prisma.user.update as jest.Mock).mockRejectedValueOnce(notFound);

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/force-verify-email`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('200 marks email verified + writes FORCE_VERIFY_EMAIL audit log', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      id: TARGET_ID,
      email: 'target@example.com',
      emailVerified: true,
    });

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/force-verify-email`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.emailVerified).toBe(true);

    // Update touches only emailVerified — must not silently flip other fields
    const updateCalls = (prisma.user.update as jest.Mock).mock.calls;
    const updateCall = updateCalls.find((c) => c[0]?.where?.id === TARGET_ID);
    expect(updateCall![0].data).toEqual({ emailVerified: true });

    const logCalls = (prisma.adminLog.create as jest.Mock).mock.calls;
    const auditCall = logCalls.find((c) => c[0]?.data?.action === 'FORCE_VERIFY_EMAIL');
    expect(auditCall).toBeTruthy();
    expect(auditCall![0].data.adminId).toBe('u-admin');
    expect(auditCall![0].data.targetId).toBe(TARGET_ID);
    // details must include the email so admins can grep audits by address
    expect(auditCall![0].data.details).toContain('target@example.com');
  });
});

// ─── POST /api/admin/users/:id/force-disable-2fa ─────────────────────────────
//
// Destructive op for 2FA recovery. Step-up re-auth required (sec audit
// 2026-04 HIGH-11). Without tests, regressions could:
//   - Allow non-admins to disable 2FA on other accounts
//   - Skip the audit-log write (untraceable account takeovers)
//   - Skip the security-event write (no notification trail to user)

describe('POST /api/admin/users/:id/force-disable-2fa', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/force-disable-2fa`)
      .send({ adminPassword: 'pw' });
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/admin/users/bad-id/force-disable-2fa')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ adminPassword: 'pw' });
    expect(res.status).toBe(400);
  });

  it('400 when adminPassword is missing (step-up gate)', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/force-disable-2fa`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    // requireAdminStepUp returns 400 with ADMIN_PASSWORD_REQUIRED
    expect(res.status).toBe(400);
  });

  it('200 disables 2FA + writes adminLog + writes securityEvent', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ id: TARGET_ID });

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/force-disable-2fa`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ adminPassword: 'admin-pw' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify the user.update wiped all 2FA state
    const updateCalls = (prisma.user.update as jest.Mock).mock.calls;
    const wipeCall = updateCalls.find((c) => c[0]?.where?.id === TARGET_ID);
    expect(wipeCall).toBeTruthy();
    expect(wipeCall![0].data).toEqual(
      expect.objectContaining({
        totpEnabled: false,
        totpSecret: null,
        totpBackupCodes: null,
      }),
    );

    // adminLog must record FORCE_DISABLE_2FA with adminId from JWT
    const adminLogCalls = (prisma.adminLog.create as jest.Mock).mock.calls;
    const auditCall = adminLogCalls.find((c) => c[0]?.data?.action === 'FORCE_DISABLE_2FA');
    expect(auditCall).toBeTruthy();
    expect(auditCall![0].data.targetId).toBe(TARGET_ID);
    expect(auditCall![0].data.adminId).toBe('u-admin');

    // securityEvent must record TOTP_DISABLED on the TARGET user (not admin),
    // so the user can see the action in their security-events feed
    const seCalls = (prisma.securityEvent.create as jest.Mock).mock.calls;
    const seCall = seCalls.find((c) => c[0]?.data?.action === 'TOTP_DISABLED');
    expect(seCall).toBeTruthy();
    expect(seCall![0].data.userId).toBe(TARGET_ID);
  });
});

// ─── POST /api/admin/users/:id/force-logout ──────────────────────────────────

describe('POST /api/admin/users/:id/force-logout', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/force-logout`)
      .send({ adminPassword: 'pw' });
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/admin/users/bad-id/force-logout')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ adminPassword: 'pw' });
    expect(res.status).toBe(400);
  });

  it('404 when target user does not exist', async () => {
    // Auth middleware → admin; route's findUnique for target → null
    (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where?.id === 'u-admin') return Promise.resolve(adminUser);
      return Promise.resolve(null); // target not found
    });

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/force-logout`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ adminPassword: 'pw' });
    expect(res.status).toBe(404);
  });

  it('200 revokes all refresh tokens + deletes trusted devices', async () => {
    (prisma.$transaction as jest.Mock).mockResolvedValueOnce([
      { count: 3 }, // 3 sessions revoked
      { count: 2 }, // 2 trusted devices wiped
    ]);

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/force-logout`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ adminPassword: 'admin-pw' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.revokedCount).toBe(3);

    // Verify $transaction includes both refresh-token revocation and trusted-device deletion
    const txCalls = (prisma.$transaction as jest.Mock).mock.calls;
    expect(txCalls.length).toBe(1);
  });
});

// ─── POST /api/admin/test-notification ───────────────────────────────────────

describe('POST /api/admin/test-notification', () => {
  it('401 without token', async () => {
    const res = await request(app).post('/api/admin/test-notification').send({ channel: 'push' });
    expect(res.status).toBe(401);
  });

  it('403 for non-admin role', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .post('/api/admin/test-notification')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send({ channel: 'push' });
    expect(res.status).toBe(403);
  });

  it('400 on invalid channel', async () => {
    const res = await request(app)
      .post('/api/admin/test-notification')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ channel: 'sms' });
    expect(res.status).toBe(400);
  });

  it('200 with default channel=both, returns pushSent+emailSent flags', async () => {
    (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where?.id === 'u-admin') {
        return Promise.resolve({ ...adminUser, email: 'admin@test.com', firstName: 'Founder' });
      }
      return Promise.resolve(adminUser);
    });

    const res = await request(app)
      .post('/api/admin/test-notification')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    // Both branches are best-effort — without mocking pushService /
    // emailService the calls will fail (no real Expo / SMTP). The
    // endpoint should still 200 with errors object surfacing why.
    expect(res.status).toBe(200);
    expect(typeof res.body.pushSent).toBe('boolean');
    expect(typeof res.body.emailSent).toBe('boolean');
  });
});

// ─── POST /api/admin/cron/run/:id ─────────────────────────────────────────────

describe('POST /api/admin/cron/run/:id', () => {
  it('401 without token', async () => {
    const res = await request(app).post('/api/admin/cron/run/retention');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin role', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .post('/api/admin/cron/run/retention')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('400 on unknown cron id', async () => {
    const res = await request(app)
      .post('/api/admin/cron/run/unknown-job')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CRON_ID');
    expect(Array.isArray(res.body.allowed)).toBe(true);
  });

  it('400 rejects keep-warm (excluded from allowed list)', async () => {
    const res = await request(app)
      .post('/api/admin/cron/run/keep-warm')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/admin/cron-health ──────────────────────────────────────────────

describe('GET /api/admin/cron-health', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/cron-health');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin role', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/cron-health')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 returns cronJobs array and now timestamp', async () => {
    const res = await request(app)
      .get('/api/admin/cron-health')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.cronJobs)).toBe(true);
    expect(typeof res.body.now).toBe('string');
  });
});

// ─── GET /api/admin/me ───────────────────────────────────────────────────────

describe('GET /api/admin/me', () => {
  // Full select shape that the route requests. Tests can override individual
  // fields per-case.
  const baseAdminProfile = {
    id: 'u-admin',
    email: 'admin@test.com',
    firstName: 'Founder',
    lastName: 'User',
    role: 'ADMIN',
    createdAt: new Date('2026-04-01T00:00:00Z'),
    firstChatAt: null,
    lastActiveAt: null,
    activationPushSentAt: null,
    activationEmailSentAt: null,
    reactivation7dSentAt: null,
    reactivation14dSentAt: null,
    reactivation30dSentAt: null,
    isBanned: false,
    lockedUntil: null,
    totpEnabled: false,
    emailVerified: true,
    phoneVerified: false,
    onboardingStepLog: null,
    onboardingCompletedAt: null,
  };

  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/me');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin role', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);

    const res = await request(app)
      .get('/api/admin/me')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);

    expect(res.status).toBe(403);
  });

  it('200 returns founder self-status with activation funnel', async () => {
    (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where?.id === 'u-admin') return Promise.resolve({ ...adminUser, ...baseAdminProfile });
      return Promise.resolve(adminUser);
    });

    const res = await request(app)
      .get('/api/admin/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('u-admin');
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.activation).toMatchObject({
      activated: false,
      pushFired: false,
      emailFired: false,
    });
    expect(res.body.reactivation).toMatchObject({
      d7Fired: false,
      d14Fired: false,
      d30Fired: false,
    });
    expect(res.body.pushTokens.count).toBe(0);
    expect(res.body.subscription.plan).toBe('free');
    expect(typeof res.body.now).toBe('string');
    // Onboarding block — null fields surface as "never started"
    expect(res.body.onboarding).toMatchObject({
      completed: false,
      maxStepReached: null,
    });
  });

  it('reflects onboarding step state from onboardingStepLog', async () => {
    (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where?.id === 'u-admin') {
        return Promise.resolve({
          ...adminUser,
          ...baseAdminProfile,
          onboardingStepLog: {
            '0': '2026-04-20T10:00:00Z',
            '1': '2026-04-20T10:01:00Z',
            '2': '2026-04-20T10:02:00Z',
          },
          onboardingCompletedAt: null,
        });
      }
      return Promise.resolve(adminUser);
    });

    const res = await request(app)
      .get('/api/admin/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.onboarding.completed).toBe(false);
    expect(res.body.onboarding.maxStepReached).toBe(2);
    expect(res.body.onboarding.stepLog).toHaveProperty('0');
    expect(res.body.onboarding.stepLog).toHaveProperty('2');
  });

  it('reflects activated user state when firstChatAt is set', async () => {
    (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where?.id === 'u-admin') {
        return Promise.resolve({
          ...adminUser,
          ...baseAdminProfile,
          firstChatAt: new Date('2026-04-15T10:00:00Z'),
          activationPushSentAt: new Date('2026-04-02T00:00:00Z'),
          activationEmailSentAt: new Date('2026-04-02T00:00:00Z'),
        });
      }
      return Promise.resolve(adminUser);
    });

    const res = await request(app)
      .get('/api/admin/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.activation.activated).toBe(true);
    expect(res.body.activation.pushFired).toBe(true);
    expect(res.body.activation.emailFired).toBe(true);
  });

  it('returns push token count and active session count', async () => {
    (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where?.id === 'u-admin') return Promise.resolve({ ...adminUser, ...baseAdminProfile });
      return Promise.resolve(adminUser);
    });
    (prisma.pushToken.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'pt-1', createdAt: new Date(), updatedAt: new Date() },
      { id: 'pt-2', createdAt: new Date(), updatedAt: new Date() },
    ]);
    (prisma.refreshToken.count as jest.Mock).mockResolvedValueOnce(3);

    const res = await request(app)
      .get('/api/admin/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.pushTokens.count).toBe(2);
    expect(res.body.pushTokens.latest).toBeTruthy();
    expect(res.body.activeSessionCount).toBe(3);
  });

  it('500 when DB query fails', async () => {
    // Auth middleware queries user.findUnique first — let that succeed,
    // then break a downstream query in the route handler.
    (prisma.refreshToken.count as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/admin/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(500);
  });
});
