/**
 * Integration tests for server-side subscription gating.
 *
 * Verifies that free users are correctly limited on:
 *  - GET /api/workouts/history  (capped at 10, offset forced to 0)
 *  - GET /api/user/measurements (capped at 5)
 *  - GET /api/workouts/leaderboard (402 for free users)
 *
 * And that paid users receive full data.
 */

// Disable rate limiting for tests
jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    subscription: { findUnique: jest.fn() },
    workout: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    bodyMeasurement: { findMany: jest.fn() },
    workoutExercise: { findMany: jest.fn() },
    workoutSet: { findMany: jest.fn() },
    refreshToken: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    securityEvent: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    otpCode: { findFirst: jest.fn().mockResolvedValue(null) },
    passwordResetToken: { findUnique: jest.fn().mockResolvedValue(null) },
    passwordHistory: { findMany: jest.fn().mockResolvedValue([]) },
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
  normalizePhone: jest.fn((p: string) => p),
}));

jest.mock('../services/pushService', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/newsRefreshService', () => ({
  startNewsRefreshScheduler: jest.fn(),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';
import { prisma } from '../db';

const mp = prisma as jest.Mocked<typeof prisma>;

// ── Helpers ──────────────────────────────────────────────────────────────────

const FREE_USER_ID = 'user-free-1';
const PAID_USER_ID = 'user-paid-1';

function makeToken(userId: string) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET!,
    { expiresIn: '15m', issuer: 'giron-api', audience: 'giron-app' }
  );
}

const freeToken = makeToken(FREE_USER_ID);
const paidToken = makeToken(PAID_USER_ID);

/** Subscription record for a paid user (active, non-expired) */
const paidSub = {
  plan: 'pro',
  status: 'active',
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
};

/** No subscription for free user */
const noSub = null;

function setupUserAuth(userId: string) {
  (mp.user.findUnique as jest.Mock).mockResolvedValue({
    id: userId,
    isBanned: false,
    lockedUntil: null,
  });
}

function setupSubscription(userId: string, sub: typeof paidSub | null) {
  (mp.subscription.findUnique as jest.Mock).mockImplementation(({ where }: any) =>
    Promise.resolve(where.userId === userId ? sub : null)
  );
}

function resetMocks() {
  jest.clearAllMocks();
  (mp.refreshToken.findMany as jest.Mock).mockResolvedValue([]);
  (mp.refreshToken.create as jest.Mock).mockResolvedValue({});
  (mp.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mp.securityEvent.create as jest.Mock).mockResolvedValue({});
  (mp.securityEvent.findFirst as jest.Mock).mockResolvedValue(null);
}

// ── GET /api/workouts/history ─────────────────────────────────────────────────

