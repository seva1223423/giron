/**
 * Server integration tests for subscription routes.
 * Covers: GET /status, POST /activate, POST /cancel, POST /webhook.
 *
 * Webhook tests use the generic WEBHOOK_SECRET path (no ЮKassa HMAC complexity);
 * a separate block verifies that RevenueCat → 410 and that a missing secret → 401.
 */

// Step 1: disable rate limiting before any import
jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

// Step 2: Prisma mock before app import
jest.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
  },
}));

// Step 3: activityTracker mock
jest.mock('../utils/activityTracker', () => ({
  getActiveUsersCount: jest.fn().mockReturnValue(0),
  getActiveUserIds: jest.fn().mockReturnValue(new Set()),
  recordActivity: jest.fn(),
  shouldSyncLastActiveAt: jest.fn().mockReturnValue(false),
}));

// Step 4: logger mock
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';
import { prisma } from '../db';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JWT_ISS = 'irongym-api';
const JWT_AUD = 'irongym-app';

const makeToken = (userId = 'u-test', role = 'USER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });

const mockAuthUser = (userId = 'u-test') => {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({
    id: userId,
    isBanned: false,
    lockedUntil: null,
    role: 'USER',
  });
};

const ACTIVE_SUB = {
  id: 'csub0000000000000000001',
  userId: 'u-test',
  plan: 'pro',
  status: 'active',
  startDate: new Date('2026-04-01'),
  endDate: new Date(Date.now() + 30 * 86_400_000), // expires in 30 days
};

// Webhook test constants
const WEBHOOK_SECRET = 'test-webhook-secret-1234';

// ─── GET /api/subscription/status ────────────────────────────────────────────

describe('GET /api/subscription/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthUser();
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/subscription/status');
    expect(res.status).toBe(401);
  });

  it('200 free plan when no subscription exists', async () => {
    const res = await request(app)
      .get('/api/subscription/status')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('free');
    expect(res.body.isPremium).toBe(false);
    expect(res.body.expiresAt).toBeNull();
  });

  it('200 isPremium true for active non-expired subscription', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(ACTIVE_SUB);

    const res = await request(app)
      .get('/api/subscription/status')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('pro');
    expect(res.body.status).toBe('active');
    expect(res.body.isPremium).toBe(true);
  });

  it('200 isPremium true for cancelled-but-not-expired subscription', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
      ...ACTIVE_SUB,
      status: 'cancelled',
    });

    const res = await request(app)
      .get('/api/subscription/status')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.isPremium).toBe(true); // still premium until endDate
  });

  it('200 isPremium false for expired subscription (auto-expiry path)', async () => {
    const expiredSub = {
      ...ACTIVE_SUB,
      status: 'active',
      endDate: new Date(Date.now() - 86_400_000), // expired yesterday
    };
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(expiredSub);
    (prisma.subscription.update as jest.Mock).mockResolvedValueOnce({});

    const res = await request(app)
      .get('/api/subscription/status')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('expired');
    expect(res.body.isPremium).toBe(false);
    // Should auto-update status to expired in DB
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired' } }),
    );
  });
});

// ─── POST /api/subscription/activate ─────────────────────────────────────────

describe('POST /api/subscription/activate', () => {
  const validPayload = { plan: 'pro', durationDays: 7 };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthUser();
    (prisma.subscription.create as jest.Mock).mockResolvedValue({
      ...ACTIVE_SUB,
      plan: 'pro',
      status: 'active',
    });
  });

  it('401 without token', async () => {
    const res = await request(app).post('/api/subscription/activate').send(validPayload);
    expect(res.status).toBe(401);
  });

  it('400 for missing plan', async () => {
    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ durationDays: 7 });

    expect(res.status).toBe(400);
  });

  it('400 for durationDays exceeding 7 (trial cap)', async () => {
    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'pro', durationDays: 30 });

    expect(res.status).toBe(400);
  });

  // SECURITY: trial path must reject trainer/club tiers. Earlier the zod
  // schema accepted enum('pro'|'trainer'|'club') and the trial branch
  // happily created any of them, which let any free user grab 7 days of
  // trainer privileges (reading/mutating TrainerClient rows, generating
  // invite codes) just by sending {plan:'trainer'}. The fix in
  // subscription.ts hardcodes the trial schema to z.literal('pro'); these
  // pins catch a regression if anyone widens the enum again.
  it('SECURITY: 400 when trial activates plan=trainer (privilege escalation pin)', async () => {
    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'trainer', durationDays: 7 });

    expect(res.status).toBe(400);
    // Critically: the create must NEVER fire for a trainer-trial attempt.
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });

  it('SECURITY: 400 when trial activates plan=club (privilege escalation pin)', async () => {
    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'club', durationDays: 7 });

    expect(res.status).toBe(400);
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });

  it('403 when transactionId is provided (only allowed via webhook)', async () => {
    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'pro', durationDays: 7, transactionId: 'txn-123' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/webhook/);
  });

  it('200 activates trial subscription', async () => {
    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.isPremium).toBe(true);
    expect(res.body.plan).toBe('pro');
    expect(res.body.expiresAt).toBeDefined();
  });

  it('400 when trial already used (P2002 unique constraint)', async () => {
    (prisma.subscription.create as jest.Mock).mockRejectedValueOnce({ code: 'P2002' });

    const res = await request(app)
      .post('/api/subscription/activate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/уже использован/);
  });
});

