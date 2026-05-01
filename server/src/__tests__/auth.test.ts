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
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    passwordHistory: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    trustedDevice: {
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    usedTotpCode: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    subscription: {
      // Required by subscription.ts webhook stale-event guard — without it
      // `prisma.subscription.findUnique` throws, which bubbles into a 500
      // when this file tests the YuKassa webhook.
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
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

// Mock email service — must include ALL named exports auth.ts imports
jest.mock('../services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedAlert: jest.fn().mockResolvedValue(undefined),
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  sendNewLoginAlert: jest.fn().mockResolvedValue(undefined),
  sendEmailVerification: jest.fn().mockResolvedValue(undefined),
}));

// Mock SMS service — used by send-otp and phone-login routes
jest.mock('../services/smsService', () => ({
  sendSmsOtp: jest.fn().mockResolvedValue(undefined),
  normalizePhone: jest.fn((p: string) => p.replace(/\D/g, '').replace(/^8/, '7')),
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
    (mockPrisma.otpCode as any).count.mockResolvedValue(0);
    (mockPrisma.otpCode as any).updateMany.mockResolvedValue({ count: 1 });
    (mockPrisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.passwordHistory.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.passwordHistory.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.passwordHistory.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.passwordResetToken.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.usedTotpCode as any).findFirst.mockResolvedValue(null);
    (mockPrisma.usedTotpCode as any).create.mockResolvedValue({});
    // Default user.update response covers login attempt increments / lockout resets
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ loginAttempts: 1, lockedUntil: null });
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
      // Register route creates directly and catches P2002 (unique constraint) — no pre-check via findUnique
      (mockPrisma.user.create as jest.Mock).mockRejectedValue({
        code: 'P2002',
        meta: { target: ['email'] },
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

      // Need to mock prisma.subscription for the webhook handler.
      // findUnique is required by the stale-event guard (subscription.ts) —
      // null = no existing sub, so the guard proceeds to the upsert path.
      (mockPrisma as any).subscription = {
        findUnique: jest.fn().mockResolvedValue(null),
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

    it('should reject legacy RevenueCat provider with 410 Gone', async () => {
      const res = await request(app)
        .post('/api/subscription/webhook')
        .set('Content-Type', 'application/json')
        .send({
          provider: 'revenuecat',
          event: 'subscription_activated',
          userId: 'user-1',
          plan: 'pro',
          durationDays: 30,
        });

      // RevenueCat was removed (Apple/Google Play Billing unavailable from RF);
      // incoming legacy webhooks are rejected with 410 Gone.
      expect(res.status).toBe(410);
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

  // ─── Forgot Password ────────────────────────────────────────────────────────

  describe('POST /api/auth/forgot-password', () => {
    it('400 when email format is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('200 with generic message when email is not registered (enumeration protection)', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'unknown@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('письмо отправлено');
    });

    it('200 with same message when recent token already exists (per-email rate limit)', async () => {
      const user = { id: 'u-test', email: 'test@example.com' };
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(user);
      (mockPrisma.passwordResetToken.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'tok-1',
        userId: user.id,
        used: false,
        createdAt: new Date(),
      });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: user.email });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('письмо отправлено');
      // Must NOT create a new token when rate-limited
      expect(mockPrisma.passwordResetToken.create as jest.Mock).not.toHaveBeenCalled();
    });

    it('200 creates reset token for valid registered email', async () => {
      const user = { id: 'u-fresh', email: 'fresh@example.com' };
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(user);
      // No recent token — proceed to create
      (mockPrisma.passwordResetToken.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: user.email });

      expect(res.status).toBe(200);
      expect(mockPrisma.passwordResetToken.create as jest.Mock).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Reset Password ─────────────────────────────────────────────────────────

  describe('POST /api/auth/reset-password', () => {
    it('400 when token is missing', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ password: 'NewPass123' });
      expect(res.status).toBe(400);
    });

    it('400 when password is too weak (no digit)', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'sometoken', password: 'weakpassword' });
      expect(res.status).toBe(400);
    });

    it('400 when token is invalid or already used', async () => {
      (mockPrisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'invalid-token', password: 'NewPass1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('недействительна');
    });

    it('400 when token is expired', async () => {
      (mockPrisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'tok-exp',
        token: 'expired-token',
        userId: 'u-test',
        used: false,
        expiresAt: new Date(Date.now() - 1000), // already expired
        user: { id: 'u-test', email: 'test@example.com', emailVerified: true, passwordHash: null },
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'expired-token', password: 'NewPass1' });

      expect(res.status).toBe(400);
    });

    it('200 resets password with valid token — marks token used, invalidates sessions', async () => {
      const validToken = {
        id: 'tok-valid',
        token: 'abc123validtoken',
        userId: 'u-reset',
        used: false,
        expiresAt: new Date(Date.now() + 3600_000), // 1 hour from now
        user: { id: 'u-reset', email: 'reset@example.com', emailVerified: true, passwordHash: null },
      };
      (mockPrisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValueOnce(validToken);
      // updateMany returns count=1 — token successfully consumed
      (mockPrisma.passwordResetToken.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
      (mockPrisma.$transaction as jest.Mock).mockResolvedValueOnce([{}, { count: 1 }, { count: 1 }]);

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'abc123validtoken', password: 'NewPass1' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('изменён');
    });
  });

  // ─── Reset Password by Phone ────────────────────────────────────────────────
  // Same security bar as reset-password (token-based) but goes through SMS
  // OTP. Was previously untested.

  describe('POST /api/auth/reset-password-by-phone', () => {
    const validBody = { phone: '+79991234567', code: '123456', password: 'NewPass1' };

    it('400 when phone is missing', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password-by-phone')
        .send({ code: '123456', password: 'NewPass1' });
      expect(res.status).toBe(400);
    });

    it('400 when password is too weak', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password-by-phone')
        .send({ ...validBody, password: 'weak' });
      expect(res.status).toBe(400);
    });

    it('400 when no active phone-reset OTP found', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/reset-password-by-phone')
        .send(validBody);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    });

    it('400 INVALID_OTP when code does not match (decrements attempts)', async () => {
      // OTP exists but its `code` is different from the request body.
      // The route increments `attempts` atomically and surfaces
      // "Осталось попыток: N" / INVALID_OTP.
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'otp-bad', phone: '+79991234567', code: '999999',
        purpose: 'phone-reset', used: false, attempts: 0,
        expiresAt: new Date(Date.now() + 600_000),
      });
      (mockPrisma.otpCode.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const res = await request(app)
        .post('/api/auth/reset-password-by-phone')
        .send(validBody);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    });

    it('429 OTP_BRUTEFORCE when attempts cap is hit (atomic gate count=0)', async () => {
      // Sec audit guard: concurrent requests with wrong code can race past
      // the in-memory attempts check. The atomic updateMany.where.attempts
      // < MAX_OTP_ATTEMPTS returns count=0 once the cap is hit, and the
      // route surfaces 429 instead of letting unlimited tries through.
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'otp-locked', phone: '+79991234567', code: '999999',
        purpose: 'phone-reset', used: false, attempts: 5,
        expiresAt: new Date(Date.now() + 600_000),
      });
      (mockPrisma.otpCode.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      const res = await request(app)
        .post('/api/auth/reset-password-by-phone')
        .send(validBody);

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('OTP_BRUTEFORCE');
    });

    it('404 USER_NOT_FOUND when phone is not registered', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'otp-good', phone: '+79991234567', code: '123456',
        purpose: 'phone-reset', used: false, attempts: 0,
        expiresAt: new Date(Date.now() + 600_000),
      });
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/reset-password-by-phone')
        .send(validBody);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('USER_NOT_FOUND');
    });
  });

  // ─── Logout ─────────────────────────────────────────────────────────────────

  // ─── Check email availability ──────────────────────────────────────────────

  describe('POST /api/auth/check-email', () => {
    it('200 { exists: false } when email is not registered', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/check-email')
        .send({ email: 'nobody@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(false);
    });

    it('200 { exists: true, hasPassword: true } for registered email with password', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'u-test',
        passwordHash: '$2b$10$hashedpassword',
        googleId: null,
        vkId: null,
        yandexId: null,
      });

      const res = await request(app)
        .post('/api/auth/check-email')
        .send({ email: 'registered@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(true);
      expect(res.body.hasPassword).toBe(true);
      expect(res.body.hasGoogle).toBe(false);
    });

    it('200 { exists: false } for invalid email format — ZodError caught silently', async () => {
      const res = await request(app)
        .post('/api/auth/check-email')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(false);
    });
  });

  // ─── Check phone availability ──────────────────────────────────────────────

  describe('POST /api/auth/check-phone', () => {
    it('200 { exists: false } when phone is not registered', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/check-phone')
        .send({ phone: '+79991234567' });

      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(false);
    });

    it('200 { exists: true } when phone is registered', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'u-test' });

      const res = await request(app)
        .post('/api/auth/check-phone')
        .send({ phone: '+79991234567' });

      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(true);
    });
  });

  // ─── Email verification ────────────────────────────────────────────────────

  describe('POST /api/auth/verify-email', () => {
    const validOtp = {
      id: 'cotp0000000000000000001',
      code: '654321',
      email: 'user@example.com',
      attempts: 0,
      used: false,
      expiresAt: new Date(Date.now() + 600_000), // expires in 10 min
    };

    it('400 when no active OTP exists for the email', async () => {
      (mockPrisma.otpCode as any).findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ email: 'user@example.com', code: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
    });

    it('400 when submitted code does not match stored OTP', async () => {
      (mockPrisma.otpCode as any).findFirst.mockResolvedValueOnce(validOtp);
      // Wrong code '999999' ≠ '654321' → attempt increment
      (mockPrisma.otpCode as any).updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ email: 'user@example.com', code: '999999' });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
    });

    it('200 marks emailVerified when correct code is submitted', async () => {
      (mockPrisma.otpCode as any).findFirst.mockResolvedValueOnce(validOtp);
      // Correct code '654321' — OTP consumed atomically
      (mockPrisma.otpCode as any).updateMany.mockResolvedValueOnce({ count: 1 }); // consume
      (mockPrisma.user.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'u-test' });

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ email: 'user@example.com', code: '654321' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.emailVerified).toBe(true);

      // user.updateMany must scope to the correct email
      const updateManyCalls = (mockPrisma.user.updateMany as jest.Mock).mock.calls;
      expect(updateManyCalls[0][0].where.email).toBe('user@example.com');
      expect(updateManyCalls[0][0].data.emailVerified).toBe(true);
    });
  });

  // ─── Resend verification email ─────────────────────────────────────────────

  describe('POST /api/auth/resend-verification', () => {
    it('200 with generic message when email is not registered (enumeration protection)', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'nobody@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('письмо отправлено');
    });

    it('200 sends OTP for unverified user (rate limit not reached)', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'u-test',
        emailVerified: false,
      });
      (mockPrisma.otpCode as any).count.mockResolvedValueOnce(0); // no recent OTPs

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'unverified@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('письмо отправлено');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('200 with no body (graceful — session already expired or client lost token)', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Выход');
    });

    it('200 with refresh token — revokes only that token', async () => {
      const fakeRefresh = jwt.sign({ userId: 'u-test' }, process.env.JWT_REFRESH_SECRET!, {
        expiresIn: '30d',
        issuer: 'irongym-api',
        audience: 'irongym-app',
      });

      const res = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: fakeRefresh });

      expect(res.status).toBe(200);
      expect(mockPrisma.refreshToken.updateMany as jest.Mock).toHaveBeenCalled();
    });
  });

  // ── TOTP verify ───────────────────────────────────────────────────────────────

  describe('POST /api/auth/totp-verify', () => {
    beforeEach(() => {
      // mockClear (used by clearMocks:true) does NOT flush the Once queue — reset individually
      (mockPrisma.user.findUnique as jest.Mock).mockReset();
      (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.usedTotpCode as any).findFirst.mockResolvedValue(null);
      (mockPrisma.usedTotpCode as any).create.mockResolvedValue({});
    });

    const JWT_ISS = 'irongym-api';
    const JWT_AUD = 'irongym-app';

    // Helper: mint a pending 2FA token (phase=totp)
    const makePendingToken = (userId = 'u-test') =>
      jwt.sign({ userId, phase: 'totp' }, process.env.JWT_SECRET!, {
        expiresIn: '10m',
        issuer: JWT_ISS,
        audience: JWT_AUD,
      });

    const totpUser = {
      id: 'u-test',
      isBanned: false,
      lockedUntil: null,
      totpEnabled: true,
      totpSecret: 'JBSWY3DPEHPK3PXP', // valid base32
      email: 'user@example.com',
      emailVerified: true,
      passwordHash: '$2b$10$hash',
      googleId: null,
      vkId: null,
      yandexId: null,
      totpBackupCodes: '[]',
      healthRestrictions: [],
    };

    it('400 when neither code nor backupCode provided', async () => {
      const res = await request(app)
        .post('/api/auth/totp-verify')
        .send({ pendingToken: makePendingToken() });

      expect(res.status).toBe(400);
    });

    it('401 with expired or invalid pendingToken', async () => {
      const res = await request(app)
        .post('/api/auth/totp-verify')
        .send({ pendingToken: 'not.a.valid.jwt', code: '123456' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PENDING_TOKEN_EXPIRED');
    });

    it('401 with wrong phase in pendingToken', async () => {
      const wrongPhaseToken = jwt.sign({ userId: 'u-test', phase: 'login' }, process.env.JWT_SECRET!, {
        expiresIn: '10m',
        issuer: JWT_ISS,
        audience: JWT_AUD,
      });

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(totpUser);

      const res = await request(app)
        .post('/api/auth/totp-verify')
        .send({ pendingToken: wrongPhaseToken, code: '123456' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('200 validates TOTP code and returns tokens (TOTP mock always returns delta=0)', async () => {
      // TOTP.validate mock in __mocks__/otpauth.ts returns 0 (non-null) for any token
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(totpUser);
      (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValueOnce({ token: 'rt-new' });

      const res = await request(app)
        .post('/api/auth/totp-verify')
        .send({ pendingToken: makePendingToken(), code: '000000' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.totpSecret).toBeUndefined(); // stripped from response
    });

    it('403 for banned user', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
        ...totpUser,
        isBanned: true,
      });

      const res = await request(app)
        .post('/api/auth/totp-verify')
        .send({ pendingToken: makePendingToken(), code: '000000' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('BANNED');
    });
  });

  // ── Send OTP ──────────────────────────────────────────────────────────────────

  describe('POST /api/auth/send-otp', () => {
    beforeEach(() => {
      (mockPrisma.user.findUnique as jest.Mock).mockReset();
      (mockPrisma.otpCode as any).findFirst.mockResolvedValue(null);
      (mockPrisma.otpCode as any).count.mockResolvedValue(0);
      (mockPrisma.otpCode as any).updateMany.mockResolvedValue({ count: 1 });
      (mockPrisma.otpCode as any).create.mockResolvedValue({});
    });

    it('400 when neither phone nor email provided', async () => {
      const res = await request(app)
        .post('/api/auth/send-otp')
        .send({ purpose: 'register' });

      expect(res.status).toBe(400);
    });

    it('404 for phone-login when phone is not registered', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/send-otp')
        .send({ phone: '+79991234567', purpose: 'phone-login' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PHONE_NOT_FOUND');
    });

    it('409 for register when phone is already taken', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'u-existing' });

      const res = await request(app)
        .post('/api/auth/send-otp')
        .send({ phone: '+79991234567', purpose: 'register' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PHONE_TAKEN');
    });

    it('429 when OTP was sent less than 60 seconds ago (cooldown)', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'otp-1',
        createdAt: new Date(Date.now() - 10_000), // 10 seconds ago
      });

      const res = await request(app)
        .post('/api/auth/send-otp')
        .send({ email: 'user@example.com', purpose: 'email-verify' });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('OTP_COOLDOWN');
      expect(res.body.secondsLeft).toBeGreaterThan(0);
    });

    it('200 sends OTP to email successfully', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce(null); // no cooldown
      (mockPrisma.otpCode.count as jest.Mock).mockResolvedValueOnce(0); // under rate limit
      (mockPrisma.otpCode.create as jest.Mock).mockResolvedValueOnce({});

      const res = await request(app)
        .post('/api/auth/send-otp')
        .send({ email: 'user@example.com', purpose: 'email-verify' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('user@example.com');
    });
  });

  // ── Verify OTP ────────────────────────────────────────────────────────────────

  describe('POST /api/auth/verify-otp', () => {
    beforeEach(() => {
      (mockPrisma.otpCode as any).findFirst.mockResolvedValue(null);
      (mockPrisma.otpCode as any).updateMany.mockReset();
      (mockPrisma.otpCode as any).updateMany.mockResolvedValue({ count: 1 });
    });

    const validOtp = {
      id: 'cotp0000000000000000001',
      code: '654321',
      attempts: 0,
      used: false,
      expiresAt: new Date(Date.now() + 600_000),
    };

    it('400 when no active OTP found', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'user@example.com', code: '654321', purpose: 'email-verify' });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
    });

    it('400 for wrong code with attempt tracking', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce({ ...validOtp, code: '111111' });
      (mockPrisma.otpCode.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 }); // increment succeeded

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'user@example.com', code: '999999', purpose: 'email-verify' });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
    });

    it('200 for correct code — marks used for non-register purposes', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce(validOtp);
      (mockPrisma.otpCode.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 }); // consume

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'user@example.com', code: '654321', purpose: 'email-verify' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });

    it('200 for correct code — does NOT mark used for register purpose (consumed later by /register)', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce(validOtp);

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ phone: '+79991234567', code: '654321', purpose: 'register' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      // updateMany (consume) should NOT be called for register purpose
      expect(mockPrisma.otpCode.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { used: true } }),
      );
    });
  });

  // ── Login by phone ────────────────────────────────────────────────────────────

  describe('POST /api/auth/login-by-phone', () => {
    beforeEach(() => {
      (mockPrisma.user.findUnique as jest.Mock).mockReset();
      (mockPrisma.otpCode as any).findFirst.mockReset();
      (mockPrisma.otpCode as any).updateMany.mockReset();
      (mockPrisma.otpCode as any).updateMany.mockResolvedValue({ count: 1 });
      (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    });

    const phoneUser = {
      id: 'u-phone',
      phone: '79991234567',
      email: null,
      emailVerified: false,
      isBanned: false,
      lockedUntil: null,
      passwordHash: null,
      googleId: null,
      vkId: null,
      yandexId: null,
      totpSecret: null,
      totpBackupCodes: null,
      healthRestrictions: [],
    };

    const activeOtp = {
      id: 'cotp0000000000000000099',
      code: '654321',
      attempts: 0,
      used: false,
      expiresAt: new Date(Date.now() + 600_000),
    };

    it('400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login-by-phone')
        .send({ phone: '+79991234567' }); // missing code

      expect(res.status).toBe(400);
    });

    it('400 when no active OTP found for this phone', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/login-by-phone')
        .send({ phone: '+79991234567', code: '654321' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    });

    it('400 for wrong OTP code (attempts tracked)', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce({ ...activeOtp, code: '111111' });
      (mockPrisma.otpCode.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 }); // increment

      const res = await request(app)
        .post('/api/auth/login-by-phone')
        .send({ phone: '+79991234567', code: '999999' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    });

    it('200 logs in successfully with correct OTP', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce(activeOtp);
      (mockPrisma.otpCode.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 }); // consume
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(phoneUser);
      (mockPrisma.user.update as jest.Mock).mockResolvedValueOnce(phoneUser);
      (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValueOnce({ token: 'rt-new' });

      const res = await request(app)
        .post('/api/auth/login-by-phone')
        .send({ phone: '+79991234567', code: '654321' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.passwordHash).toBeUndefined(); // stripped
    });

    it('403 for banned user', async () => {
      (mockPrisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce(activeOtp);
      (mockPrisma.otpCode.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ ...phoneUser, isBanned: true });

      const res = await request(app)
        .post('/api/auth/login-by-phone')
        .send({ phone: '+79991234567', code: '654321' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('BANNED');
    });
  });
});