describe('GET /api/workouts/history — subscription gating', () => {
  beforeEach(resetMocks);

  const makeWorkouts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `w-${i}`,
      name: `Workout ${i}`,
      completedAt: new Date(),
      durationMinutes: 60,
      totalVolume: 1000,
      exercises: [],
    }));

  it('free user receives at most 10 workouts regardless of limit param', async () => {
    setupUserAuth(FREE_USER_ID);
    setupSubscription(FREE_USER_ID, noSub);
    (mp.workout.findMany as jest.Mock).mockResolvedValue(makeWorkouts(10));
    (mp.workout.count as jest.Mock).mockResolvedValue(25);

    const res = await request(app)
      .get('/api/workouts/history?limit=50&offset=0')
      .set('Authorization', `Bearer ${freeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.workouts.length).toBeLessThanOrEqual(10);
    expect(res.body.total).toBeLessThanOrEqual(10); // total capped too
  });

  it('free user offset is forced to 0 (cannot paginate past first page)', async () => {
    setupUserAuth(FREE_USER_ID);
    setupSubscription(FREE_USER_ID, noSub);
    (mp.workout.findMany as jest.Mock).mockResolvedValue(makeWorkouts(10));
    (mp.workout.count as jest.Mock).mockResolvedValue(25);

    await request(app)
      .get('/api/workouts/history?limit=10&offset=20')
      .set('Authorization', `Bearer ${freeToken}`);

    // findMany must be called with skip: 0, not skip: 20
    expect(mp.workout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 })
    );
  });

  it('paid user receives full history with correct pagination', async () => {
    setupUserAuth(PAID_USER_ID);
    setupSubscription(PAID_USER_ID, paidSub);
    const allWorkouts = makeWorkouts(30);
    (mp.workout.findMany as jest.Mock).mockResolvedValue(allWorkouts.slice(10, 30));
    (mp.workout.count as jest.Mock).mockResolvedValue(30);

    const res = await request(app)
      .get('/api/workouts/history?limit=20&offset=10')
      .set('Authorization', `Bearer ${paidToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(30); // real total, not capped
    expect(res.body.limit).toBe(20);
    expect(res.body.offset).toBe(10);
    // offset passed through to DB
    expect(mp.workout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 20 })
    );
  });

  it('free user with expired subscription is treated as free', async () => {
    setupUserAuth(FREE_USER_ID);
    (mp.subscription.findUnique as jest.Mock).mockResolvedValue({
      plan: 'pro',
      status: 'active',
      endDate: new Date(Date.now() - 1000), // expired yesterday
    });
    (mp.workout.findMany as jest.Mock).mockResolvedValue(makeWorkouts(10));
    (mp.workout.count as jest.Mock).mockResolvedValue(20);

    const res = await request(app)
      .get('/api/workouts/history')
      .set('Authorization', `Bearer ${freeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeLessThanOrEqual(10);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/workouts/history');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/user/measurements ────────────────────────────────────────────────

describe('GET /api/user/measurements — subscription gating', () => {
  beforeEach(resetMocks);

  const makeMeasurements = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `m-${i}`,
      date: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000),
      chest: 90, waist: 80, hips: 95,
    }));

  it('free user receives at most 5 measurements', async () => {
    setupUserAuth(FREE_USER_ID);
    setupSubscription(FREE_USER_ID, noSub);
    (mp.bodyMeasurement.findMany as jest.Mock).mockResolvedValue(makeMeasurements(5));

    const res = await request(app)
      .get('/api/user/measurements')
      .set('Authorization', `Bearer ${freeToken}`);

    expect(res.status).toBe(200);
    // DB query must use take: 5
    expect(mp.bodyMeasurement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
  });

  it('paid user receives up to 60 measurements', async () => {
    setupUserAuth(PAID_USER_ID);
    setupSubscription(PAID_USER_ID, paidSub);
    (mp.bodyMeasurement.findMany as jest.Mock).mockResolvedValue(makeMeasurements(60));

    const res = await request(app)
      .get('/api/user/measurements')
      .set('Authorization', `Bearer ${paidToken}`);

    expect(res.status).toBe(200);
    expect(mp.bodyMeasurement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 60 })
    );
  });

  it('cancelled subscription still grants paid access until endDate', async () => {
    setupUserAuth(PAID_USER_ID);
    (mp.subscription.findUnique as jest.Mock).mockResolvedValue({
      plan: 'pro',
      status: 'cancelled',  // cancelled but not expired
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
    (mp.bodyMeasurement.findMany as jest.Mock).mockResolvedValue(makeMeasurements(60));

    await request(app)
      .get('/api/user/measurements')
      .set('Authorization', `Bearer ${paidToken}`);

    // should use take: 60, not 5
    expect(mp.bodyMeasurement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 60 })
    );
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/user/measurements');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/workouts/leaderboard ─────────────────────────────────────────────

describe('GET /api/workouts/leaderboard — subscription gating', () => {
  beforeEach(resetMocks);

  it('returns 402 SUBSCRIPTION_REQUIRED for free users', async () => {
    setupUserAuth(FREE_USER_ID);
    setupSubscription(FREE_USER_ID, noSub);

    const res = await request(app)
      .get('/api/workouts/leaderboard')
      .set('Authorization', `Bearer ${freeToken}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
    // Must not hit DB for leaderboard data
    expect(mp.workoutSet.findMany).not.toHaveBeenCalled();
  });

  it('returns 402 for user with expired subscription', async () => {
    setupUserAuth(FREE_USER_ID);
    (mp.subscription.findUnique as jest.Mock).mockResolvedValue({
      plan: 'pro',
      status: 'active',
      endDate: new Date(Date.now() - 1000), // expired
    });

    const res = await request(app)
      .get('/api/workouts/leaderboard')
      .set('Authorization', `Bearer ${freeToken}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('allows paid user through to leaderboard data', async () => {
    setupUserAuth(PAID_USER_ID);
    setupSubscription(PAID_USER_ID, paidSub);
    // Mock empty verified users — leaderboard returns empty array
    (mp.user.findUnique as jest.Mock).mockResolvedValue({
      id: PAID_USER_ID,
      isBanned: false,
      lockedUntil: null,
    });
    // The leaderboard fetches users with emailVerified and not banned
    const { PrismaClient } = require('@prisma/client');
    // Patch $queryRaw since it's used internally
    (mp as any).$queryRaw = jest.fn().mockResolvedValue([]);

    const res = await request(app)
      .get('/api/workouts/leaderboard')
      .set('Authorization', `Bearer ${paidToken}`);

    // Either 200 (empty leaderboard) or whatever the mock produces — important thing
    // is it's NOT 402
    expect(res.status).not.toBe(402);
    expect(res.status).not.toBe(401);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/workouts/leaderboard');
    expect(res.status).toBe(401);
  });
});
