import request from 'supertest';
import { createHmac } from 'crypto';

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
    },
    subscription: {
      create: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null), // null = no existing sub (stale-event guard)
    },
    refreshToken: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    securityEvent: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    otpCode: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    passwordResetToken: {
      findUnique: jest.fn(),
    },
    passwordHistory: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../services/emailService', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendOtpEmail: jest.fn(),
  sendNewLoginAlert: jest.fn(),
  sendPasswordChangedAlert: jest.fn(),
}));

jest.mock('../services/smsService', () => ({
  sendSmsOtp: jest.fn(),
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
  (mp.refreshToken.create as jest.Mock).mockResolvedValue({});
  (mp.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mp.subscription.create as jest.Mock).mockResolvedValue({});
  (mp.subscription.upsert as jest.Mock).mockResolvedValue({});
  (mp.subscription.updateMany as jest.Mock).mockResolvedValue({});
  (mp.subscription.findUnique as jest.Mock).mockResolvedValue(null);
}

const YK_SECRET = 'yukassa-test-secret';
const GENERIC_SECRET = 'generic-test-secret';

function yukassaSignature(body: string): string {
  return createHmac('sha256', YK_SECRET).update(body).digest('hex');
}

// ─── RevenueCat removed ────────────────────────────────────────────────────────
// RevenueCat (Apple/Google Play Billing bridge) was removed because Apple/Google
// in-app payments from Russia are unavailable since 2022 and the static-secret
// header compare was a replay risk. Incoming webhooks with provider='revenuecat'
// are now rejected with 410 Gone so any stale client is visible in logs.

describe('POST /api/subscription/webhook — RevenueCat removed', () => {
  beforeEach(resetMocks);

  it('returns 410 Gone for legacy RevenueCat provider', async () => {
    const res = await request(app)
      .post('/api/subscription/webhook')
      .send({
        provider: 'revenuecat',
        event: 'subscription_activated',
        userId: 'user-rc-1',
        plan: 'pro',
        durationDays: 30,
      });

    expect(res.status).toBe(410);
    expect(mp.subscription.upsert).not.toHaveBeenCalled();
    expect(mp.subscription.updateMany).not.toHaveBeenCalled();
  });
});

// ─── ЮKassa Webhook ───────────────────────────────────────────────────────────

describe('POST /api/subscription/webhook — ЮKassa', () => {
  beforeEach(resetMocks);

  const bodyObj = {
    provider: 'yukassa',
    event: 'subscription_activated',
    userId: 'user-yk-1',
    plan: 'club',
    durationDays: 365,
  };

  it('activates subscription with valid ЮKassa HMAC signature', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-yk-1' });
    const rawBody = JSON.stringify(bodyObj);
    const sig = yukassaSignature(rawBody);

    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-yukassa-signature', sig)
      .set('Content-Type', 'application/json')
      .send(bodyObj);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(mp.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ plan: 'club', status: 'active' }),
      })
    );
  });

  it('returns 401 for wrong ЮKassa signature', async () => {
    const rawBody = JSON.stringify(bodyObj);
    const wrongSig = createHmac('sha256', 'wrong-secret').update(rawBody).digest('hex');

    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-yukassa-signature', wrongSig)
      .send(bodyObj);

    expect(res.status).toBe(401);
    expect(mp.subscription.upsert).not.toHaveBeenCalled();
  });

  it('returns 401 for missing ЮKassa signature header', async () => {
    const res = await request(app)
      .post('/api/subscription/webhook')
      .send(bodyObj);

    expect(res.status).toBe(401);
  });
});

// ─── Generic Webhook ──────────────────────────────────────────────────────────

