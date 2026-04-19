/**
 * Tests for the authenticate middleware and protected-route access control.
 *
 * Covers:
 * - Missing / malformed Authorization header → 401
 * - Tampered or expired access token → 401
 * - Valid token for active user → next() called
 * - Valid token for banned user → 403 with BANNED code
 * - Valid token for locked user → 429 with ACCOUNT_LOCKED code
 * - Valid token for non-existent user → 401
 * - requireAdmin / requireStaff role enforcement
 */

jest.mock('../db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    refreshToken: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    securityEvent: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    otpCode: { findFirst: jest.fn().mockResolvedValue(null) },
    passwordHistory: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (ops: any[]) =>
      Promise.all(ops.map((op: any) => (typeof op?.then === 'function' ? op : Promise.resolve(op))))
    ),
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../services/newsRefreshService', () => ({
  startNewsRefreshScheduler: jest.fn(),
}));

jest.mock('../utils/activityTracker', () => ({
  recordActivity: jest.fn(),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';
import { prisma } from '../db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(userId: string, expiresIn: string = '15m') {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: expiresIn as any, issuer: 'irongym-api', audience: 'irongym-app' },
  );
}

describe('Authentication Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.refreshToken.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({});
  });

  describe('Missing / invalid Authorization header', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/user/profile');
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should return 401 when Authorization header does not start with Bearer', async () => {
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      expect(res.status).toBe(401);
    });

    it('should return 401 for an expired access token', async () => {
      const expired = jwt.sign(
        { userId: 'u1' },
        JWT_SECRET,
        { expiresIn: '-1s', issuer: 'irongym-api', audience: 'irongym-app' },
      );
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
    });

    it('should return 401 for a token signed with the wrong secret', async () => {
      const tampered = jwt.sign(
        { userId: 'u1' },
        'wrong-secret',
        { expiresIn: '15m', issuer: 'irongym-api', audience: 'irongym-app' },
      );
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${tampered}`);
      expect(res.status).toBe(401);
    });

    it('should return 401 for a completely malformed token string', async () => {
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', 'Bearer not.a.jwt');
      expect(res.status).toBe(401);
    });
  });

  describe('Valid token — user state checks', () => {
    it('should return 401 when user does not exist in DB', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const token = makeToken('ghost-user');
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/не найден/i);
    });

    it('should return 403 with BANNED code for a banned user', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1', isBanned: true, role: 'USER', lockedUntil: null,
      });
      const token = makeToken('u1');
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('BANNED');
    });

    it('should return 429 with ACCOUNT_LOCKED code for a temporarily locked user', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        isBanned: false,
        role: 'USER',
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // locked for 10 minutes
      });
      const token = makeToken('u1');
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('ACCOUNT_LOCKED');
    });

    it('should pass through for an active user with valid token', async () => {
      (mockPrisma.user.findUnique as jest.Mock)
        // First call: authenticate middleware (checks ban/lock)
        .mockResolvedValueOnce({ id: 'u1', isBanned: false, role: 'USER', lockedUntil: null })
        // Second call: GET /user/profile fetching full profile
        .mockResolvedValueOnce({
          id: 'u1', email: 'test@example.com', firstName: 'Ivan',
          role: 'USER', isBanned: false, lockedUntil: null,
          healthRestrictions: [], goal: null, fitnessLevel: null,
        });

      const token = makeToken('u1');
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${token}`);

      // Should NOT be 401/403/429 — auth passed
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(429);
    });
  });

  describe('requireAdmin middleware', () => {
    it('should return 403 when regular user accesses an admin endpoint', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1', isBanned: false, role: 'USER', lockedUntil: null,
      });
      const token = makeToken('u1');
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });
});

describe('Auth edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.refreshToken.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({});
    (mockPrisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({});
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.securityEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.passwordHistory.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('should reject login for a banned account', async () => {
    const hash = require('bcryptjs').hashSync('SecurePass123', 10);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'banned@example.com',
      passwordHash: hash,
      isBanned: true,
      isLocked: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      healthRestrictions: [],
      loginAttempts: 0,
      totpEnabled: false,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'banned@example.com', password: 'SecurePass123' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BANNED');
  });

  it('should reject login for a locked account', async () => {
    const hash = require('bcryptjs').hashSync('SecurePass123', 10);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'locked@example.com',
      passwordHash: hash,
      isBanned: false,
      lockedUntil: new Date(Date.now() + 5 * 60 * 1000), // locked for 5 more minutes
      healthRestrictions: [],
      loginAttempts: 5,
      totpEnabled: false,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'locked@example.com', password: 'SecurePass123' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('should respond with requiresTOTP for TOTP-enabled accounts', async () => {
    const hash = require('bcryptjs').hashSync('SecurePass123', 10);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'totp@example.com',
      passwordHash: hash,
      isBanned: false,
      lockedUntil: null,
      loginAttempts: 0,
      healthRestrictions: [],
      totpEnabled: true,
      totpSecret: 'JBSWY3DPEHPK3PXP', // fake secret
      trustedDevices: [],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'totp@example.com', password: 'SecurePass123' });

    expect(res.status).toBe(200);
    expect(res.body.requiresTOTP).toBe(true);
    expect(res.body.pendingToken).toBeDefined();
    // pendingToken should be a valid JWT
    const decoded = jwt.verify(res.body.pendingToken, JWT_SECRET) as any;
    expect(decoded.userId).toBe('u1');
    expect(decoded.phase).toBe('totp');
  });

  it('should reject login with social-only account (no passwordHash)', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'social@example.com',
      passwordHash: null,
      isBanned: false,
      lockedUntil: null,
      loginAttempts: 0,
      healthRestrictions: [],
      totpEnabled: false,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'social@example.com', password: 'AnyPass123' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SOCIAL_ONLY');
  });

  it('should reject the refresh token if it does not exist in DB', async () => {
    const refreshToken = jwt.sign(
      { userId: 'u1' },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: '30d', issuer: 'irongym-api', audience: 'irongym-app' },
    );
    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/не найден/i);
  });

  it('should trigger token reuse detection when revoked token is presented', async () => {
    const refreshToken = jwt.sign(
      { userId: 'u1' },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: '30d', issuer: 'irongym-api', audience: 'irongym-app' },
    );
    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rt-1',
      token: refreshToken,
      userId: 'u1',
      revoked: true, // already revoked — reuse!
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    // trustedDevice mock for deleteMany call
    (mockPrisma as any).trustedDevice = { deleteMany: jest.fn().mockResolvedValue({}) };

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_REUSE');
  });
});
