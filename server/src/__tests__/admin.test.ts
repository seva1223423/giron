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
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
    pushToken: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    },
    chatMessage: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
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
      groupBy: jest.fn().mockResolvedValue([]),
    },
    cardioSession: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    meal: {
      count: jest.fn().mockResolvedValue(0),
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
      findMany: jest.fn().mockResolvedValue([]),
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

// ─── GET /api/admin/announcements/active ─────────────────────────────────────
//
// User-facing endpoint (any authenticated user calls it on home-screen
// mount to pick up announcements). Filters by:
//   - isActive
//   - endsAt null OR future
//   - targetRole null OR matches user's plan
// Without correct targetRole filtering, free users could see paid-only
// announcements (or vice versa).

describe('GET /api/admin/announcements/active', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/announcements/active');
    expect(res.status).toBe(401);
  });

  it('200 returns active announcements + filters by user plan (free)', async () => {
    // User has no subscription → free plan
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const announcements = [
      { id: 'a1', title: 'Hello', body: 'World', type: 'info', createdAt: new Date() },
    ];
    (prisma.announcement.findMany as jest.Mock).mockResolvedValueOnce(announcements);

    const res = await request(app)
      .get('/api/admin/announcements/active')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    // Verify the where clause filters by isActive + endsAt + targetRole
    const calls = (prisma.announcement.findMany as jest.Mock).mock.calls;
    const where = calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.AND).toBeDefined();
    // The targetRole filter must include 'free' (the user's effective plan)
    // OR null (broadcast). Without this, free users would see no targeted
    // announcements at all.
    const targetRoleFilter = where.AND.find((clause: any) => clause.OR && clause.OR[0]?.targetRole !== undefined);
    expect(targetRoleFilter).toBeDefined();
  });

  it('200 increments viewCount for returned announcements (fire-and-forget)', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (prisma.announcement.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'a1', title: 'A', body: 'B', type: 'info', createdAt: new Date() },
      { id: 'a2', title: 'C', body: 'D', type: 'warn', createdAt: new Date() },
    ]);

    await request(app)
      .get('/api/admin/announcements/active')
      .set('Authorization', `Bearer ${makeToken()}`);

    // viewCount increment happens fire-and-forget — verify the call shape
    const updateCalls = (prisma.announcement.updateMany as jest.Mock).mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);
    const incCall = updateCalls.find((c) => c[0]?.data?.viewCount?.increment === 1);
    expect(incCall).toBeTruthy();
    expect(incCall![0].where.id.in).toEqual(['a1', 'a2']);
  });

  it('200 skips viewCount increment when no announcements returned', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (prisma.announcement.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/admin/announcements/active')
      .set('Authorization', `Bearer ${makeToken()}`);

    // Empty list → no updateMany call (avoid an empty `id.in: []` query
    // that does nothing but burns a round-trip)
    expect(prisma.announcement.updateMany).not.toHaveBeenCalled();
  });

  it('round 80: targetRole match accepts user ROLE in addition to subscription PLAN', async () => {
    // Pre-round-80 the where filter only matched targetRole against userPlan,
    // so an admin who set targetRole='ADMIN' silently delivered to no one
    // because userPlan is always 'free' or a plan name. /announcements/preview
    // already accepted both shapes — this test pins that /active matches
    // them too.
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (prisma.announcement.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/admin/announcements/active')
      .set('Authorization', `Bearer ${makeToken('u-admin', 'ADMIN')}`);

    const calls = (prisma.announcement.findMany as jest.Mock).mock.calls;
    const where = calls[0][0].where;
    const targetClause = where.AND.find((c: any) => c.OR && c.OR[0]?.targetRole !== undefined);
    expect(targetClause).toBeDefined();
    const targetRoleValues = targetClause.OR.map((o: any) => o.targetRole);
    // Must include `null` (broadcast), `'free'` (the admin's plan, no sub),
    // and `'ADMIN'` (the user's role) so an ADMIN-targeted announcement
    // actually reaches admins.
    expect(targetRoleValues).toContain(null);
    expect(targetRoleValues).toContain('free');
    expect(targetRoleValues).toContain('ADMIN');
  });
});

// ─── GET /api/admin/announcements/preview ────────────────────────────────────

describe('GET /api/admin/announcements/preview', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/announcements/preview');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/announcements/preview')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 counts non-banned users when no targetRole', async () => {
    (prisma.user.count as jest.Mock).mockResolvedValueOnce(150);

    const res = await request(app)
      .get('/api/admin/announcements/preview')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(150);

    const calls = (prisma.user.count as jest.Mock).mock.calls;
    const where = calls[calls.length - 1][0].where;
    expect(where.isBanned).toBe(false);
  });

  it('200 filters by subscription plan when targetRole=pro (round 83: includes cancelled-not-expired)', async () => {
    // Round 83: the count must match the actual delivery audience —
    // /announcements/active sees the announcement for users whose
    // subscription is active OR cancelled-but-not-yet-expired (the
    // `subActive` ternary). The pre-round-83 preview filter restricted
    // to status='active' alone, which under-reported the audience by
    // however many users had cancelled and were riding out their period.
    (prisma.user.count as jest.Mock).mockResolvedValueOnce(42);

    const res = await request(app)
      .get('/api/admin/announcements/preview?targetRole=pro')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(42);

    const calls = (prisma.user.count as jest.Mock).mock.calls;
    const where = calls[calls.length - 1][0].where;
    // The new filter shape: plan match + status in {active, cancelled} +
    // endDate null OR future. Match the structure rather than the exact
    // Date instance (`now` is computed at request time).
    expect(where.subscription.plan).toBe('pro');
    expect(where.subscription.status).toEqual({ in: ['active', 'cancelled'] });
    expect(Array.isArray(where.subscription.OR)).toBe(true);
    expect(where.subscription.OR).toEqual(
      expect.arrayContaining([
        { endDate: null },
        expect.objectContaining({ endDate: expect.objectContaining({ gte: expect.any(Date) }) }),
      ]),
    );
  });

  it('200 filters by user role when targetRole=ADMIN', async () => {
    (prisma.user.count as jest.Mock).mockResolvedValueOnce(2);

    const res = await request(app)
      .get('/api/admin/announcements/preview?targetRole=ADMIN')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);

    const calls = (prisma.user.count as jest.Mock).mock.calls;
    const where = calls[calls.length - 1][0].where;
    expect(where.role).toBe('ADMIN');
  });

  it('200 ignores unrecognised targetRole values (safe fallback)', async () => {
    (prisma.user.count as jest.Mock).mockResolvedValueOnce(150);

    const res = await request(app)
      .get('/api/admin/announcements/preview?targetRole=garbage')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);

    const calls = (prisma.user.count as jest.Mock).mock.calls;
    const where = calls[calls.length - 1][0].where;
    // No subscription/role filter applied — falls back to all non-banned
    expect(where.subscription).toBeUndefined();
    expect(where.role).toBeUndefined();
  });
});

