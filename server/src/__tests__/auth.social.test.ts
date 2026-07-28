import request from 'supertest';
import { prisma } from '../db';

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
import { _resetOAuthReplayCacheForTests } from '../routes/auth';

// Module-level OAuth replay cache survives across tests in the same Jest
// worker. Without this reset, tests that send the same accessToken / jti
// twice (e.g. fetch-throws and client_id-mismatch both using 'tok') would
// short-circuit the second call with code:'TOKEN_REPLAY' before the actual
// branch under test runs. Fires for every test in the file.
beforeEach(() => {
  _resetOAuthReplayCacheForTests();
});

/**
 * The VK route calls secure.checkToken before users.get, so a single
 * mockResolvedValue would answer the audience check with the profile payload.
 * This routes each call by URL: the audience check passes unless told
 * otherwise, and `usersGet` answers the profile lookup.
 */
function mockVkFetch(usersGet: any, opts: { audienceOk?: boolean } = {}) {
  const { audienceOk = true } = opts;
  mockFetch.mockImplementation(async (url: any) => {
    if (String(url).includes('secure.checkToken')) {
      return { ok: true, json: async () => ({ response: { success: audienceOk ? 1 : 0 } }) };
    }
    return usersGet;
  });
}

// ── VK Auth ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/vk', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    // Both must be set or the route short-circuits with 503: VK_APP_ID to be
    // configured at all, VK_SERVICE_TOKEN to verify who the token belongs to.
    process.env.VK_APP_ID = 'test_vk_app_id';
    process.env.VK_SERVICE_TOKEN = 'test_vk_service_token';
  });

  afterEach(() => {
    delete process.env.VK_APP_ID;
    delete process.env.VK_SERVICE_TOKEN;
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
    mockVkFetch({
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
    mockVkFetch({
      ok: true,
      json: async () => ({ response: [{ id: 999, first_name: 'Test', last_name: 'User' }] }),
    });
    const res = await request(app)
      .post('/api/auth/vk')
      .send({ accessToken: 'tok', userId: 123 });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/не совпадает/i);
  });

  // Audit M4. VK's users.get answers for a token issued to ANY app, so on its
  // own it proves the token is valid somewhere — not that it is ours. Without
  // these two guards anyone running a VK app could collect a victim's token
  // there and sign in as them here.
  it('refuses the login when the token was issued to another VK app', async () => {
    mockVkFetch(
      { ok: true, json: async () => ({ response: [{ id: 123, first_name: 'T', last_name: 'U' }] }) },
      { audienceOk: false },
    );
    const res = await request(app)
      .post('/api/auth/vk')
      .send({ accessToken: 'token_from_someone_elses_app', userId: 123 });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/другому приложению/i);
  });

  it('refuses the login when no service key is configured to check with', async () => {
    delete process.env.VK_SERVICE_TOKEN;
    mockVkFetch({ ok: true, json: async () => ({ response: [{ id: 123 }] }) });
    const res = await request(app)
      .post('/api/auth/vk')
      .send({ accessToken: 'tok', userId: 123 });
    // Refusing beats accepting a token whose owner cannot be established.
    expect(res.status).toBe(503);
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

// ── HIGH-14 regression: email normalisation in OAuth flows ────────────────────
// Verifies that emails returned by OAuth providers are normalised via
// email.trim().toLowerCase().normalize('NFKC') before any DB lookup or storage.
// Without this fix an attacker could register "TEST@yandex.ru" and then use a
// Yandex account whose API returns "test@yandex.ru" to silently hijack the slot.

describe('HIGH-14 email normalisation in Yandex OAuth', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    process.env.YANDEX_CLIENT_ID = 'test_yandex_client_id';
  });

  afterEach(() => {
    delete process.env.YANDEX_CLIENT_ID;
  });

  it('normalises mixed-case default_email before DB lookup and storage (HIGH-14)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'yan-uid-001',
        login: 'testuser',
        default_email: 'Test@YANDEX.RU', // provider returns mixed-case
        client_id: 'test_yandex_client_id',
      }),
    });
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);    // no user by yandexId
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);   // no user by normalised email
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: 'new-user-hi14-1',
      email: 'test@yandex.ru',
      firstName: 'Пользователь',
      yandexId: 'yan-uid-001',
      isBanned: false,
      lockedUntil: null,
      totpEnabled: false,
      totpSecret: null,
      healthRestrictions: [],
      emailVerified: true,
    });

    const res = await request(app)
      .post('/api/auth/yandex')
      .send({ accessToken: 'valid-yan-token' });

    expect(res.status).toBe(200);
    // The findUnique call must use the normalised (lowercase) email
    const findUniqueCall = (prisma.user.findUnique as jest.Mock).mock.calls[0];
    expect(findUniqueCall[0].where.email).toBe('test@yandex.ru');
    // user.create must store the normalised email
    const createCall = (prisma.user.create as jest.Mock).mock.calls[0];
    expect(createCall[0].data.email).toBe('test@yandex.ru');
  });
});

