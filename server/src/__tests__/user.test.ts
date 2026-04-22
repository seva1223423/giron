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
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
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
      upsert: jest.fn().mockResolvedValue({}),
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
      findMany: jest.fn().mockResolvedValue([]),
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

// ─── GET /api/user/weight ─────────────────────────────────────────────────────

describe('GET /api/user/weight', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/user/weight');
    expect(res.status).toBe(401);
  });

  it('200 returns weight history sorted by date desc (max 90)', async () => {
    const records = [
      { id: 'bw-1', userId: 'u-test', weightKg: 82.5, date: new Date('2026-04-22') },
      { id: 'bw-2', userId: 'u-test', weightKg: 81.0, date: new Date('2026-04-15') },
    ];
    (prisma.bodyWeight.findMany as jest.Mock).mockResolvedValueOnce(records);

    const res = await request(app)
      .get('/api/user/weight')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

// ─── POST /api/user/measurements ─────────────────────────────────────────────

describe('POST /api/user/measurements', () => {
  it('401 without token', async () => {
    const res = await request(app).post('/api/user/measurements').send({ date: '2026-04-22', chest: 100 });
    expect(res.status).toBe(401);
  });

  it('400 when date format is invalid', async () => {
    const res = await request(app)
      .post('/api/user/measurements')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ date: '22-04-2026', chest: 100 }); // wrong format
    expect(res.status).toBe(400);
  });

  it('400 when measurement value exceeds max (chest > 300)', async () => {
    const res = await request(app)
      .post('/api/user/measurements')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ date: '2026-04-22', chest: 999 }); // out of range
    expect(res.status).toBe(400);
  });

  it('200 upserts measurement using req.userId', async () => {
    const record = { id: 'm-1', userId: 'u-test', date: new Date('2026-04-22'), chest: 100 };
    (prisma.bodyMeasurement.upsert as jest.Mock).mockResolvedValueOnce(record);

    const res = await request(app)
      .post('/api/user/measurements')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ date: '2026-04-22', chest: 100, waist: 80 });

    expect(res.status).toBe(200);

    const upsertCalls = (prisma.bodyMeasurement.upsert as jest.Mock).mock.calls;
    expect(upsertCalls[0][0].create.userId).toBe('u-test');
  });
});

// ─── GET /api/user/measurements ──────────────────────────────────────────────

describe('GET /api/user/measurements', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/user/measurements');
    expect(res.status).toBe(401);
  });

  it('200 returns measurements (capped at FREE_MEASUREMENTS_LIMIT for free users)', async () => {
    const records = [{ id: 'm-1', userId: 'u-test', date: '2026-04-22', chest: 100 }];
    (prisma.bodyMeasurement.findMany as jest.Mock).mockResolvedValueOnce(records);

    const res = await request(app)
      .get('/api/user/measurements')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    // Free user: findMany called with take=5 (FREE_MEASUREMENTS_LIMIT)
    const findManyCalls = (prisma.bodyMeasurement.findMany as jest.Mock).mock.calls;
    expect(findManyCalls[0][0].take).toBe(5);
  });
});

// ─── POST /api/user/sleep ─────────────────────────────────────────────────────

describe('POST /api/user/sleep', () => {
  const validSleep = {
    date: '2026-04-22',
    bedtime: '22:30',
    wakeTime: '07:00',
    durationHours: 8.5,
    quality: 4,
  };

  it('401 without token', async () => {
    const res = await request(app).post('/api/user/sleep').send(validSleep);
    expect(res.status).toBe(401);
  });

  it('400 when bedtime format is invalid (not HH:MM)', async () => {
    const res = await request(app)
      .post('/api/user/sleep')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validSleep, bedtime: '10pm' }); // wrong format
    expect(res.status).toBe(400);
  });

  it('400 when durationHours exceeds maximum (24h)', async () => {
    const res = await request(app)
      .post('/api/user/sleep')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validSleep, durationHours: 25 });
    expect(res.status).toBe(400);
  });

  it('200 upserts sleep entry with req.userId', async () => {
    const entry = { id: 'sl-1', userId: 'u-test', ...validSleep };
    (prisma.sleepEntry.upsert as jest.Mock).mockResolvedValueOnce(entry);

    const res = await request(app)
      .post('/api/user/sleep')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validSleep);

    expect(res.status).toBe(200);
    const upsertCalls = (prisma.sleepEntry.upsert as jest.Mock).mock.calls;
    expect(upsertCalls[0][0].create.userId).toBe('u-test');
  });
});

// ─── GET /api/user/sleep ──────────────────────────────────────────────────────

