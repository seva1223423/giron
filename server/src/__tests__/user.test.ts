/**
 * Integration tests for server/src/routes/user.ts
 *
 * Covers: GET/PATCH /profile, PATCH /nutrition-targets, POST /weight.
 * Key security property: all mutations MUST use req.userId from JWT — never
 * a userId sourced from the request body.
 */

// Step 1: disable rate limiting first
jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

// Step 2: mock Prisma before app import
jest.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    bodyWeight: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    bodyMeasurement: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    sleepEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    pushToken: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    trustedDevice: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    securityEvent: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    passwordHistory: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    otpCode: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

// Step 3: mock external services
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../services/emailService', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendOtpEmail: jest.fn(),
  sendNewLoginAlert: jest.fn(),
  sendPasswordChangedAlert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/smsService', () => ({
  sendSmsOtp: jest.fn(),
  normalizePhone: jest.fn((p: string) => p),
}));

jest.mock('../services/pushService', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

// Step 4: import app
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';
import { prisma } from '../db';

const JWT_ISS = 'irongym-api';
const JWT_AUD = 'irongym-app';

const makeToken = (userId = 'u-test', role = 'USER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });

const mockUser = {
  id: 'u-test',
  email: 'test@example.com',
  phone: null,
  emailVerified: true,
  phoneVerified: false,
  firstName: 'Test',
  lastName: 'User',
  dateOfBirth: null,
  gender: 'MALE',
  heightCm: 180,
  weightKg: 80,
  goal: 'MUSCLE_GAIN',
  fitnessLevel: 'INTERMEDIATE',
  trainingExperienceYears: 2,
  avatarUrl: null,
  role: 'USER',
  gymId: null,
  weekPlan: null,
  targetCalories: 2800,
  targetProtein: 180,
  targetFats: 80,
  targetCarbs: 300,
  targetWaterMl: 2500,
  totpEnabled: false,
  isBanned: false,
  lockedUntil: null,
  bannedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  googleId: null,
  vkId: null,
  yandexId: null,
  healthRestrictions: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  // Authenticate middleware calls findUnique — return active user
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
});

// ─── GET /api/user/profile ────────────────────────────────────────────────────

describe('GET /api/user/profile', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/user/profile');
    expect(res.status).toBe(401);
  });

  it('200 returns safe profile (no raw oauth IDs)', async () => {
    const userWithOAuth = {
      ...mockUser,
      googleId: 'google-id-secret',
      vkId: null,
      yandexId: null,
    };
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(userWithOAuth) // auth middleware
      .mockResolvedValueOnce(userWithOAuth); // route handler

    const res = await request(app)
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    // googleId should NOT be in response — replaced by hasGoogle flag
    expect(res.body.googleId).toBeUndefined();
    expect(res.body.hasGoogle).toBe(true);
    expect(res.body.hasVk).toBe(false);
    expect(res.body.firstName).toBe('Test');
  });

  it('404 when user not found in DB', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser) // auth middleware passes
      .mockResolvedValueOnce(null);   // route handler: user deleted between requests

    const res = await request(app)
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

// ─── PATCH /api/user/profile ──────────────────────────────────────────────────

