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
}

const RC_SECRET = 'rc-test-secret'; // matches setup.ts
const YK_SECRET = 'yukassa-test-secret';
const GENERIC_SECRET = 'generic-test-secret';

function yukassaSignature(body: string): string {
  return createHmac('sha256', YK_SECRET).update(body).digest('hex');
}

// ─── RevenueCat Webhook ────────────────────────────────────────────────────────

describe('POST /api/subscription/webhook — RevenueCat', () => {
  beforeEach(resetMocks);

  const basePayload = {
    provider: 'revenuecat',
    event: 'subscription_activated',
    userId: 'user-rc-1',
    plan: 'pro',
    durationDays: 30,
    transactionId: 'rc-txn-001',
  };

  it('activates subscription with valid RevenueCat signature', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-rc-1' });

    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-revenuecat-webhook-auth', RC_SECRET)
      .send(basePayload);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(mp.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-rc-1' },
        create: expect.objectContaining({ plan: 'pro', status: 'active' }),
        update: expect.objectContaining({ plan: 'pro', status: 'active' }),
      })
    );
  });

  it('returns 401 for missing RevenueCat signature header', async () => {
    const res = await request(app)
      .post('/api/subscription/webhook')
      .send(basePayload);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid signature/i);
  });

  it('returns 401 for wrong RevenueCat signature', async () => {
    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-revenuecat-webhook-auth', 'wrong-secret')
      .send(basePayload);

    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown userId', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-revenuecat-webhook-auth', RC_SECRET)
      .send(basePayload);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Пользователь не найден/);
    expect(mp.subscription.upsert).not.toHaveBeenCalled();
  });

  it('cancels subscription on subscription_cancelled event', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-rc-1' });

    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-revenuecat-webhook-auth', RC_SECRET)
      .send({ ...basePayload, event: 'subscription_cancelled' });

    expect(res.status).toBe(200);
    expect(mp.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-rc-1', status: 'active' }),
        data: { status: 'cancelled' },
      })
    );
  });

  it('expires subscription on subscription_expired event', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-rc-1' });

    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-revenuecat-webhook-auth', RC_SECRET)
      .send({ ...basePayload, event: 'subscription_expired' });

    expect(res.status).toBe(200);
    expect(mp.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-rc-1' }),
        data: { status: 'expired' },
      })
    );
  });

  it('normalizes unknown plan names to "pro"', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-rc-1' });

    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-revenuecat-webhook-auth', RC_SECRET)
      .send({ ...basePayload, plan: 'enterprise' }); // unknown plan

    expect(res.status).toBe(200);
    expect(mp.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ plan: 'pro' }), // falls back to 'pro'
      })
    );
  });

  it('clamps durationDays to max 3650', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-rc-1' });

    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-revenuecat-webhook-auth', RC_SECRET)
      .send({ ...basePayload, durationDays: 99999 }); // attacker-supplied value

    expect(res.status).toBe(200);
    // The endDate should be ~3650 days from now (not 99999)
    const upsertCall = (mp.subscription.upsert as jest.Mock).mock.calls[0][0];
    const startDate: Date = upsertCall.create.startDate;
    const endDate: Date = upsertCall.create.endDate;
    const days = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(days).toBeLessThanOrEqual(3650);
  });

  it('returns 400 for missing userId', async () => {
    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-revenuecat-webhook-auth', RC_SECRET)
      .send({ provider: 'revenuecat', event: 'subscription_activated', plan: 'pro', durationDays: 30 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId обязателен/);
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
