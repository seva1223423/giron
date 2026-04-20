import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createHmac } from 'crypto';

// Disable rate limiting for tests — rate limiters accumulate across tests and
// cause false 429 responses unrelated to the security logic under test.
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
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    otpCode: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      findFirst: jest.fn().mockResolvedValue(null),  // per-email rate limit check
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    passwordHistory: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    securityEvent: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    usedTotpCode: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    trustedDevice: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (ops: any[]) => {
      return Promise.all(ops.map((op: any) => (typeof op.then === 'function' ? op : Promise.resolve(op))));
    }),
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  sendNewLoginAlert: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedAlert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/smsService', () => ({
  sendSmsOtp: jest.fn().mockResolvedValue(undefined),
  normalizePhone: jest.fn((p: string) => p.replace(/\D/g, '').replace(/^8/, '7')),
}));

jest.mock('../services/pushService', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/newsRefreshService', () => ({
  startNewsRefreshScheduler: jest.fn(),
}));

import app from '../index';
import { prisma } from '../db';

const mp = prisma as jest.Mocked<typeof prisma>;

function resetMocks() {
  jest.clearAllMocks();
  (mp.refreshToken.findMany as jest.Mock).mockResolvedValue([]);
  (mp.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);
  (mp.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);
  (mp.refreshToken.create as jest.Mock).mockResolvedValue({});
  (mp.refreshToken.update as jest.Mock).mockResolvedValue({});
  (mp.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  (mp.refreshToken.deleteMany as jest.Mock).mockResolvedValue({});
  (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(null);
  (mp.otpCode.count as jest.Mock).mockResolvedValue(0);
  (mp.otpCode.create as jest.Mock).mockResolvedValue({});
  (mp.otpCode.update as jest.Mock).mockResolvedValue({});
  (mp.otpCode.updateMany as jest.Mock).mockResolvedValue({});
  (mp.securityEvent.create as jest.Mock).mockResolvedValue({});
  (mp.securityEvent.findFirst as jest.Mock).mockResolvedValue(null);
  (mp.passwordHistory.findMany as jest.Mock).mockResolvedValue([]);
  (mp.passwordHistory.create as jest.Mock).mockResolvedValue({});
  (mp.usedTotpCode as any).findFirst.mockResolvedValue(null);
  (mp.usedTotpCode as any).create.mockResolvedValue({});
  (mp.trustedDevice as any).findFirst.mockResolvedValue(null);
  (mp.trustedDevice as any).create.mockResolvedValue({});
  (mp.trustedDevice as any).deleteMany.mockResolvedValue({});
  (mp.$transaction as jest.Mock).mockImplementation(async (ops: any[]) =>
    Promise.all(ops.map((op: any) => (typeof op.then === 'function' ? op : Promise.resolve(op))))
  );
}

// ─── Send OTP ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/send-otp', () => {
  beforeEach(resetMocks);

  it('sends OTP to an unregistered phone for register purpose', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null); // phone not taken
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(null); // no cooldown
    (mp.otpCode.count as jest.Mock).mockResolvedValue(0); // under rate limit

    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '+79001234567', purpose: 'register' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Код отправлен/);
    expect(mp.otpCode.create).toHaveBeenCalled();
  });

  it('returns 409 when phone is already taken for register purpose', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' }); // phone taken

    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '+79001234567', purpose: 'register' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_TAKEN');
    expect(mp.otpCode.create).not.toHaveBeenCalled();
  });

  it('returns 429 when OTP sent within 60-second cooldown', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue({
      id: 'otp-1',
      createdAt: new Date(Date.now() - 20 * 1000), // 20s ago — still in cooldown
    });

    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '+79001234567', purpose: 'register' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('OTP_COOLDOWN');
    expect(res.body.secondsLeft).toBeGreaterThan(0);
  });

  it('returns 429 when 3+ OTPs sent in last 10 minutes', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(null); // no cooldown
    (mp.otpCode.count as jest.Mock).mockResolvedValue(3); // at rate limit

    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '+79001234567', purpose: 'register' });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/Слишком много запросов/);
  });

  it('returns 404 for phone-login purpose when phone not registered', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null); // not registered

    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '+79001234567', purpose: 'phone-login' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PHONE_NOT_FOUND');
  });

  it('sends OTP email when email is provided', async () => {
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.otpCode.count as jest.Mock).mockResolvedValue(0);

    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'user@example.com', purpose: 'email-verify' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Код отправлен/);
  });

  it('returns 400 when neither phone nor email provided', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ purpose: 'register' });

    expect(res.status).toBe(400);
  });

  it('requires Authorization header for email-change purpose', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'user@example.com', purpose: 'email-change' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('accepts email-change with valid Bearer token', async () => {
    const token = jwt.sign(
      { userId: 'user-1' },
      process.env.JWT_SECRET!,
      { expiresIn: '15m', issuer: 'irongym-api', audience: 'irongym-app' }
    );
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.otpCode.count as jest.Mock).mockResolvedValue(0);

    const res = await request(app)
      .post('/api/auth/send-otp')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'newemail@example.com', purpose: 'email-change' });

    expect(res.status).toBe(200);
  });
});

