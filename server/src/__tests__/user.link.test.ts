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
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
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
      findUnique: jest.fn().mockResolvedValue(null),
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

// Mock email service
jest.mock('../services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedAlert: jest.fn().mockResolvedValue(undefined),
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  sendNewLoginAlert: jest.fn().mockResolvedValue(undefined),
  sendEmailVerification: jest.fn().mockResolvedValue(undefined),
}));

// Mock SMS service
jest.mock('../services/smsService', () => ({
  sendSmsOtp: jest.fn().mockResolvedValue(undefined),
  normalizePhone: jest.fn((p: string) => p.replace(/\D/g, '').replace(/^8/, '7')),
}));

// Mock news refresh service (imported by index.ts)
jest.mock('../services/newsRefreshService', () => ({
  startNewsRefreshScheduler: jest.fn(),
}));

// Mock fetch to avoid real network calls in OAuth token validation
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import app from '../index';
import { prisma } from '../db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const JWT_ISS = 'giron-api';
const JWT_AUD = 'giron-app';

// Mint a valid access token for the given userId
const makeToken = (userId = 'u-test') =>
  jwt.sign({ userId, role: 'USER' }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });

// What the authenticate middleware selects from the DB (ban/lock check)
const authUserRow = { isBanned: false, role: 'USER', lockedUntil: null };

// What the step-up check selects — user WITHOUT a password (should be blocked)
const stepUpNoAuth = {
  passwordHash: null,
  totpEnabled: false,
  totpSecret: null,
};

// Real bcrypt hash computed once for all tests that need password verification
let correctPasswordHash: string;
beforeAll(async () => {
  correctPasswordHash = await bcrypt.hash('correctpass', 10);
});

// What the step-up check selects — user WITH a matching password hash
const stepUpWithPassword = () => ({
  passwordHash: correctPasswordHash,
  totpEnabled: false,
  totpSecret: null,
});

// ── POST /user/linked-accounts/:provider ─────────────────────────────────────

describe('POST /api/user/linked-accounts/:provider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    // Restore stable defaults that clearAllMocks wipes
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.securityEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.usedTotpCode as any).findFirst.mockResolvedValue(null);
    (mockPrisma.usedTotpCode as any).create.mockResolvedValue({});
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app)
      .post('/api/user/linked-accounts/vk')
      .send({ accessToken: 'tok', userId: '123' });
    expect(res.status).toBe(401);
  });

  // authenticate middleware calls findUnique once (ban check), then the route
  // body-parse / Zod validation happens. If Zod rejects before the step-up
  // findUnique is called, we only need one mock value.
  it('returns 400 when accessToken is missing (VK)', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow);   // authenticate middleware

    const res = await request(app)
      .post('/api/user/linked-accounts/vk')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ userId: '123', currentPassword: 'pass' }); // accessToken absent
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when accessToken is missing (Yandex)', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow);

    const res = await request(app)
      .post('/api/user/linked-accounts/yandex')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ currentPassword: 'pass' }); // accessToken absent
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 403 when user has no password and no TOTP (step-up required)', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)     // authenticate middleware ban check
      .mockResolvedValueOnce(stepUpNoAuth);   // step-up check inside route

    const res = await request(app)
      .post('/api/user/linked-accounts/vk')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ accessToken: 'tok', userId: '123' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STEPUP_REQUIRED');
  });

  it('returns 401 when VK API returns an error field (bad token)', async () => {
    process.env.VK_APP_ID = 'test_vk_app_id';

    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)             // authenticate middleware
      .mockResolvedValueOnce(stepUpWithPassword());   // step-up check

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: { error_code: 5, error_msg: 'User authorization failed' } }),
    });

    const res = await request(app)
      .post('/api/user/linked-accounts/vk')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ accessToken: 'bad_token', userId: '123', currentPassword: 'correctpass' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
    delete process.env.VK_APP_ID;
  });

  it('returns 401 when Yandex API returns non-ok response', async () => {
    process.env.YANDEX_CLIENT_ID = 'test_yandex_client_id';

    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)
      .mockResolvedValueOnce(stepUpWithPassword());

    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    const res = await request(app)
      .post('/api/user/linked-accounts/yandex')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ accessToken: 'bad_token', currentPassword: 'correctpass' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
    delete process.env.YANDEX_CLIENT_ID;
  });

  it('returns 409 when VK provider ID is already linked to a different user', async () => {
    process.env.VK_APP_ID = 'test_vk_app_id';

    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)             // authenticate
      .mockResolvedValueOnce(stepUpWithPassword())    // step-up check
      .mockResolvedValueOnce({ id: 'u-other' });      // conflict check

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: [{ id: 123, first_name: 'Test', last_name: 'User' }] }),
    });

    const res = await request(app)
      .post('/api/user/linked-accounts/vk')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ accessToken: 'tok', userId: '123', currentPassword: 'correctpass' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROVIDER_ALREADY_LINKED');
    delete process.env.VK_APP_ID;
  });

  it('returns 409 when Yandex ID is already linked to a different user', async () => {
    process.env.YANDEX_CLIENT_ID = 'test_yandex_client_id';

    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)
      .mockResolvedValueOnce(stepUpWithPassword())
      .mockResolvedValueOnce({ id: 'u-other' });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'yandex-uid-999',
        login: 'testuser',
        client_id: 'test_yandex_client_id',
      }),
    });

    const res = await request(app)
      .post('/api/user/linked-accounts/yandex')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ accessToken: 'tok', currentPassword: 'correctpass' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROVIDER_ALREADY_LINKED');
    delete process.env.YANDEX_CLIENT_ID;
  });

  it('returns 200 idempotent when VK already linked to same user', async () => {
    process.env.VK_APP_ID = 'test_vk_app_id';

    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)
      .mockResolvedValueOnce(stepUpWithPassword())
      .mockResolvedValueOnce({ id: 'u-test' }); // same userId — idempotent

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: [{ id: 123, first_name: 'Test', last_name: 'User' }] }),
    });

    const res = await request(app)
      .post('/api/user/linked-accounts/vk')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ accessToken: 'tok', userId: '123', currentPassword: 'correctpass' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Уже привязан');
    delete process.env.VK_APP_ID;
  });

  it('returns 400 for invalid provider name (twitter)', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow);

    const res = await request(app)
      .post('/api/user/linked-accounts/twitter')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ accessToken: 'tok', currentPassword: 'pass' });
    expect(res.status).toBe(400);
  });
});