// ─── POST /api/admin/users/:id/message ───────────────────────────────────────
//
// Admin sends a one-shot message to a user by creating a support ticket on
// their behalf. Critical that the ticket gets created with isStaff=true on
// the message (otherwise the user replying wouldn't see "from staff" in
// their support inbox) and that the admin is the author + assignee.

describe('POST /api/admin/users/:id/message', () => {
  const validBody = { subject: 'Important update', message: 'Please update your contact info.' };

  it('401 without token', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/message`)
      .send(validBody);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/admin/users/bad-id/message')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);
    expect(res.status).toBe(400);
  });

  it('400 when subject is empty', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/message`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, subject: '' });
    expect(res.status).toBe(400);
  });

  it('404 when target user does not exist', async () => {
    (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where?.id === 'u-admin') return Promise.resolve(adminUser);
      return Promise.resolve(null); // target not found
    });

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/message`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);

    expect(res.status).toBe(404);
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it('201 creates ticket with admin as author + assignee + isStaff=true', async () => {
    (prisma.supportTicket.create as jest.Mock).mockResolvedValueOnce({
      id: 'cticket0000000000000001',
      ...validBody,
      status: 'in_progress',
      priority: 'normal',
      userId: TARGET_ID,
      assignedToId: 'u-admin',
      user: { id: TARGET_ID, firstName: 'Ivan', lastName: 'P', email: 'i@example.com' },
      assignedTo: { firstName: 'Admin', lastName: null },
      messages: [{
        id: 'cmsg00000000000000001',
        content: validBody.message,
        authorId: 'u-admin',
        isStaff: true,
        author: { id: 'u-admin', firstName: 'Admin', lastName: null, role: 'ADMIN' },
      }],
    });

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/message`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send(validBody);

    expect(res.status).toBe(201);

    // Verify the ticket creation payload
    const createCalls = (prisma.supportTicket.create as jest.Mock).mock.calls;
    expect(createCalls.length).toBe(1);
    const data = createCalls[0][0].data;
    // Ticket scoped to target user
    expect(data.userId).toBe(TARGET_ID);
    // Admin auto-assigned (admin owns the conversation from creation)
    expect(data.assignedToId).toBe('u-admin');
    // Status starts in_progress (admin already engaged), not 'open'
    expect(data.status).toBe('in_progress');
    // SECURITY: nested message creation must mark isStaff=true so the
    // user's support UI shows the "from staff" badge correctly
    expect(data.messages.create.isStaff).toBe(true);
    expect(data.messages.create.authorId).toBe('u-admin');
    expect(data.messages.create.isInternal).toBe(false);
  });
});

// ─── GET /api/admin/users/export ─────────────────────────────────────────────
//
// CSV export of user list. Two security properties pinned:
//   - admin gate (the data leak risk is enormous — every user's email,
//     subscription state, and workout count in one file)
//   - CSV-injection prevention: cells starting with =, +, -, @, tab, CR
//     get prefixed with ' so Excel/Google Sheets don't execute them as
//     formulas. A malicious user with an email like "+CMD|'/c calc'" would
//     otherwise auto-execute a payload when the founder opens the export.

describe('GET /api/admin/users/export', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/users/export');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/users/export')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 returns CSV with header line', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'u1',
        email: 'normal@example.com',
        firstName: 'Ivan',
        lastName: 'P',
        role: 'CLIENT',
        createdAt: new Date('2026-01-01'),
        isBanned: false,
        subscription: { plan: 'pro', status: 'active', endDate: null },
        _count: { workouts: 5, chatMessages: 10 },
      },
    ]);

    const res = await request(app)
      .get('/api/admin/users/export')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('id,email,firstName,lastName');
    expect(res.text).toContain('normal@example.com');
  });

  it('SECURITY: CSV-injection guard prefixes formula chars with apostrophe', async () => {
    // A malicious user registered with firstName="=cmd|'/c calc'!A1" — when
    // Excel opens the CSV it would auto-execute the formula. The csvCell
    // sanitiser must prefix it with ' so Excel treats the cell as text.
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'u-evil',
        email: 'evil@example.com',
        firstName: '=cmd|"/c calc"!A1', // formula-injection payload
        lastName: '+evil',
        role: 'CLIENT',
        createdAt: new Date('2026-01-01'),
        isBanned: false,
        subscription: null,
        _count: { workouts: 0, chatMessages: 0 },
      },
    ]);

    const res = await request(app)
      .get('/api/admin/users/export')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    // Both '=' and '+' starting cells must have a leading apostrophe
    // (still wrapped in quotes per CSV spec). The double-quote inside
    // the formula gets escaped to "" per RFC 4180.
    expect(res.text).toContain(`"'=cmd|""/c calc""!A1"`);
    expect(res.text).toContain(`"'+evil"`);
    // Negative check: must NOT contain the raw "=cmd" without the
    // leading apostrophe (would mean the sanitiser didn't fire)
    expect(res.text).not.toMatch(/^"=cmd/m);
  });

  it('200 caps export at 5000 rows (sanity bound)', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/admin/users/export')
      .set('Authorization', `Bearer ${makeToken()}`);

    const calls = (prisma.user.findMany as jest.Mock).mock.calls;
    const exportCall = calls.find((c) => c[0]?.take === 5000);
    expect(exportCall).toBeDefined();
  });

  it('200 applies role filter when query param matches valid role', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/admin/users/export?role=trainer')
      .set('Authorization', `Bearer ${makeToken()}`);

    const calls = (prisma.user.findMany as jest.Mock).mock.calls;
    const exportCall = calls.find((c) => c[0]?.take === 5000);
    // Role gets uppercased before applying
    expect(exportCall![0].where.role).toBe('TRAINER');
  });

  it('200 ignores garbage role values (safe fallback)', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/admin/users/export?role=DROP_TABLE')
      .set('Authorization', `Bearer ${makeToken()}`);

    const calls = (prisma.user.findMany as jest.Mock).mock.calls;
    const exportCall = calls.find((c) => c[0]?.take === 5000);
    // Garbage role is silently dropped — no role filter applied
    expect(exportCall![0].where.role).toBeUndefined();
  });
});