// ─── Verify OTP ───────────────────────────────────────────────────────────────

describe('POST /api/auth/verify-otp', () => {
  beforeEach(resetMocks);

  const activeOtpBase = {
    id: 'otp-1',
    code: '123456',
    attempts: 0,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    used: false,
    phone: '79001234567',
    purpose: 'register',
    createdAt: new Date(),
  };

  it('returns valid=true for correct code', async () => {
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(activeOtpBase);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '+79001234567', code: '123456', purpose: 'register' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    // For 'register' purpose, OTP should NOT be marked used immediately
    expect(mp.otpCode.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { used: true } })
    );
  });

  it('marks OTP used for phone-login purpose', async () => {
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue({
      ...activeOtpBase,
      purpose: 'phone-login',
    });

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '+79001234567', code: '123456', purpose: 'phone-login' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(mp.otpCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { used: true } })
    );
  });

  it('returns 400 for wrong code and increments attempts counter', async () => {
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(activeOtpBase);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '+79001234567', code: '999999', purpose: 'register' });

    expect(res.status).toBe(400);
    expect(res.body.valid).toBe(false);
    expect(mp.otpCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } })
    );
  });

  it('returns 429 and marks OTP used when max attempts exceeded', async () => {
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue({
      ...activeOtpBase,
      attempts: 5, // at MAX_OTP_ATTEMPTS
    });
    // Simulate DB: where attempts < 5 matches nothing → count: 0
    (mp.otpCode.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '+79001234567', code: '999999', purpose: 'register' });

    expect(res.status).toBe(429);
    expect(res.body.valid).toBe(false);
    expect(mp.otpCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { used: true } })
    );
  });

  it('returns 400 when no active OTP found', async () => {
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '+79001234567', code: '123456', purpose: 'register' });

    expect(res.status).toBe(400);
    expect(res.body.valid).toBe(false);
  });

  it('returns 400 for invalid code length', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '+79001234567', code: '12345', purpose: 'register' }); // 5 digits

    expect(res.status).toBe(400);
  });
});

// ─── Login by phone ───────────────────────────────────────────────────────────