describe('GET /api/user/sleep', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/user/sleep');
    expect(res.status).toBe(401);
  });

  it('200 returns sleep entries (last 90)', async () => {
    const entries = [{ id: 'sl-1', userId: 'u-test', date: '2026-04-22', durationHours: 8 }];
    (prisma.sleepEntry.findMany as jest.Mock).mockResolvedValueOnce(entries);

    const res = await request(app)
      .get('/api/user/sleep')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

// ─── GET /api/user/trusted-devices ────────────────────────────────────────────

describe('GET /api/user/trusted-devices', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/user/trusted-devices');
    expect(res.status).toBe(401);
  });

  it('200 returns list of trusted devices', async () => {
    const devices = [
      { id: 'dev-1', userId: 'u-test', name: 'iPhone 15', createdAt: new Date().toISOString() },
    ];
    (prisma.trustedDevice.findMany as jest.Mock).mockResolvedValueOnce(devices);

    const res = await request(app)
      .get('/api/user/trusted-devices')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('iPhone 15');
  });
});

// ─── DELETE /api/user/measurements/:date ─────────────────────────────────────

describe('DELETE /api/user/measurements/:date', () => {
  it('401 without token', async () => {
    const res = await request(app).delete('/api/user/measurements/2026-04-22');
    expect(res.status).toBe(401);
  });

  it('400 when date format is invalid', async () => {
    const res = await request(app)
      .delete('/api/user/measurements/not-a-date')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when no measurement exists for that date', async () => {
    (prisma.bodyMeasurement.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .delete('/api/user/measurements/2026-04-22')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('200 deletes measurement for the given date', async () => {
    (prisma.bodyMeasurement.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete('/api/user/measurements/2026-04-22')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── DELETE /api/user/sleep/:date ─────────────────────────────────────────────

describe('DELETE /api/user/sleep/:date', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.sleepEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('401 without token', async () => {
    const res = await request(app).delete('/api/user/sleep/2026-04-22');
    expect(res.status).toBe(401);
  });

  it('400 for invalid date format', async () => {
    const res = await request(app)
      .delete('/api/user/sleep/not-a-date')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/);
  });

  it('200 deletes sleep entry for the given date', async () => {
    const res = await request(app)
      .delete('/api/user/sleep/2026-04-22')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('404 when no entry exists for that date', async () => {
    (prisma.sleepEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .delete('/api/user/sleep/2026-01-01')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

// ─── GET /api/user/has-password ───────────────────────────────────────────────

describe('GET /api/user/has-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/user/has-password');
    expect(res.status).toBe(401);
  });

  it('200 returns hasPassword true when hash is set', async () => {
    // authenticate calls user.findUnique first; then the route calls it again for passwordHash
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' }) // authenticate
      .mockResolvedValueOnce({ passwordHash: '$2b$10$hashedpassword' }); // route lookup

    const res = await request(app)
      .get('/api/user/has-password')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.hasPassword).toBe(true);
  });

  it('200 returns hasPassword false when hash is null', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' }) // authenticate
      .mockResolvedValueOnce({ passwordHash: null }); // route lookup

    const res = await request(app)
      .get('/api/user/has-password')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.hasPassword).toBe(false);
  });
});

// ─── GET /api/user/security-events ───────────────────────────────────────────

describe('GET /api/user/security-events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.securityEvent.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/user/security-events');
    expect(res.status).toBe(401);
  });

  it('200 returns security events for the authenticated user', async () => {
    const sampleEvent = {
      id: 'cevt0000000000000000001',
      action: 'LOGIN_SUCCESS',
      ip: '127.0.0.1',
      userAgent: 'Jest',
      createdAt: new Date().toISOString(),
      details: null,
    };
    (prisma.securityEvent.findMany as jest.Mock).mockResolvedValueOnce([sampleEvent]);

    const res = await request(app)
      .get('/api/user/security-events')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].action).toBe('LOGIN_SUCCESS');
  });
});

// ─── GET /api/user/sessions ───────────────────────────────────────────────────

describe('GET /api/user/sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/user/sessions');
    expect(res.status).toBe(401);
  });

  it('200 returns active sessions scoped to authenticated user', async () => {
    const sampleSession = {
      id: 'csess0000000000000001',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      userAgent: 'Jest/1.0',
      ip: '127.0.0.1',
    };
    (prisma.refreshToken.findMany as jest.Mock).mockResolvedValueOnce([sampleSession]);

    const res = await request(app)
      .get('/api/user/sessions')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('csess0000000000000001');
  });
});

// ─── DELETE /api/user/sessions/:id ───────────────────────────────────────────

const SESSION_ID = 'csess0000000000000001';

describe('DELETE /api/user/sessions/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({ userId: 'u-test' });
    (prisma.refreshToken.update as jest.Mock).mockResolvedValue({});
  });

  it('401 without token', async () => {
    const res = await request(app).delete(`/api/user/sessions/${SESSION_ID}`);
    expect(res.status).toBe(401);
  });

  it('404 IDOR — cannot revoke another user\'s session', async () => {
    // Session belongs to a different user
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValueOnce({ userId: 'u-other' });

    const res = await request(app)
      .delete(`/api/user/sessions/${SESSION_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(prisma.refreshToken.update).not.toHaveBeenCalled();
  });

  it('200 revokes own session', async () => {
    const res = await request(app)
      .delete(`/api/user/sessions/${SESSION_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revoked: true } }),
    );
  });
});