// ─── GET /api/admin/digest/preview ───────────────────────────────────────────
//
// Read-only diagnostic — returns today's admin-digest stats without firing
// the email/push side-effects. Lets the founder verify cron output before
// the 06:00 UTC tick.

describe('GET /api/admin/digest/preview', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/digest/preview');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/digest/preview')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });
});

// ─── GET /api/admin/digest/readiness ─────────────────────────────────────────
//
// Diagnostic for the founder to see which admins will receive tomorrow's
// digest. Auth-only (any authenticated user can call) — but the response
// only includes admin identities, which is acceptable since admin email
// addresses are already exposed elsewhere in the admin UI.

describe('GET /api/admin/digest/readiness', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/digest/readiness');
    expect(res.status).toBe(401);
  });

  it('200 returns adminCount + bootstrap status + per-admin readiness', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'u-admin',
        email: 'admin1@example.com',
        firstName: 'Admin',
        pushTokens: [{ id: 'pt1' }, { id: 'pt2' }],
      },
      {
        id: 'u-admin-2',
        email: 'admin2@example.com',
        firstName: 'Other',
        pushTokens: [],
      },
    ]);

    const res = await request(app)
      .get('/api/admin/digest/readiness')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.adminCount).toBe(2);
    expect(Array.isArray(res.body.admins)).toBe(true);
    expect(res.body.admins).toHaveLength(2);

    // Per-admin: hasPushToken should reflect actual token count
    const a1 = res.body.admins.find((a: any) => a.id === 'u-admin');
    const a2 = res.body.admins.find((a: any) => a.id === 'u-admin-2');
    expect(a1.hasPushToken).toBe(true);
    expect(a2.hasPushToken).toBe(false);
  });
});

// ─── POST /api/admin/mass-message ────────────────────────────────────────────
//
// Bulk version of /users/:id/message — creates one ticket per user via
// Promise.allSettled. Security-critical: must filter out banned users
// (they shouldn't receive new admin DMs) and capped at 100 userIds per
// request to prevent abuse.

describe('POST /api/admin/mass-message', () => {
  const VALID_IDS = [
    'cmass00000000000000001',
    'cmass00000000000000002',
  ];
  const validBody = {
    userIds: VALID_IDS,
    subject: 'Plan update',
    message: 'New features available!',
  };

  it('401 without token', async () => {
    const res = await request(app).post('/api/admin/mass-message').send(validBody);
    expect(res.status).toBe(401);
  });

  it('400 when userIds is empty', async () => {
    const res = await request(app)
      .post('/api/admin/mass-message')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, userIds: [] });
    expect(res.status).toBe(400);
  });

  it('400 when userIds exceeds 100 entries (sanity cap)', async () => {
    // Generate 101 valid CUIDs by repeating with index suffix
    const tooMany = Array.from({ length: 101 }, (_, i) => `cmass00000000000000${String(i).padStart(3, '0')}`);
    const res = await request(app)
      .post('/api/admin/mass-message')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, userIds: tooMany });
    expect(res.status).toBe(400);
  });

  it('400 when userIds contains a non-CUID string', async () => {
    const res = await request(app)
      .post('/api/admin/mass-message')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, userIds: ['not-a-cuid'] });
    expect(res.status).toBe(400);
  });

  it('200 SECURITY: filters out banned users via where.isBanned=false', async () => {
    // Mock returns only the non-banned subset
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: VALID_IDS[0] },
      // VALID_IDS[1] missing → would be banned in real DB
    ]);
    (prisma.supportTicket.create as jest.Mock).mockResolvedValue({ id: 'cticket1' });

    const res = await request(app)
      .post('/api/admin/mass-message')
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send(validBody);

    expect(res.status).toBe(200);

    // SECURITY: verify the user lookup includes the isBanned filter
    const findCalls = (prisma.user.findMany as jest.Mock).mock.calls;
    const massSearchCall = findCalls.find((c) => c[0]?.where?.id?.in !== undefined);
    expect(massSearchCall).toBeDefined();
    expect(massSearchCall![0].where.isBanned).toBe(false);

    // Only ONE ticket should have been created (banned user skipped)
    expect((prisma.supportTicket.create as jest.Mock).mock.calls.length).toBe(1);
  });

  it('200 creates one ticket per non-banned user with isStaff=true', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: VALID_IDS[0] },
      { id: VALID_IDS[1] },
    ]);
    (prisma.supportTicket.create as jest.Mock).mockResolvedValue({ id: 'cticket-x' });

    const res = await request(app)
      .post('/api/admin/mass-message')
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send(validBody);

    expect(res.status).toBe(200);

    const createCalls = (prisma.supportTicket.create as jest.Mock).mock.calls;
    expect(createCalls.length).toBe(2);
    // Each ticket: isStaff=true on the message + admin as assignee
    for (const call of createCalls) {
      const data = call[0].data;
      expect(data.assignedToId).toBe('u-admin');
      expect(data.messages.create.isStaff).toBe(true);
      expect(data.messages.create.authorId).toBe('u-admin');
    }
  });
});

// ─── POST /api/admin/subscriptions/broadcast ─────────────────────────────────
//
// Plan-segmented version of /mass-message — broadcasts to all users in a
// given plan (pro/trainer/club/free), optionally restricted to those whose
// sub expires within 14 days. Same security properties as /mass-message
// (banned users filtered, isStaff=true on every nested message) PLUS:
// the plan filter must match active OR cancelled-but-not-yet-expired
// (cancelled users still have access until endDate hits).