describe('VK OAuth email handling (round 79: anti-squatting)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    process.env.VK_APP_ID = 'test_vk_app_id';
    process.env.VK_SERVICE_TOKEN = 'test_vk_service_token';
  });

  afterEach(() => {
    delete process.env.VK_APP_ID;
    delete process.env.VK_SERVICE_TOKEN;
  });

  it('IGNORES client-supplied email at user creation, uses synthetic vk_<id>@giron.internal', async () => {
    // Round 79: the client-supplied `email` param is no longer accepted
    // by the route at all. VK's users.get API doesn't return an email
    // server-side, so any email field on the request body is purely
    // client-controlled — an attacker could send their own valid VK
    // accessToken + userId but `email: victim@example.com` to squat on
    // the victim's address at user creation. HIGH-3 closed the email-
    // based auto-link half of the gap; this closes the new-account half.
    //
    // The pre-round-79 test asserted email NORMALISATION (HIGH-14), which
    // implicitly trusted the client value. That's no longer the contract:
    // the synthetic internal email is the only thing that lands on disk.
    mockVkFetch({
      ok: true,
      json: async () => ({
        response: [{ id: 12345, first_name: 'Test', last_name: 'User', photo_200: 'https://example.com/avatar.jpg' }],
      }),
    });
    (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce(null); // no user by vkId
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: 'new-user-vk-79',
      email: 'vk_12345@giron.internal',
      firstName: 'Test',
      lastName: 'User',
      vkId: '12345',
      isBanned: false,
      lockedUntil: null,
      totpEnabled: false,
      totpSecret: null,
      healthRestrictions: [],
      emailVerified: false,
    });

    const res = await request(app)
      .post('/api/auth/vk')
      .send({
        accessToken: 'valid-vk-token',
        userId: 12345,
        email: 'victim@example.com', // attacker-controlled — must be ignored
      });

    expect(res.status).toBe(200);
    // user.create must store the synthetic email — the attacker-supplied
    // address never reaches the DB.
    const createCall = (prisma.user.create as jest.Mock).mock.calls[0];
    expect(createCall[0].data.email).toBe('vk_12345@giron.internal');
    expect(createCall[0].data.email).not.toContain('victim');
    expect(createCall[0].data.emailVerified).toBe(false);
  });
});

// ── Google Auth ───────────────────────────────────────────────────────────────
//
// Google OAuth was the only social provider without test coverage. Three
// security audit findings live in this endpoint and need regression tests:
//   - HIGH-2: email_verified MUST be true before trusting Google's email
//             claim (stops Workspace-admin account-takeover)
//   - HIGH-14: email normalised via .trim().toLowerCase().normalize('NFKC')
//             before DB lookup or storage
//   - Account-takeover defense: when a Google account's email matches an
//             existing local account, link is only allowed if the local
//             account already verified that email (otherwise an attacker
//             who registered the victim's address could be silently linked)
