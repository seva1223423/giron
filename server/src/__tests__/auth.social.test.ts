import request from 'supertest';

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

// Mock SMS service
jest.mock('../services/smsService', () => ({
  sendSmsOtp: jest.fn().mockResolvedValue(undefined),
  normalizePhone: jest.fn((p: string) => p.replace(/\D/g, '').replace(/^8/, '7')),
}));

// Mock news refresh service (imported by index.ts)
jest.mock('../services/newsRefreshService', () => ({
  startNewsRefreshScheduler: jest.fn(),
}));

// Mock fetch to avoid real network calls in OAuth tests
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import app from '../index';

// ── VK Auth ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/vk', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    // VK_APP_ID must be set so the route doesn't short-circuit with 503
    process.env.VK_APP_ID = 'test_vk_app_id';
  });

  afterEach(() => {
    delete process.env.VK_APP_ID;
  });

  it('returns 400 when accessToken is missing', async () => {
    // Zod schema requires accessToken: string().min(1) and userId: number().int().positive()
    const res = await request(app)
      .post('/api/auth/vk')
      .send({ userId: 123 });
    expect(res.status).toBe(400);
    // Zod returns the first error message in res.body.error (no code field)
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(app)
      .post('/api/auth/vk')
      .send({ accessToken: 'tok' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 503 when VK_APP_ID env var is not set', async () => {
    delete process.env.VK_APP_ID;
    const res = await request(app)
      .post('/api/auth/vk')
      .send({ accessToken: 'tok', userId: 123 });
    expect(res.status).toBe(503);
  });

  it('returns 401 when VK API returns an error field', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: { error_code: 5, error_msg: 'User authorization failed' } }),
    });
    const res = await request(app)
      .post('/api/auth/vk')
      .send({ accessToken: 'bad_token', userId: 123 });
    // fetch throws because data.error is truthy → caught → 401
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 when VK userId does not match claimed userId', async () => {
    // VK API returns user id=999 but client claimed userId=123
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: [{ id: 999, first_name: 'Test', last_name: 'User' }] }),
    });
    const res = await request(app)
      .post('/api/auth/vk')
      .send({ accessToken: 'tok', userId: 123 });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/не совпадает/i);
  });

  it('returns 401 when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const res = await request(app)
      .post('/api/auth/vk')
      .send({ accessToken: 'tok', userId: 123 });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});

// ── Yandex Auth ───────────────────────────────────────────────────────────────

describe('POST /api/auth/yandex', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    // YANDEX_CLIENT_ID must be set so route doesn't short-circuit with 503
    process.env.YANDEX_CLIENT_ID = 'test_yandex_client_id';
  });

  afterEach(() => {
    delete process.env.YANDEX_CLIENT_ID;
  });

  it('returns 400 when accessToken is missing', async () => {
    const res = await request(app)
      .post('/api/auth/yandex')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 503 when YANDEX_CLIENT_ID env var is not set', async () => {
    delete process.env.YANDEX_CLIENT_ID;
    const res = await request(app)
      .post('/api/auth/yandex')
      .send({ accessToken: 'tok' });
    expect(res.status).toBe(503);
  });

  it('returns 401 when Yandex API returns non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const res = await request(app)
      .post('/api/auth/yandex')
      .send({ accessToken: 'bad_token' });
    // fetch throws (resp.ok false) → caught → 401
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 when Yandex fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network timeout'));
    const res = await request(app)
      .post('/api/auth/yandex')
      .send({ accessToken: 'tok' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 when client_id in Yandex response does not match env', async () => {
    // Yandex returns a valid-looking user but client_id belongs to a different app
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'uid123',
        login: 'testuser',
        default_email: 'test@yandex.ru',
        client_id: 'wrong_client_id', // doesn't match process.env.YANDEX_CLIENT_ID
      }),
    });
    const res = await request(app)
      .post('/api/auth/yandex')
      .send({ accessToken: 'tok' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/другого приложения/i);
  });
});

// ── Mail.ru Auth ──────────────────────────────────────────────────────────────