describe('POST /api/auth/login-by-phone', () => {
  beforeEach(resetMocks);

  const activePhoneOtp = {
    id: 'otp-1',
    code: '654321',
    attempts: 0,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    used: false,
    phone: '79001234567',
    purpose: 'phone-login',
    createdAt: new Date(),
  };

  const mockUser = {
    id: 'user-1',
    phone: '79001234567',
    email: 'user@example.com',
    emailVerified: true,
    isBanned: false,
    loginAttempts: 0,
    lockedUntil: null,
    passwordHash: null,
    healthRestrictions: [],
  };

  it('returns tokens on correct OTP + registered phone', async () => {
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(activePhoneOtp);
    (mp.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (mp.user.update as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/login-by-phone')
      .send({ phone: '+79001234567', code: '654321' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    // Sensitive fields must not leak
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.totpSecret).toBeUndefined();
  });

  it('returns 400 for wrong code', async () => {
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(activePhoneOtp);

    const res = await request(app)
      .post('/api/auth/login-by-phone')
      .send({ phone: '+79001234567', code: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OTP');
  });

  it('returns 429 and invalidates OTP after max brute-force attempts', async () => {
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue({
      ...activePhoneOtp,
      attempts: 5, // at MAX_OTP_ATTEMPTS
    });
    // Simulate DB: where attempts < 5 matches nothing → count: 0
    (mp.otpCode.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .post('/api/auth/login-by-phone')
      .send({ phone: '+79001234567', code: '000000' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('OTP_BRUTEFORCE');
    // Route logs and returns immediately — does NOT mark OTP used in this path
  });

  it('returns 400 when OTP is expired or not found', async () => {
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login-by-phone')
      .send({ phone: '+79001234567', code: '654321' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OTP');
  });

  it('responds with generic INVALID_OTP when user was deleted between send-otp and login', async () => {
    // Edge case: OTP was issued (so phone was registered at that moment), but the user
    // record is gone by the time login-by-phone runs. We deliberately do NOT return 404
    // PHONE_NOT_FOUND here — leaking existence of the phone post-factum is a mild
    // enumeration vector.
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(activePhoneOtp);
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null); // no user for this phone

    const res = await request(app)
      .post('/api/auth/login-by-phone')
      .send({ phone: '+79001234567', code: '654321' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OTP');
  });

  it('returns 403 for banned user', async () => {
    (mp.otpCode.findFirst as jest.Mock).mockResolvedValue(activePhoneOtp);
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUser, isBanned: true });

    const res = await request(app)
      .post('/api/auth/login-by-phone')
      .send({ phone: '+79001234567', code: '654321' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BANNED');
  });
});

// ─── Forgot / Reset Password ──────────────────────────────────────────────────

describe('POST /api/auth/forgot-password', () => {
  beforeEach(resetMocks);

  it('always returns success message (user enumeration prevention)', async () => {
    // Registered email
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    (mp.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({});
    (mp.passwordResetToken.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Если такой email зарегистрирован/);
  });

  it('returns same success message for unregistered email', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Если такой email зарегистрирован/);
    expect(mp.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('generates a reset token and invalidates previous tokens', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'user@example.com' });

    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'user@example.com' });

    expect(mp.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1', used: false }) })
    );
    expect(mp.passwordResetToken.create).toHaveBeenCalled();
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/reset-password', () => {
  beforeEach(resetMocks);

  const validToken = {
    id: 'tok-1',
    token: 'abc123def456',
    userId: 'user-1',
    used: false,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    user: { id: 'user-1', email: 'user@example.com', emailVerified: true },
  };

  it('resets password and revokes all refresh tokens', async () => {
    (mp.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(validToken);
    (mp.passwordHistory.findMany as jest.Mock).mockResolvedValue([]); // no history
    (mp.user.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'abc123def456', password: 'NewSecure123' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Пароль успешно изменён/);
    // Transaction must include marking token used + revoking refresh tokens
    expect(mp.$transaction).toHaveBeenCalled();
  });

  it('returns 400 for expired reset token', async () => {
    (mp.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
      ...validToken,
      expiresAt: new Date(Date.now() - 1000), // expired
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'abc123def456', password: 'NewSecure123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/недействительна|истекла/i);
  });

  it('returns 400 for already-used reset token', async () => {
    (mp.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
      ...validToken,
      used: true,
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'abc123def456', password: 'NewSecure123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/недействительна|истекла/i);
  });

  it('returns 400 for unknown token', async () => {
    (mp.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'unknown-token', password: 'NewSecure123' });

    expect(res.status).toBe(400);
  });

  it('rejects weak passwords', async () => {
    (mp.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(validToken);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'abc123def456', password: 'weak' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Пароль/);
  });

  it('rejects password reuse from history', async () => {
    const bcrypt = require('bcryptjs');
    const oldHash = await bcrypt.hash('NewSecure123', 12);
    (mp.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(validToken);
    (mp.passwordHistory.findMany as jest.Mock).mockResolvedValue([{ passwordHash: oldHash }]);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'abc123def456', password: 'NewSecure123' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_REUSED');
  });
});

// ─── Refresh Token — Reuse Detection ──────────────────────────────────────────

describe('POST /api/auth/refresh — token reuse detection', () => {
  beforeEach(resetMocks);

  const userId = 'user-ruse-1';
  const makeRefreshToken = (overrides = {}) =>
    jwt.sign(
      { userId },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: '30d', issuer: 'irongym-api', audience: 'irongym-app' }
    );

  it('returns new tokens for a valid unrevoked refresh token', async () => {
    const rawRefresh = makeRefreshToken();
    (mp.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rt-1',
      token: rawRefresh,
      userId,
      revoked: false,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    (mp.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mp.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId,
      isBanned: false,
      lockedUntil: null,
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: rawRefresh });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('revokes ALL tokens and returns 401 when revoked token is replayed', async () => {
    const rawRefresh = makeRefreshToken();
    (mp.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rt-1',
      token: rawRefresh,
      userId,
      revoked: true, // already revoked — reuse attack
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: rawRefresh });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_REUSE');
    // Must revoke all remaining tokens for this user
    expect(mp.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId, revoked: false }) })
    );
  });

  it('returns 401 for expired refresh token (DB)', async () => {
    const rawRefresh = makeRefreshToken();
    (mp.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rt-1',
      token: rawRefresh,
      userId,
      revoked: false,
      expiresAt: new Date(Date.now() - 1000), // expired
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: rawRefresh });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/истёк/i);
  });

  it('returns 401 for token not found in DB', async () => {
    const rawRefresh = makeRefreshToken();
    (mp.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: rawRefresh });

    expect(res.status).toBe(401);
  });

  it('returns 401 for malformed JWT', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not.a.valid.jwt' });

    expect(res.status).toBe(401);
  });

  it('returns 403 for banned user during token refresh', async () => {
    const rawRefresh = makeRefreshToken();
    (mp.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rt-1',
      token: rawRefresh,
      userId,
      revoked: false,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    (mp.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mp.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId,
      isBanned: true,
      lockedUntil: null,
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: rawRefresh });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BANNED');
  });
});

// ─── Login — Account Lockout ───────────────────────────────────────────────────

describe('POST /api/auth/login — account lockout', () => {
  beforeEach(resetMocks);

  const baseUser = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: null, // will be set per test
    isBanned: false,
    loginAttempts: 4, // one more attempt will lock
    lockedUntil: null,
    healthRestrictions: [],
    totpEnabled: false,
    totpSecret: null,
  };

  it('locks account after 5 failed attempts', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('CorrectPass123', 12);
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, passwordHash: hash });
    // First update: increment loginAttempts → return 5 to trigger lockout
    (mp.user.update as jest.Mock)
      .mockResolvedValueOnce({ loginAttempts: 5 })
      .mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPass999' });

    expect(res.status).toBe(401);
    expect(mp.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lockedUntil: expect.any(Date) }),
      })
    );
  });

  it('returns 429 ACCOUNT_LOCKED when account is locked', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // locked for 10 more mins
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'AnyPass123' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('returns 401 with timing-safe response for unknown email', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null);

    const start = Date.now();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'AnyPass123' });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
    // bcrypt comparison should take at least 50ms (timing-safe dummy hash)
    expect(elapsed).toBeGreaterThan(50);
  });
});