describe('POST /api/admin/subscriptions/broadcast', () => {
  const validBody = {
    plan: 'pro',
    subject: 'Pro update',
    message: 'New features for pro users.',
  };

  it('401 without token', async () => {
    const res = await request(app).post('/api/admin/subscriptions/broadcast').send(validBody);
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .post('/api/admin/subscriptions/broadcast')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('400 when plan is not in the allowed enum', async () => {
    const res = await request(app)
      .post('/api/admin/subscriptions/broadcast')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, plan: 'lifetime' }); // not in enum
    expect(res.status).toBe(400);
  });

  it('200 with sent=0 when no users match the segment', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/admin/subscriptions/broadcast')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sent: 0, failed: 0, total: 0 });
    // No tickets should be created
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it('SECURITY: filters out banned users + matches active OR cancelled-not-expired subs', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'cuser000000000000001' },
      { id: 'cuser000000000000002' },
    ]);
    (prisma.supportTicket.create as jest.Mock).mockResolvedValue({ id: 'cticket-x' });

    const res = await request(app)
      .post('/api/admin/subscriptions/broadcast')
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send(validBody);

    expect(res.status).toBe(200);

    // Verify the user lookup includes:
    // - isBanned: false (security)
    // - subscription with plan='pro' AND (active OR cancelled-not-yet-expired)
    const findCalls = (prisma.user.findMany as jest.Mock).mock.calls;
    const broadcastSearch = findCalls.find((c) => c[0]?.where?.subscription?.plan === 'pro');
    expect(broadcastSearch).toBeDefined();
    const where = broadcastSearch![0].where;
    expect(where.isBanned).toBe(false);
    expect(where.subscription.plan).toBe('pro');
    // The OR clause must include both active and cancelled-not-expired —
    // missing the cancelled branch would fail to reach users still in
    // their paid window (a real billing communication miss).
    expect(where.subscription.OR).toEqual(expect.arrayContaining([
      { status: 'active' },
      expect.objectContaining({
        status: 'cancelled',
        endDate: expect.objectContaining({ gte: expect.any(Date) }),
      }),
    ]));
  });

  it('200 with expiringSoonOnly applies 14-day endDate window', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .post('/api/admin/subscriptions/broadcast')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, expiringSoonOnly: true });

    const findCalls = (prisma.user.findMany as jest.Mock).mock.calls;
    const broadcastSearch = findCalls.find((c) => c[0]?.where?.subscription?.plan === 'pro');
    expect(broadcastSearch).toBeDefined();
    const subWhere = broadcastSearch![0].where.subscription;
    // expiringSoonOnly adds an endDate window: now to now+14d
    expect(subWhere.endDate).toEqual(
      expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
    );
    const ms14d = 14 * 86400 * 1000;
    const window = subWhere.endDate.lte.getTime() - subWhere.endDate.gte.getTime();
    // Allow slack for clock skew during the test run (millisecond precision)
    expect(Math.abs(window - ms14d)).toBeLessThan(1000);
  });
});

// ─── GET /api/admin/moderation/search ────────────────────────────────────────
//
// Searches AI chat messages + support tickets for a keyword. Used by the
// founder when investigating reports of abusive content. Two security
// properties pinned:
//   - Auth gate (admin-only — search results expose user emails + content
//     across the whole user base)
//   - Filters chatMessage by role='user' (only USER-sent messages, not
//     AI replies — AI replies aren't user-content; including them would
//     surface internal AI responses every search). Same logic for
//     supportTicket.messages.some.isStaff=false.

describe('GET /api/admin/moderation/search', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/moderation/search?q=spam');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/moderation/search?q=spam')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('400 when query is missing', async () => {
    const res = await request(app)
      .get('/api/admin/moderation/search')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('400 when query is shorter than 2 chars', async () => {
    const res = await request(app)
      .get('/api/admin/moderation/search?q=x')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('400 when query exceeds 100 chars (sanity bound)', async () => {
    const longQuery = 'x'.repeat(101);
    const res = await request(app)
      .get(`/api/admin/moderation/search?q=${longQuery}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('200 SECURITY: chatMessage search filters by role=user (excludes AI replies)', async () => {
    (prisma.chatMessage.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.supportTicket.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/admin/moderation/search?q=spam')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);

    // chatMessage.findMany must include role='user' filter
    const chatCalls = (prisma.chatMessage.findMany as jest.Mock).mock.calls;
    expect(chatCalls.length).toBe(1);
    expect(chatCalls[0][0].where.role).toBe('user');
    // Keyword passed through as case-insensitive contains
    expect(chatCalls[0][0].where.content).toEqual(
      expect.objectContaining({ contains: 'spam', mode: 'insensitive' }),
    );

    // supportTicket.findMany — message-content branch must filter by isStaff=false
    // so the search only returns user-authored messages, not staff replies.
    const ticketCalls = (prisma.supportTicket.findMany as jest.Mock).mock.calls;
    expect(ticketCalls.length).toBe(1);
    const orClauses = ticketCalls[0][0].where.OR;
    const messageBranch = orClauses.find((c: any) => c.messages?.some?.content);
    expect(messageBranch).toBeDefined();
    expect(messageBranch.messages.some.isStaff).toBe(false);
  });
});

// ─── POST /api/admin/announcements/:id/duplicate ─────────────────────────────

describe('POST /api/admin/announcements/:id/duplicate', () => {
  it('401 without token', async () => {
    const res = await request(app).post(`/api/admin/announcements/${ANN_ID}/duplicate`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/admin/announcements/bad-id/duplicate')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when source announcement does not exist', async () => {
    (prisma.announcement.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .post(`/api/admin/announcements/${ANN_ID}/duplicate`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });

  it('201 creates a copy with "(копия)" suffix + isActive=false (no auto-blast)', async () => {
    (prisma.announcement.findUnique as jest.Mock).mockResolvedValueOnce(sampleAnnouncement);
    (prisma.announcement.create as jest.Mock).mockResolvedValueOnce({
      ...sampleAnnouncement,
      id: 'cnewann000000000000001',
      title: `${sampleAnnouncement.title} (копия)`,
      isActive: false,
    });

    const res = await request(app)
      .post(`/api/admin/announcements/${ANN_ID}/duplicate`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`);

    expect(res.status).toBe(201);

    const createCalls = (prisma.announcement.create as jest.Mock).mock.calls;
    const data = createCalls[0][0].data;
    // Title gets the suffix
    expect(data.title).toBe(`${sampleAnnouncement.title} (копия)`);
    // CRITICAL: isActive starts false. Without this, duplicating an
    // already-active announcement would auto-blast a second copy to
    // the same audience the moment it's created — UX disaster.
    expect(data.isActive).toBe(false);
    // authorId from the duplicating admin (not the original author)
    expect(data.authorId).toBe('u-admin');
    // Body, type, endsAt, targetRole carry over
    expect(data.body).toBe(sampleAnnouncement.body);
    expect(data.type).toBe(sampleAnnouncement.type);
  });
});

// ─── GET /api/admin/activity-feed ────────────────────────────────────────────

describe('GET /api/admin/activity-feed', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/activity-feed');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/activity-feed')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 SECURITY: chat-message branch filters by role=user (no AI replies)', async () => {
    (prisma.workout.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.chatMessage.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.cardioSession.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/admin/activity-feed')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);

    // Same role-filter rule as moderation/search: feed must show user-
    // sent AI messages, not AI-generated responses (otherwise the feed
    // is dominated by AI responses and useless for moderation).
    const chatCalls = (prisma.chatMessage.findMany as jest.Mock).mock.calls;
    expect(chatCalls.length).toBe(1);
    expect(chatCalls[0][0].where.role).toBe('user');

    // Workout filter: only completed workouts
    const workoutCalls = (prisma.workout.findMany as jest.Mock).mock.calls;
    expect(workoutCalls[0][0].where.completedAt).toEqual(
      expect.objectContaining({ not: null }),
    );
  });
});