// ── DELETE /user/linked-accounts/:provider ────────────────────────────────────

describe('DELETE /api/user/linked-accounts/:provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.securityEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app).delete('/api/user/linked-accounts/vk');
    expect(res.status).toBe(401);
  });

  it('returns 400 NOT_LINKED when VK is not linked to the account', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)         // authenticate middleware
      .mockResolvedValueOnce({                    // route: user data
        passwordHash: 'somehash',
        googleId: null,
        vkId: null,
        yandexId: null,
      });

    const res = await request(app)
      .delete('/api/user/linked-accounts/vk')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_LINKED');
  });

  it('returns 400 NOT_LINKED when Yandex is not linked to the account', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)
      .mockResolvedValueOnce({
        passwordHash: 'somehash',
        googleId: null,
        vkId: null,
        yandexId: null,
      });

    const res = await request(app)
      .delete('/api/user/linked-accounts/yandex')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_LINKED');
  });

  it('returns 400 NOT_LINKED when Google is not linked to the account', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)
      .mockResolvedValueOnce({
        passwordHash: null,
        googleId: null,
        vkId: null,
        yandexId: null,
      });

    const res = await request(app)
      .delete('/api/user/linked-accounts/google')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_LINKED');
  });

  it('returns 400 LAST_LOGIN_METHOD when unlinking only social provider (no password)', async () => {
    // User has VK linked but no password and no other providers — unlinking
    // would leave them with zero login methods.
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)
      .mockResolvedValueOnce({
        passwordHash: null,
        googleId: null,
        vkId: 'vk-123',
        yandexId: null,
      });

    const res = await request(app)
      .delete('/api/user/linked-accounts/vk')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LAST_LOGIN_METHOD');
  });

  it('returns 400 LAST_LOGIN_METHOD when only Yandex is linked and no password', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)
      .mockResolvedValueOnce({
        passwordHash: null,
        googleId: null,
        vkId: null,
        yandexId: 'yandex-uid-999',
      });

    const res = await request(app)
      .delete('/api/user/linked-accounts/yandex')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LAST_LOGIN_METHOD');
  });

  it('returns 200 when unlinking VK and user still has a password', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)
      .mockResolvedValueOnce({
        passwordHash: 'somehash',
        googleId: null,
        vkId: 'vk-123',
        yandexId: null,
      });

    const res = await request(app)
      .delete('/api/user/linked-accounts/vk')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 200 when unlinking Yandex while VK is still linked (no password needed)', async () => {
    // Both VK and Yandex are linked, no password — unlinking Yandex is safe
    // because VK remains as an alternate login method.
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)
      .mockResolvedValueOnce({
        passwordHash: null,
        googleId: null,
        vkId: 'vk-123',
        yandexId: 'yandex-uid-999',
      });

    const res = await request(app)
      .delete('/api/user/linked-accounts/yandex')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 400 NOT_LINKED when yandex provider is not linked', async () => {
    // DELETE accepts yandex|vk|google. When yandexId is null → NOT_LINKED.
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(authUserRow)
      .mockResolvedValueOnce({
        passwordHash: 'somehash',
        googleId: 'g-123', // another method present, so unlink is allowed
        vkId: null,
        yandexId: null,
      });

    const res = await request(app)
      .delete('/api/user/linked-accounts/yandex')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_LINKED');
  });
});