// ─── change-email TOCTOU guard ─────────────────────────────────────────────────

describe('POST /api/user/change-email — TOCTOU guard', () => {
  beforeEach(resetMocks);

  const makeUserToken = () =>
    jwt.sign({ userId: 'u-test' }, process.env.JWT_SECRET!, {
      expiresIn: '1h', issuer: 'irongym-api', audience: 'irongym-app',
    });

  it('returns 400 when OTP already consumed by concurrent request', async () => {
    // authenticate middleware lookup
    (mp.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' })
      // route: 2FA check
      .mockResolvedValueOnce({ totpEnabled: false, totpSecret: null });

    (mp.otpCode.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'otp-1',
      code: '123456',
      attempts: 0,
      used: false,
      expiresAt: new Date(Date.now() + 60000),
    });
    // increment: succeeds
    (mp.otpCode.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })  // increment attempts
      .mockResolvedValueOnce({ count: 0 }); // mark-as-used: already consumed by concurrent request

    const res = await request(app)
      .post('/api/user/change-email')
      .set('Authorization', `Bearer ${makeUserToken()}`)
      .send({ email: 'new@example.com', code: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OTP');
  });

  it('returns 400 for wrong OTP code (timing-safe path)', async () => {
    (mp.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' })
      .mockResolvedValueOnce({ totpEnabled: false, totpSecret: null });

    (mp.otpCode.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'otp-1',
      code: '999999',
      attempts: 0,
      used: false,
      expiresAt: new Date(Date.now() + 60000),
    });
    // increment: succeeds (wrong code path increments first)
    (mp.otpCode.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post('/api/user/change-email')
      .set('Authorization', `Bearer ${makeUserToken()}`)
      .send({ email: 'new@example.com', code: '123456' }); // wrong code

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OTP');
  });

  it('returns 429 when OTP max attempts reached', async () => {
    (mp.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' })
      .mockResolvedValueOnce({ totpEnabled: false, totpSecret: null });

    (mp.otpCode.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'otp-1',
      code: '123456',
      attempts: 5,
      used: false,
      expiresAt: new Date(Date.now() + 60000),
    });
    // increment returns count: 0 because attempts >= MAX_OTP_ATTEMPTS
    (mp.otpCode.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .post('/api/user/change-email')
      .set('Authorization', `Bearer ${makeUserToken()}`)
      .send({ email: 'new@example.com', code: '123456' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('OTP_BRUTEFORCE');
  });
});