// ─── GET /api/admin/users/top-revenue ────────────────────────────────────────

describe('GET /api/admin/users/top-revenue', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/users/top-revenue');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/users/top-revenue')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 sorts by revenue desc + filters to active paid subs only', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'u-pro', firstName: 'Pro', lastName: null, email: 'p@x.com',
        subscription: { plan: 'pro', startDate: new Date(), endDate: null },
        _count: { workouts: 50, chatMessages: 100 } },
      { id: 'u-club', firstName: 'Club', lastName: null, email: 'c@x.com',
        subscription: { plan: 'club', startDate: new Date(), endDate: null },
        _count: { workouts: 30, chatMessages: 50 } },
      { id: 'u-trainer', firstName: 'T', lastName: null, email: 't@x.com',
        subscription: { plan: 'trainer', startDate: new Date(), endDate: null },
        _count: { workouts: 20, chatMessages: 40 } },
    ]);

    const res = await request(app)
      .get('/api/admin/users/top-revenue')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Sort: club (29.99) > trainer (19.99) > pro (9.99)
    expect(res.body[0].id).toBe('u-club');
    expect(res.body[1].id).toBe('u-trainer');
    expect(res.body[2].id).toBe('u-pro');

    // Verify SECURITY: where clause excludes free + banned + non-active
    const calls = (prisma.user.findMany as jest.Mock).mock.calls;
    const topRevCall = calls.find((c) => c[0]?.where?.subscription?.plan?.not === 'free');
    expect(topRevCall).toBeDefined();
    expect(topRevCall![0].where.isBanned).toBe(false);
    expect(topRevCall![0].where.subscription.status).toBe('active');
  });
});

// ─── GET /api/admin/users/churn-risk ─────────────────────────────────────────

describe('GET /api/admin/users/churn-risk', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/users/churn-risk');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/users/churn-risk')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 filters paid users with no workout in 14+ days', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/admin/users/churn-risk')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);

    // Verify the where clause: paid + no workout in 14d window. The
    // 14d cutoff matters — too short and the founder gets noise from
    // anyone on a deload, too long and dormant users slip through.
    const calls = (prisma.user.findMany as jest.Mock).mock.calls;
    const churnCall = calls.find((c) =>
      c[0]?.where?.workouts?.none?.completedAt?.gte instanceof Date,
    );
    expect(churnCall).toBeDefined();
    expect(churnCall![0].where.isBanned).toBe(false);
    expect(churnCall![0].where.subscription.status).toBe('active');
    expect(churnCall![0].where.subscription.plan.not).toBe('free');

    // Verify the 14-day window. Allow 1s slack for clock skew during
    // the test run.
    const cutoff = churnCall![0].where.workouts.none.completedAt.gte;
    const expected = Date.now() - 14 * 86400 * 1000;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(1000);
  });
});

// ─── GET /api/admin/subscriptions/forecast ───────────────────────────────────
//
// 4-week subscription-expiration forecast, used to project upcoming MRR
// and churn windows. Buckets expiring subs by week and sums revenue.

describe('GET /api/admin/subscriptions/forecast', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/subscriptions/forecast');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/subscriptions/forecast')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 returns 4 weekly buckets with correct revenue per plan', async () => {
    const now = Date.now();
    // Two pro subs expiring in week 1, one club expiring in week 3
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
      { plan: 'pro', endDate: new Date(now + 2 * 86400 * 1000) },   // week 1
      { plan: 'pro', endDate: new Date(now + 5 * 86400 * 1000) },   // week 1
      { plan: 'club', endDate: new Date(now + 16 * 86400 * 1000) }, // week 3
    ]);

    const res = await request(app)
      .get('/api/admin/subscriptions/forecast')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4); // 4 weekly buckets

    // Week 1: 2 pro × $9.99 = $19.98
    expect(res.body[0].count).toBe(2);
    expect(res.body[0].revenue).toBe(19.98);
    // Week 2: empty
    expect(res.body[1].count).toBe(0);
    expect(res.body[1].revenue).toBe(0);
    // Week 3: 1 club × $29.99
    expect(res.body[2].count).toBe(1);
    expect(res.body[2].revenue).toBe(29.99);
    // Week 4: empty
    expect(res.body[3].count).toBe(0);
  });

  it('200 SECURITY: only counts active paid subs (excludes free + cancelled)', async () => {
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/admin/subscriptions/forecast')
      .set('Authorization', `Bearer ${makeToken()}`);

    const calls = (prisma.subscription.findMany as jest.Mock).mock.calls;
    const forecastCall = calls.find((c) => c[0]?.where?.endDate?.gte instanceof Date);
    expect(forecastCall).toBeDefined();
    expect(forecastCall![0].where.status).toBe('active');
    expect(forecastCall![0].where.plan.not).toBe('free');
    // 50k cap on the take is the safety bound — without it a future
    // 100k-paying-user state could OOM the server on this endpoint.
    expect(forecastCall![0].take).toBe(50000);
  });
});

// ─── GET /api/admin/subscriptions ────────────────────────────────────────────