describe('POST /api/auth/mailru', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    // MAILRU_CLIENT_ID must be set so the route doesn't short-circuit with 503
    process.env.MAILRU_CLIENT_ID = 'test_mailru_client_id';
  });

  afterEach(() => {
    delete process.env.MAILRU_CLIENT_ID;
  });

  it('returns 400 when accessToken is missing', async () => {
    const res = await request(app)
      .post('/api/auth/mailru')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 503 when MAILRU_CLIENT_ID env var is not set', async () => {
    delete process.env.MAILRU_CLIENT_ID;
    const res = await request(app)
      .post('/api/auth/mailru')
      .send({ accessToken: 'tok' });
    expect(res.status).toBe(503);
  });

  it('returns 401 when Mail.ru API returns non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const res = await request(app)
      .post('/api/auth/mailru')
      .send({ accessToken: 'bad_token' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 when Mail.ru response has no id field', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ email: 'test@mail.ru' }), // missing id
    });
    const res = await request(app)
      .post('/api/auth/mailru')
      .send({ accessToken: 'tok' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 WRONG_APP when client_id in Mail.ru response does not match env', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'mr-uid-123',
        email: 'test@mail.ru',
        name: 'Test User',
        client_id: 'other_client_id', // doesn't match MAILRU_CLIENT_ID
      }),
    });
    const res = await request(app)
      .post('/api/auth/mailru')
      .send({ accessToken: 'tok' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('WRONG_APP');
  });

  it('returns 401 WRONG_APP when aud in Mail.ru response does not match env', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'mr-uid-123',
        email: 'test@mail.ru',
        name: 'Test User',
        aud: 'different_app_id', // doesn't match MAILRU_CLIENT_ID
      }),
    });
    const res = await request(app)
      .post('/api/auth/mailru')
      .send({ accessToken: 'tok' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('WRONG_APP');
  });
});

// ── OK.ru Auth ────────────────────────────────────────────────────────────────

describe('POST /api/auth/ok', () => {
  const { prisma } = require('../db');

  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    process.env.OK_APP_ID = 'test_ok_app_id';
    // Default: no existing user
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-ok-1',
      email: 'ok_12345@irongym.internal',
      firstName: 'Иван',
      lastName: 'Петров',
      okId: '12345',
      avatarUrl: null,
      emailVerified: false,
      isBanned: false,
      lockedUntil: null,
      totpEnabled: false,
      totpSecret: null,
      healthRestrictions: [],
    });
  });

  afterEach(() => {
    delete process.env.OK_APP_ID;
  });

  it('returns 400 when accessToken is missing', async () => {
    const res = await request(app)
      .post('/api/auth/ok')
      .send({ userId: '12345' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(app)
      .post('/api/auth/ok')
      .send({ accessToken: 'ok-token' });
    expect(res.status).toBe(400);
  });

  it('returns 503 when OK_APP_ID env var is not set', async () => {
    delete process.env.OK_APP_ID;
    const res = await request(app)
      .post('/api/auth/ok')
      .send({ accessToken: 'ok-token', userId: '12345' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('MISCONFIGURED');
  });

  it('returns 401 when OK.ru API returns non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const res = await request(app)
      .post('/api/auth/ok')
      .send({ accessToken: 'bad-token', userId: '12345' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 when OK.ru response has no uid field', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ first_name: 'Ivan' }), // no uid
    });
    const res = await request(app)
      .post('/api/auth/ok')
      .send({ accessToken: 'tok', userId: '12345' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 when uid does not match claimed userId', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ uid: '99999', first_name: 'Ivan' }),
    });
    const res = await request(app)
      .post('/api/auth/ok')
      .send({ accessToken: 'tok', userId: '12345' }); // claimed 12345, actual 99999
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ID_MISMATCH');
  });

  it('creates new user and returns tokens for valid OK.ru token', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        uid: '12345',
        first_name: 'Иван',
        last_name: 'Петров',
        pic_2: 'https://img.ok.ru/avatar.jpg',
      }),
    });
    const res = await request(app)
      .post('/api/auth/ok')
      .send({ accessToken: 'valid-ok-token', userId: '12345' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    // okId must NOT be in the response (safeUser strips it)
    expect(res.body.user.okId).toBeUndefined();
    // Boolean flag must be present
    expect(res.body.user.hasOk).toBe(true);
  });

  it('returns 409 LINK_REQUIRED when email already exists in Iron Gym', async () => {
    // Simulate no user found by okId but existing user found by email
    prisma.user.findUnique
      .mockResolvedValueOnce(null)        // findUnique by okId
      .mockResolvedValueOnce({ id: 'existing-user' }); // findUnique by email
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ uid: '12345', first_name: 'Ivan', email: 'existing@example.com' }),
    });
    const res = await request(app)
      .post('/api/auth/ok')
      .send({ accessToken: 'tok', userId: '12345' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LINK_REQUIRED');
  });
});