// ─── POST /api/subscription/cancel ───────────────────────────────────────────

describe('POST /api/subscription/cancel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthUser();
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(ACTIVE_SUB);
    (prisma.subscription.update as jest.Mock).mockResolvedValue({
      ...ACTIVE_SUB,
      status: 'cancelled',
    });
  });

  it('401 without token', async () => {
    const res = await request(app).post('/api/subscription/cancel');
    expect(res.status).toBe(401);
  });

  it('400 when no active subscription exists', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/subscription/cancel')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/нет активной/i);
  });

  it('400 when subscription is already cancelled', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
      ...ACTIVE_SUB,
      status: 'cancelled',
    });

    const res = await request(app)
      .post('/api/subscription/cancel')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
  });

  it('200 cancels active subscription (stays premium until endDate)', async () => {
    const res = await request(app)
      .post('/api/subscription/cancel')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.isPremium).toBe(true); // still premium until endDate
    // Cancellation now also stamps canceledAt for the 376-ФЗ §2 audit trail —
    // assert on the fields we care about (status) without locking the test
    // to a single-field shape that breaks every time we add audit metadata.
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
  });
});

// ─── POST /api/subscription/webhook ──────────────────────────────────────────

describe('POST /api/subscription/webhook', () => {
  const USER_ID = 'cwbhk0000000000000001';

  beforeAll(() => {
    process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterAll(() => {
    delete process.env.WEBHOOK_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Webhook checks if user exists (no auth)
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: USER_ID });
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.subscription.upsert as jest.Mock).mockResolvedValue({});
    (prisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  const webhookPost = (body: object) =>
    request(app)
      .post('/api/subscription/webhook')
      .set('x-webhook-secret', WEBHOOK_SECRET)
      .send(body);

  it('410 for revenueCat provider (no longer supported)', async () => {
    const res = await request(app)
      .post('/api/subscription/webhook')
      .send({ provider: 'revenuecat', event: 'subscription_activated', userId: USER_ID });

    expect(res.status).toBe(410);
  });

  it('401 for generic provider with wrong secret', async () => {
    const res = await request(app)
      .post('/api/subscription/webhook')
      .set('x-webhook-secret', 'wrong-secret')
      .send({ provider: 'generic', event: 'subscription_activated', userId: USER_ID });

    expect(res.status).toBe(401);
  });

  it('401 for generic provider with no secret header', async () => {
    const res = await request(app)
      .post('/api/subscription/webhook')
      .send({ provider: 'generic', event: 'subscription_activated', userId: USER_ID });

    expect(res.status).toBe(401);
  });

  it('400 when userId is missing', async () => {
    const res = await webhookPost({ provider: 'generic', event: 'subscription_activated', plan: 'pro', durationDays: 30 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/);
  });

  it('404 when userId does not exist in DB', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await webhookPost({ provider: 'generic', event: 'subscription_activated', userId: USER_ID, plan: 'pro', durationDays: 30 });
    expect(res.status).toBe(404);
  });

  it('200 subscription_activated upserts subscription', async () => {
    const res = await webhookPost({
      provider: 'generic',
      event: 'subscription_activated',
      userId: USER_ID,
      plan: 'pro',
      durationDays: 30,
    });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        create: expect.objectContaining({ plan: 'pro', status: 'active' }),
      }),
    );
  });

  it('200 subscription_cancelled marks subscription cancelled', async () => {
    const res = await webhookPost({
      provider: 'generic',
      event: 'subscription_cancelled',
      userId: USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'cancelled' } }),
    );
  });

  it('200 subscription_expired marks subscription expired', async () => {
    const res = await webhookPost({
      provider: 'generic',
      event: 'subscription_expired',
      userId: USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired' } }),
    );
  });

  it('200 stale event is skipped when current endDate >= incoming endDate', async () => {
    // Current subscription ends in 60 days — incoming webhook says 30 days → stale
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
      endDate: new Date(Date.now() + 60 * 86_400_000),
    });

    const res = await webhookPost({
      provider: 'generic',
      event: 'subscription_activated',
      userId: USER_ID,
      plan: 'pro',
      durationDays: 30,
    });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it('200 stale subscription_expired is skipped when endDate is still in the future', async () => {
    // Round 69: a replay of an old `expired` event that arrives AFTER a
    // fresh `renewed` would otherwise revert the renewal. Guard mirrors
    // the activated/renewed branch's stale-event protection.
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
      endDate: new Date(Date.now() + 30 * 86_400_000),
      status: 'active',
    });

    const res = await webhookPost({
      provider: 'generic',
      event: 'subscription_expired',
      userId: USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
    // Critically: updateMany must NOT have been called — the renewal stays.
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });

  it('200 subscription_expired applies when endDate has actually passed', async () => {
    // Real expiration path: endDate is in the past, so the event is fresh
    // and the sub should be marked expired.
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
      endDate: new Date(Date.now() - 86_400_000),
      status: 'active',
    });

    const res = await webhookPost({
      provider: 'generic',
      event: 'subscription_expired',
      userId: USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBeUndefined();
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired' } }),
    );
  });
});