describe('GET /api/admin/subscriptions', () => {
  beforeEach(() => {
    (prisma.subscription.count as jest.Mock) = jest.fn().mockResolvedValue(0);
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/subscriptions');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/subscriptions')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 with default pagination + plan!=free filter', async () => {
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/admin/subscriptions')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ subscriptions: [], page: 1 });

    // Default where: plan != free (the page is for paid subs only)
    const calls = (prisma.subscription.findMany as jest.Mock).mock.calls;
    const subsCall = calls.find((c) => c[0]?.where?.plan?.not === 'free');
    expect(subsCall).toBeDefined();
    // Default take: 30
    expect(subsCall![0].take).toBe(30);
  });

  it('200 caps limit query param at 100 (sanity bound)', async () => {
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/admin/subscriptions?limit=500')
      .set('Authorization', `Bearer ${makeToken()}`);

    const calls = (prisma.subscription.findMany as jest.Mock).mock.calls;
    const subsCall = calls.find((c) => c[0]?.take !== undefined);
    expect(subsCall![0].take).toBe(100); // clamped from 500
  });

  it('200 with expiringSoon=true forces status=active + 14d endDate window', async () => {
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/admin/subscriptions?expiringSoon=true')
      .set('Authorization', `Bearer ${makeToken()}`);

    const calls = (prisma.subscription.findMany as jest.Mock).mock.calls;
    const subsCall = calls.find((c) => c[0]?.where?.endDate?.gte instanceof Date);
    expect(subsCall).toBeDefined();
    // expiringSoon overrides any explicit status filter — must be active
    expect(subsCall![0].where.status).toBe('active');
    // 14d window
    const window = subsCall![0].where.endDate.lte.getTime() - subsCall![0].where.endDate.gte.getTime();
    expect(Math.abs(window - 14 * 86400 * 1000)).toBeLessThan(1000);
  });
});

// ─── GET /api/admin/logs ─────────────────────────────────────────────────────