describe('POST /api/subscription/webhook — generic provider', () => {
  beforeEach(resetMocks);

  const bodyObj = {
    event: 'subscription_activated',
    userId: 'user-gen-1',
    plan: 'trainer',
    durationDays: 30,
  };

  it('activates with valid generic x-webhook-secret header', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-gen-1' });

    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-webhook-secret', GENERIC_SECRET)
      .send(bodyObj);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('returns 401 for wrong generic secret', async () => {
    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-webhook-secret', 'totally-wrong')
      .send(bodyObj);

    expect(res.status).toBe(401);
  });

  it('returns 401 for missing generic secret header', async () => {
    const res = await request(app)
      .post('/api/subscription/webhook')
      .send(bodyObj);

    expect(res.status).toBe(401);
  });
});

// ─── Webhook idempotency / stale-event replay protection ─────────────────────

describe('POST /api/subscription/webhook — idempotency (stale-event guard)', () => {
  beforeEach(resetMocks);

  const baseBody = {
    event: 'subscription_activated',
    userId: 'user-idemp-1',
    plan: 'pro',
    durationDays: 30,
  };

  it('SECURITY: skips upsert when current.endDate is FURTHER in the future than incoming', async () => {
    // Replay scenario: a delayed `subscription_renewed` webhook arrives
    // AFTER a more-recent `subscription_renewed` already extended the
    // sub. Replaying the old event must NOT revert endDate backwards.
    // The guard in subscription.ts:298 collapses both equality and
    // strict-greater into a `current.endDate >= endDate` skip.
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-idemp-1' });
    (mp.subscription.findUnique as jest.Mock).mockResolvedValue({
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90d future
    });

    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-webhook-secret', GENERIC_SECRET)
      .send(baseBody); // would set endDate = now + 30d (BEFORE current)

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
    // Critically: upsert must NEVER fire on a stale event — otherwise
    // a replay could shrink the user's subscription window.
    expect(mp.subscription.upsert).not.toHaveBeenCalled();
  });

  it('upsert fires when incoming endDate is strictly newer than current', async () => {
    // Positive case: a legit renewal extending the sub forward.
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-idemp-1' });
    (mp.subscription.findUnique as jest.Mock).mockResolvedValue({
      endDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    });

    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-webhook-secret', GENERIC_SECRET)
      .send(baseBody); // sets endDate to now + 30d

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBeUndefined();
    expect(mp.subscription.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = (mp.subscription.upsert as jest.Mock).mock.calls[0][0];
    // The "where" must scope to userId — IDOR-style protection from
    // server-side state confusion.
    expect(upsertArgs.where.userId).toBe('user-idemp-1');
  });
});

// ─── Subscription Activate (client-side) ─────────────────────────────────────

describe('POST /api/subscription/activate', () => {
  beforeEach(resetMocks);

  const makeAuthHeader = () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: 'user-sub-1' },
      process.env.JWT_SECRET!,
      { expiresIn: '15m', issuer: 'irongym-api', audience: 'irongym-app' }
    );
    return `Bearer ${token}`;
  };

  beforeEach(() => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-sub-1',
      isBanned: false,
      lockedUntil: null,
    });
  });

  it('allows trial activation (no transactionId) for new user', async () => {
    (mp.subscription.create as jest.Mock).mockResolvedValue({
      plan: 'pro',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', makeAuthHeader())
      .send({ plan: 'pro', durationDays: 7 });

    expect(res.status).toBe(200);
    expect(res.body.isPremium).toBe(true);
  });

  it('blocks client from activating with transactionId', async () => {
    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', makeAuthHeader())
      .send({ plan: 'pro', durationDays: 7, transactionId: 'fake-txn-123' }); // valid durationDays so Zod passes, transactionId triggers 403

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/webhook/i);
    expect(mp.subscription.upsert).not.toHaveBeenCalled();
  });

  it('blocks duplicate trial for user who already has a subscription', async () => {
    // Route calls subscription.create; P2002 = unique constraint (userId already has a subscription)
    (mp.subscription.create as jest.Mock).mockRejectedValue({ code: 'P2002' });

    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', makeAuthHeader())
      .send({ plan: 'pro', durationDays: 7 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Пробный период уже использован/);
  });

  it('requires auth to activate', async () => {
    const res = await request(app)
      .post('/api/subscription/activate')
      .send({ plan: 'pro', durationDays: 7 });

    expect(res.status).toBe(401);
  });

  it('rejects invalid plan names', async () => {
    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', makeAuthHeader())
      .send({ plan: 'enterprise', durationDays: 7 }); // not in enum

    expect(res.status).toBe(400);
  });

  it('limits durationDays to max 7 for trial', async () => {
    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', makeAuthHeader())
      .send({ plan: 'pro', durationDays: 30 }); // exceeds max 7

    expect(res.status).toBe(400);
  });
});

// ─── Subscription Cancel ──────────────────────────────────────────────────────

describe('POST /api/subscription/cancel', () => {
  beforeEach(resetMocks);

  const makeAuthHeader = () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: 'user-sub-1' },
      process.env.JWT_SECRET!,
      { expiresIn: '15m', issuer: 'irongym-api', audience: 'irongym-app' }
    );
    return `Bearer ${token}`;
  };

  beforeEach(() => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-sub-1',
      isBanned: false,
      lockedUntil: null,
    });
  });

  it('cancels an active subscription', async () => {
    (mp.subscription as any).findUnique = jest.fn().mockResolvedValue({
      id: 'sub-1',
      plan: 'pro',
      status: 'active',
      endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    });
    (mp.subscription as any).update = jest.fn().mockResolvedValue({
      plan: 'pro',
      status: 'cancelled',
    });

    const res = await request(app)
      .post('/api/subscription/cancel')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.isPremium).toBe(true); // still active until endDate
  });

  it('returns 400 when no active subscription to cancel', async () => {
    (mp.subscription as any).findUnique = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .post('/api/subscription/cancel')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Нет активной подписки/);
  });

  it('returns 400 when subscription already cancelled', async () => {
    (mp.subscription as any).findUnique = jest.fn().mockResolvedValue({
      id: 'sub-1',
      plan: 'pro',
      status: 'cancelled',
    });

    const res = await request(app)
      .post('/api/subscription/cancel')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(400);
  });
});