describe('PATCH /api/user/profile', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .patch('/api/user/profile')
      .send({ firstName: 'Alex' });
    expect(res.status).toBe(401);
  });

  it('400 on invalid input (avatarUrl not https)', async () => {
    const res = await request(app)
      .patch('/api/user/profile')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ avatarUrl: 'http://example.com/pic.jpg' }); // http not https

    expect(res.status).toBe(400);
  });

  it('400 on invalid gender value', async () => {
    const res = await request(app)
      .patch('/api/user/profile')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ gender: 'HELICOPTER' });

    expect(res.status).toBe(400);
  });

  it('200 updates profile successfully', async () => {
    const updated = { ...mockUser, firstName: 'Alex', heightCm: 175 };
    (prisma.user.update as jest.Mock).mockResolvedValueOnce(updated);

    const res = await request(app)
      .patch('/api/user/profile')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ firstName: 'Alex', heightCm: 175 });

    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Alex');
  });

  it('SECURITY: update uses req.userId from JWT, not body.userId', async () => {
    const updated = { ...mockUser };
    (prisma.user.update as jest.Mock).mockResolvedValueOnce(updated);

    await request(app)
      .patch('/api/user/profile')
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ firstName: 'Hacker', userId: 'u-victim-123' }); // body.userId must be ignored

    const updateCalls = (prisma.user.update as jest.Mock).mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);
    // where must use u-test (from JWT), never the body-supplied userId
    expect(updateCalls[0][0].where.id).toBe('u-test');
    expect(updateCalls[0][0].where.id).not.toBe('u-victim-123');
  });
});

// ─── PATCH /api/user/nutrition-targets ───────────────────────────────────────

describe('PATCH /api/user/nutrition-targets', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .patch('/api/user/nutrition-targets')
      .send({ calories: 2000 });
    expect(res.status).toBe(401);
  });

  it('400 when calories below minimum (500)', async () => {
    const res = await request(app)
      .patch('/api/user/nutrition-targets')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ calories: 100 }); // below 500 min

    expect(res.status).toBe(400);
  });

  it('200 updates nutrition targets and echoes them back', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ ...mockUser, targetCalories: 2500 });

    const res = await request(app)
      .patch('/api/user/nutrition-targets')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ calories: 2500, protein: 200, fats: 70, carbs: 280 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.calories).toBe(2500);
    expect(res.body.protein).toBe(200);
  });

  it('200 with empty body — no-op, no DB write', async () => {
    const res = await request(app)
      .patch('/api/user/nutrition-targets')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // No DB write when nothing changed
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

// ─── POST /api/user/weight ────────────────────────────────────────────────────

describe('POST /api/user/weight', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/user/weight')
      .send({ weightKg: 80, date: '2026-04-20' });
    expect(res.status).toBe(401);
  });

  it('400 when weight below minimum (20 kg)', async () => {
    const res = await request(app)
      .post('/api/user/weight')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ weightKg: 10, date: '2026-04-20' });

    expect(res.status).toBe(400);
  });

  it('400 when date format invalid', async () => {
    const res = await request(app)
      .post('/api/user/weight')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ weightKg: 80, date: '20-04-2026' }); // wrong format

    expect(res.status).toBe(400);
  });

  it('200 records body weight via upsert', async () => {
    const record = { id: 'bw-1', userId: 'u-test', weightKg: 82.5, date: new Date('2026-04-20') };
    (prisma.bodyWeight.upsert as jest.Mock).mockResolvedValueOnce(record);

    const res = await request(app)
      .post('/api/user/weight')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ weightKg: 82.5, date: '2026-04-20' });

    expect(res.status).toBe(200);
    expect(res.body.weightKg).toBe(82.5);
  });

  it('SECURITY: upsert uses req.userId from JWT, not a body-supplied userId', async () => {
    const record = { id: 'bw-2', userId: 'u-test', weightKg: 75, date: new Date('2026-04-20') };
    (prisma.bodyWeight.upsert as jest.Mock).mockResolvedValueOnce(record);

    await request(app)
      .post('/api/user/weight')
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      // Attacker supplies a different userId in the body — must be ignored
      .send({ weightKg: 75, date: '2026-04-20', userId: 'u-victim-456' });

    const upsertCalls = (prisma.bodyWeight.upsert as jest.Mock).mock.calls;
    expect(upsertCalls.length).toBeGreaterThan(0);
    const args = upsertCalls[0][0];
    expect(args.where.userId_date.userId).toBe('u-test');
    expect(args.create.userId).toBe('u-test');
    expect(args.where.userId_date.userId).not.toBe('u-victim-456');
  });
});