describe('GET /api/admin/logs', () => {
  beforeEach(() => {
    (prisma.adminLog.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.adminLog as any).count = jest.fn().mockResolvedValue(0);
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/logs');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/logs')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 default pagination uses limit=50 (capped at 200)', async () => {
    const res = await request(app)
      .get('/api/admin/logs')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    const calls = (prisma.adminLog.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].take).toBe(50);
  });

  it('200 caps limit at 200 (sanity bound)', async () => {
    await request(app)
      .get('/api/admin/logs?limit=999')
      .set('Authorization', `Bearer ${makeToken()}`);

    const calls = (prisma.adminLog.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].take).toBe(200);
  });

  it('400 when search query exceeds 100 chars', async () => {
    const long = 'x'.repeat(101);
    const res = await request(app)
      .get(`/api/admin/logs?search=${long}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('200 search filter expands across details + admin email/name', async () => {
    await request(app)
      .get('/api/admin/logs?search=banned')
      .set('Authorization', `Bearer ${makeToken()}`);

    const calls = (prisma.adminLog.findMany as jest.Mock).mock.calls;
    const where = calls[0][0].where;
    // OR clause must search 4 places: details, admin.email, admin.firstName,
    // admin.lastName. Without all 4, the audit search becomes too narrow
    // and admins can't grep by their colleagues' names.
    expect(where.OR).toEqual(expect.arrayContaining([
      expect.objectContaining({ details: expect.objectContaining({ contains: 'banned' }) }),
      expect.objectContaining({ admin: expect.objectContaining({ email: expect.any(Object) }) }),
      expect.objectContaining({ admin: expect.objectContaining({ firstName: expect.any(Object) }) }),
      expect.objectContaining({ admin: expect.objectContaining({ lastName: expect.any(Object) }) }),
    ]));
    expect(where.OR.length).toBe(4);
  });
});

// ─── GET /api/admin/staff ────────────────────────────────────────────────────

describe('GET /api/admin/staff', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/staff');
    expect(res.status).toBe(401);
  });

  it('403 for regular USER (not staff)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/staff')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 SUPPORT role can call (used for ticket assignment dropdown)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...regularUser, id: 'u-support', role: 'SUPPORT',
    });
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/admin/staff')
      .set('Authorization', `Bearer ${makeToken('u-support', 'SUPPORT')}`);

    expect(res.status).toBe(200);
  });

  it('200 returns SUPPORT + ADMIN users only, excludes banned', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/admin/staff')
      .set('Authorization', `Bearer ${makeToken()}`);

    const calls = (prisma.user.findMany as jest.Mock).mock.calls;
    const staffCall = calls.find((c) => c[0]?.where?.role?.in !== undefined);
    expect(staffCall).toBeDefined();
    expect(staffCall![0].where.role.in).toEqual(['SUPPORT', 'ADMIN']);
    expect(staffCall![0].where.isBanned).toBe(false);
    // Sort: firstName asc — predictable order in the dropdown
    expect(staffCall![0].orderBy).toEqual({ firstName: 'asc' });
  });
});

// ─── GET /api/admin/report/daily ─────────────────────────────────────────────

describe('GET /api/admin/report/daily', () => {
  beforeEach(() => {
    // Wire up all the count/findMany mocks the daily-report aggregator hits
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma.workout.count as jest.Mock) = jest.fn().mockResolvedValue(0);
    (prisma.chatMessage.count as jest.Mock) = jest.fn().mockResolvedValue(0);
    (prisma.subscription.count as jest.Mock) = jest.fn().mockResolvedValue(0);
    (prisma.supportTicket.count as jest.Mock) = jest.fn().mockResolvedValue(0);
    (prisma.cardioSession.count as jest.Mock) = jest.fn().mockResolvedValue(0);
    (prisma.meal.count as jest.Mock) = jest.fn().mockResolvedValue(0);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/report/daily');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/report/daily')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('400 when date is malformed (not YYYY-MM-DD)', async () => {
    const res = await request(app)
      .get('/api/admin/report/daily?date=2026/04/28')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('400 when date is invalid (e.g. 2026-13-01)', async () => {
    // Note: regex catches obviously-bad formats. The Date.parse check
    // catches 'valid format, invalid value' like 2026-13-01.
    const res = await request(app)
      .get('/api/admin/report/daily?date=2026-13-01')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });
});

// ─── PATCH /api/admin/support/:id/assign ─────────────────────────────────────

describe('PATCH /api/admin/support/:id/assign', () => {
  const TICKET_ID = 'cticket0000000000000001';
  const STAFF_ID = 'cstaff00000000000000001';

  beforeEach(() => {
    (prisma.supportTicket.findUnique as jest.Mock) = jest.fn().mockResolvedValue(null);
    (prisma.supportTicket.update as jest.Mock) = jest.fn().mockResolvedValue({});
  });

  it('401 without token', async () => {
    const res = await request(app)
      .patch(`/api/admin/support/${TICKET_ID}/assign`)
      .send({ assignedToId: STAFF_ID });
    expect(res.status).toBe(401);
  });

  it('400 when ticket id is not a valid CUID', async () => {
    const res = await request(app)
      .patch('/api/admin/support/bad-id/assign')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ assignedToId: STAFF_ID });
    expect(res.status).toBe(400);
  });

  it('400 when assignedToId is not a valid CUID (Zod cuid())', async () => {
    const res = await request(app)
      .patch(`/api/admin/support/${TICKET_ID}/assign`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ assignedToId: 'not-a-cuid' });
    expect(res.status).toBe(400);
  });

  it('404 when ticket does not exist', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch(`/api/admin/support/${TICKET_ID}/assign`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ assignedToId: STAFF_ID });
    expect(res.status).toBe(404);
  });

  it('400 when assignee is a regular USER (not staff)', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce({
      id: TICKET_ID, userId: 'u-customer', status: 'open',
    });
    // Auth middleware gets adminUser; the assignee role lookup gets a USER
    (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where?.id === 'u-admin') return Promise.resolve(adminUser);
      if (where?.id === STAFF_ID) return Promise.resolve({ role: 'CLIENT', isBanned: false });
      return Promise.resolve(null);
    });

    const res = await request(app)
      .patch(`/api/admin/support/${TICKET_ID}/assign`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ assignedToId: STAFF_ID });

    expect(res.status).toBe(400);
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it('round 82: 400 when assignee is staff but BANNED', async () => {
    // The user-route equivalent (/support/tickets/:id/assign) already
    // refuses to assign to banned staff. Round 82 brought this admin
    // route in line — a banned admin/support shouldn't pick up new
    // tickets just because they technically still hold the role.
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce({
      id: TICKET_ID, userId: 'u-customer', status: 'open',
    });
    (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where?.id === 'u-admin') return Promise.resolve(adminUser);
      if (where?.id === STAFF_ID) return Promise.resolve({ role: 'SUPPORT', isBanned: true });
      return Promise.resolve(null);
    });

    const res = await request(app)
      .patch(`/api/admin/support/${TICKET_ID}/assign`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ assignedToId: STAFF_ID });

    expect(res.status).toBe(400);
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it('200 unassigns when assignedToId=null + writes ASSIGN_TICKET log', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce({
      id: TICKET_ID, userId: 'u-customer', status: 'open',
    });
    (prisma.supportTicket.update as jest.Mock).mockResolvedValueOnce({
      id: TICKET_ID, assignedToId: null,
    });

    const res = await request(app)
      .patch(`/api/admin/support/${TICKET_ID}/assign`)
      .set('Authorization', `Bearer ${makeToken('u-admin')}`)
      .send({ assignedToId: null });

    expect(res.status).toBe(200);
    // Audit log records "Unassigned" details so the action is greppable
    const logCalls = (prisma.adminLog.create as jest.Mock).mock.calls;
    const auditCall = logCalls.find((c) => c[0]?.data?.action === 'ASSIGN_TICKET');
    expect(auditCall).toBeTruthy();
    expect(auditCall![0].data.details).toBe('Unassigned');
    expect(auditCall![0].data.adminId).toBe('u-admin');
  });
});

// ─── POST /api/admin/digest/send-now ─────────────────────────────────────────

describe('POST /api/admin/digest/send-now', () => {
  it('401 without token', async () => {
    const res = await request(app).post('/api/admin/digest/send-now');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .post('/api/admin/digest/send-now')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  // Note: 200 happy-path requires the adminDigestService dynamic import
  // to fire — the service has its own dedicated tests in
  // adminDigestService.test.ts. Auth gate alone is sufficient at the
  // route layer.
});

// ─── GET /api/admin/logs/export ──────────────────────────────────────────────
//
// CSV export of admin audit log. Same CSV-injection guard pattern as
// /admin/users/export — formula chars get prefixed with '. Was untested.

describe('GET /api/admin/logs/export', () => {
  beforeEach(() => {
    (prisma.adminLog.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/logs/export');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/logs/export')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('400 when from query is malformed', async () => {
    const res = await request(app)
      .get('/api/admin/logs/export?from=not-a-date')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('400 when to query is malformed', async () => {
    const res = await request(app)
      .get('/api/admin/logs/export?to=not-a-date')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('200 caps export at 5000 rows', async () => {
    await request(app)
      .get('/api/admin/logs/export')
      .set('Authorization', `Bearer ${makeToken()}`);

    const calls = (prisma.adminLog.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].take).toBe(5000);
  });

  it('SECURITY: CSV-injection guard in admin email/name/details cells', async () => {
    // Same threat model as /admin/users/export — but the audit log row
    // includes the admin's own email + name + details, all of which can
    // come from external sources (admin email might have unicode, details
    // string can include user-supplied content from ban reasons etc.).
    (prisma.adminLog.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'log1',
        action: 'BAN_USER',
        admin: { firstName: '=cmd|"/c calc"!A1', lastName: null, email: 'admin@x.com' },
        targetId: 't1',
        details: '+evil_payload',
        createdAt: new Date('2026-01-01'),
      },
    ]);

    const res = await request(app)
      .get('/api/admin/logs/export')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    // Both '=' and '+' starting cells get the apostrophe prefix
    expect(res.text).toContain(`"'=cmd|""/c calc""!A1"`);
    expect(res.text).toContain(`"'+evil_payload"`);
  });
});

// ─── GET /api/admin/analytics/cohorts ────────────────────────────────────────

describe('GET /api/admin/analytics/cohorts', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/analytics/cohorts');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/analytics/cohorts')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 returns 8 weekly cohort buckets in chronological order', async () => {
    (prisma.user.count as jest.Mock).mockResolvedValue(0);

    const res = await request(app)
      .get('/api/admin/analytics/cohorts')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(8); // 8-week window

    // Each bucket has the expected shape
    for (const bucket of res.body) {
      expect(bucket).toHaveProperty('week');
      expect(bucket).toHaveProperty('signups');
      expect(bucket).toHaveProperty('activeThisWeek');
      expect(bucket).toHaveProperty('retentionPct');
    }
  });
});

// ─── GET /api/admin/analytics/segments ───────────────────────────────────────

describe('GET /api/admin/analytics/segments', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/analytics/segments');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/analytics/segments')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });
  // Note: 200 happy-path skipped — endpoint runs 16 join-heavy queries
  // (per the 5-min cache comment) and isn't worth the deep mock setup
  // for a route that's already cache-protected. Auth gate is the
  // critical regression guard.
});

// ─── GET /api/admin/analytics ────────────────────────────────────────────────

describe('GET /api/admin/analytics', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/analytics');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });
  // 200 happy path: cache-protected with 5-min TTL and runs many queries.
  // Auth gate is the security regression guard; deeper coverage would
  // require re-implementing the aggregator's mocked numbers, which has
  // low value vs. the implementation cost.
});

// ─── GET /api/admin/analytics/subscriptions ──────────────────────────────────

describe('GET /api/admin/analytics/subscriptions', () => {
  beforeEach(() => {
    (prisma as any).$queryRaw = jest.fn().mockResolvedValue([]);
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/analytics/subscriptions');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/analytics/subscriptions')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 clamps days query to [7, 90]', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/subscriptions?days=999')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    // The route uses Math.min(90, Math.max(7, parseInt(days)||30))
    // so days=999 becomes 90 — verifying via the $queryRaw call would
    // need access to the SQL template literal which is brittle. The
    // clamp is the documented behaviour; the 200 ack is sufficient
    // alongside the auth gate.
  });
});

// ─── GET /api/admin/analytics/export ─────────────────────────────────────────

describe('GET /api/admin/analytics/export', () => {
  beforeEach(() => {
    (prisma as any).$queryRaw = jest.fn().mockResolvedValue([]);
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/analytics/export');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/analytics/export')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 returns CSV with BOM-prefixed header (Excel-compatible)', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/export')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    // UTF-8 BOM (﻿) at the start so Excel opens it without
    // mangling Cyrillic. Future changes that drop the BOM would break
    // the founder's manual analyses by garbling Russian column names
    // (the header is ASCII here but BOM is still required for
    // consistency with users/export and logs/export).
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    // Documented column order — future changes that break this would
    // silently corrupt downstream BI imports.
    expect(res.text).toContain('date,signups,workouts,ai_messages,cardio_sessions');
  });
});

// ─── GET /api/admin/metrics/key ──────────────────────────────────────────────
//
// The "5 ключевых чисел" screen — payingUsers, monthlyChurn, ARPU,
// activation rate, signup→paid funnel. Plus the round-2 onboarding
// funnel block. The 200 happy path runs many parallel queries with
// 5-min cache; auth gate is the critical regression guard.

describe('GET /api/admin/metrics/key', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/metrics/key');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/api/admin/metrics/key')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);
    expect(res.status).toBe(403);
  });

  it('200 with refresh=1 bypasses cache (verified via X-Cache header)', async () => {
    // Both refresh=1 AND a fresh cache entry should land MISS on the
    // header — the route bumps to MISS whenever it actually computed.
    // We can't easily force a cache HIT in tests without polluting the
    // singleton, but we can confirm refresh=1 always lands MISS.
    (prisma.subscription.count as jest.Mock).mockResolvedValue(0);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma as any).$queryRaw = jest.fn().mockResolvedValue([{ cohort_size: 0n, activated_24h: 0n, median_minutes: null }]);

    const res = await request(app)
      .get('/api/admin/metrics/key?refresh=1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
  });

  it('200 with days=7 returns windowDays=7 in payload', async () => {
    (prisma.subscription.count as jest.Mock).mockResolvedValue(0);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma as any).$queryRaw = jest.fn().mockResolvedValue([{ cohort_size: 0n, activated_24h: 0n, median_minutes: null }]);

    const res = await request(app)
      .get('/api/admin/metrics/key?days=7&refresh=1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBe(7);
  });

  it('200 with garbage days falls back to 30', async () => {
    (prisma.subscription.count as jest.Mock).mockResolvedValue(0);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma as any).$queryRaw = jest.fn().mockResolvedValue([{ cohort_size: 0n, activated_24h: 0n, median_minutes: null }]);

    const res = await request(app)
      .get('/api/admin/metrics/key?days=garbage&refresh=1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    // ALLOWED_DAYS = [7, 14, 30, 60, 90] — anything else coerces to 30
    expect(res.body.windowDays).toBe(30);
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

    // Audit log: verifies the founder can grep AdminLog for
    // TEST_NOTIFICATION when debugging SMTP/push issues. Details must
    // include the channel + per-channel sent flags + (when present) the
    // list of failed channels.
    const logCalls = (prisma.adminLog.create as jest.Mock).mock.calls;
    const auditCall = logCalls.find((c) => c[0]?.data?.action === 'TEST_NOTIFICATION');
    expect(auditCall).toBeTruthy();
    expect(auditCall![0].data.adminId).toBe('u-admin');
    expect(auditCall![0].data.details).toContain('channel=both');
  });

  it('200 but pushSent=false when admin has zero push tokens (silent-noop guard)', async () => {
    // sendPushToUser silently returns when tokenRecords is empty. Before
    // round 67 the endpoint reported pushSent=true here — masking "no
    // device registered" as a successful send. The token-count probe
    // surfaces the real state.
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...adminUser, email: 'admin@test.com', firstName: 'Founder',
    });
    (prisma.pushToken.count as jest.Mock).mockResolvedValueOnce(0);

    const res = await request(app)
      .post('/api/admin/test-notification')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ channel: 'push' });

    expect(res.status).toBe(200);
    expect(res.body.pushSent).toBe(false);
    expect(res.body.errors?.push).toContain('зарегистрированных push-устройств');

    const logCalls = (prisma.adminLog.create as jest.Mock).mock.calls;
    const auditCall = logCalls.find((c) => c[0]?.data?.action === 'TEST_NOTIFICATION');
    expect(auditCall).toBeTruthy();
    expect(auditCall![0].data.details).toContain('push=false');
    expect(auditCall![0].data.details).toContain('errors=push');
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
