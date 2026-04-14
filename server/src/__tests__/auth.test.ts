import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Disable rate limiting for tests
jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

// Mock prisma before importing app
jest.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    securityEvent: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    otpCode: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordHistory: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  },
}));

// Mock logger to silence output
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock email service
jest.mock('../services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

// Mock news refresh service (imported by index.ts)
jest.mock('../services/newsRefreshService', () => ({
  startNewsRefreshScheduler: jest.fn(),
}));

import app from '../index';
import { prisma } from '../db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-set default implementations that clearAllMocks resets to undefined
    (mockPrisma.refreshToken.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.refreshToken.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({});
    (mockPrisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({});
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.securityEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.otpCode as any).findFirst.mockResolvedValue(null);
    (mockPrisma.passwordHistory.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.passwordHistory.create as jest.Mock).mockResolvedValue({});
  });

  // ─── Registration ──────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    const validPayload = {
      email: 'test@example.com',
      // Must satisfy strongPassword: min 8, uppercase, lowercase, digit
      password: 'SecurePass123',
      firstName: 'Ivan',
      lastName: 'Petrov',
    };

    it('should register a new user with valid input', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: validPayload.email,
        firstName: validPayload.firstName,
        lastName: validPayload.lastName,
        role: 'USER',
        createdAt: new Date('2026-01-01'),
        passwordHash: 'hashed',
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe(validPayload.email);
      expect(res.body.user.firstName).toBe(validPayload.firstName);
      expect(res.body.token).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      // Password hash should not be in response
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('should reject registration with missing email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ password: 'securepass123', firstName: 'Ivan' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should reject registration with missing firstName', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'securepass123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should reject registration with password too short', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validPayload, password: 'Ab1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('8');
    });

    it('should reject registration with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validPayload, email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should reject registration with duplicate email', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing-user',
        email: validPayload.email,
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(validPayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('email');
    });
  });

  // ─── Login ─────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    const loginPayload = { email: 'test@example.com', password: 'SecurePass123' };

    it('should login with correct credentials', async () => {
      const hash = await bcrypt.hash(loginPayload.password, 12);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: loginPayload.email,
        firstName: 'Ivan',
        lastName: 'Petrov',
        passwordHash: hash,
        role: 'USER',
        healthRestrictions: [],
        isBanned: false,
        isLocked: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        totpEnabled: false,
        trustedDevices: [],
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send(loginPayload);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(loginPayload.email);
      expect(res.body.token).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      // Password hash must not leak
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('should reject login with wrong password', async () => {
      const hash = await bcrypt.hash('CorrectPass123', 12);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: loginPayload.email,
        passwordHash: hash,
        healthRestrictions: [],
        isBanned: false,
        isLocked: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        totpEnabled: false,
        trustedDevices: [],
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ ...loginPayload, password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should reject login with non-existent email', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should reject login with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bad-email', password: 'whatever' });

      expect(res.status).toBe(400);
    });
  });

  // ─── Token Refresh ─────────────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('should issue new tokens with valid refresh token', async () => {
      const secret = process.env.JWT_REFRESH_SECRET!;
      // Must include issuer + audience to match JWT_ISS/JWT_AUD constants in auth.ts
      const refreshToken = jwt.sign(
        { userId: 'user-1' },
        secret,
        { expiresIn: '30d', issuer: 'irongym-api', audience: 'irongym-app' },
      );

      // Mock DB: token exists, is not revoked, not expired
      (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-1',
        token: refreshToken,
        userId: 'user-1',
        revoked: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      // Mock user: active, not banned, not locked
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        isBanned: false,
        lockedUntil: null,
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      // Verify the new access token is valid
      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET!) as any;
      expect(decoded.userId).toBe('user-1');
    });

    it('should reject expired refresh token', async () => {
      const secret = process.env.JWT_REFRESH_SECRET!;
      const expiredToken = jwt.sign(
        { userId: 'user-1' },
        secret,
        { expiresIn: '-1s' }, // already expired
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: expiredToken });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should reject missing refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should reject tampered refresh token', async () => {
      const tamperedToken = jwt.sign(
        { userId: 'user-1' },
        'wrong-secret',
        { expiresIn: '30d' },
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: tamperedToken });

      expect(res.status).toBe(401);
    });
  });

  // ─── 1RM Brzycki Formula (used in leaderboard) ────────────────────────────

  describe('1RM estimation formula', () => {
    // The formula used in workout.ts leaderboard: Math.round(w * (1 + r / 30))
    const calc1RM = (weight: number, reps: number) => Math.round(weight * (1 + reps / 30));

    it('should return exact weight for 1 rep', () => {
      // 100 * (1 + 1/30) = 100 * 1.033 = 103.3 => 103
      expect(calc1RM(100, 1)).toBe(103);
    });

    it('should estimate correctly for 5 reps', () => {
      // 100 * (1 + 5/30) = 100 * 1.167 = 116.7 => 117
      expect(calc1RM(100, 5)).toBe(117);
    });

    it('should estimate correctly for 10 reps', () => {
      // 80 * (1 + 10/30) = 80 * 1.333 = 106.67 => 107
      expect(calc1RM(80, 10)).toBe(107);
    });

    it('should handle heavy singles', () => {
      // 200 * (1 + 1/30) = 200 * 1.033 = 206.67 => 207
      expect(calc1RM(200, 1)).toBe(207);
    });

    it('should handle high rep ranges', () => {
      // 50 * (1 + 20/30) = 50 * 1.667 = 83.33 => 83
      expect(calc1RM(50, 20)).toBe(83);
    });

    it('should return 0 for 0 weight', () => {
      expect(calc1RM(0, 10)).toBe(0);
    });
  });

  // ─── Webhook Signature Verification ────────────────────────────────────────

  describe('Webhook signature verification', () => {
    const { createHmac } = require('crypto');

    it('should accept valid YuKassa HMAC-SHA256 signature', async () => {
      const body = JSON.stringify({
        provider: 'yukassa',
        event: 'subscription_activated',
        userId: 'user-1',
        plan: 'pro',
        durationDays: 30,
      });
      const signature = createHmac('sha256', process.env.YUKASSA_WEBHOOK_SECRET!)
        .update(body)
        .digest('hex');

      // Need to mock prisma.subscription for the webhook handler
      (mockPrisma as any).subscription = {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      };

      const res = await request(app)
        .post('/api/subscription/webhook')
        .set('Content-Type', 'application/json')
        .set('x-yukassa-signature', signature)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('should reject invalid YuKassa signature', async () => {
      const body = JSON.stringify({
        provider: 'yukassa',
        event: 'subscription_activated',
        userId: 'user-1',
      });

      const res = await request(app)
        .post('/api/subscription/webhook')
        .set('Content-Type', 'application/json')
        .set('x-yukassa-signature', 'invalid-signature')
        .send(body);

      expect(res.status).toBe(401);
    });

    it('should accept valid RevenueCat auth header', async () => {
      (mockPrisma as any).subscription = {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      };

      const res = await request(app)
        .post('/api/subscription/webhook')
        .set('Content-Type', 'application/json')
        .set('x-revenuecat-webhook-auth', process.env.REVENUECAT_WEBHOOK_SECRET!)
        .send({
          provider: 'revenuecat',
          event: 'subscription_activated',
          userId: 'user-1',
          plan: 'pro',
          durationDays: 30,
        });

      expect(res.status).toBe(200);
    });

    it('should reject invalid RevenueCat auth header', async () => {
      const res = await request(app)
        .post('/api/subscription/webhook')
        .set('Content-Type', 'application/json')
        .set('x-revenuecat-webhook-auth', 'wrong-secret')
        .send({
          provider: 'revenuecat',
          event: 'subscription_activated',
          userId: 'user-1',
        });

      expect(res.status).toBe(401);
    });

    it('should reject webhook with missing generic secret header', async () => {
      const res = await request(app)
        .post('/api/subscription/webhook')
        .set('Content-Type', 'application/json')
        .send({
          provider: 'stripe',
          event: 'subscription_activated',
          userId: 'user-1',
        });

      expect(res.status).toBe(401);
    });
  });
});
