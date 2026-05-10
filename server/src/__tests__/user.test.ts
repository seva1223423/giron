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
      delete: jest.fn(),
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
      findUnique: jest.fn().mockResolvedValue(null),
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
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    otpCode: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    usedTotpCode: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    // $transaction: pass-through default — runs each op individually so existing
    // tests that don't explicitly mock $transaction still work. Tests that need
    // specific batched return values use mockResolvedValueOnce per case.
    $transaction: jest.fn().mockImplementation(async (ops: any) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops);
      }
      return ops; // function form: just run it
    }),
    // $executeRaw: used by recordPasswordHistory to prune old hashes via
    // raw SQL. Default no-op.
    $executeRaw: jest.fn().mockResolvedValue(0),
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
  sendEmailChangedAlert: jest.fn().mockResolvedValue(undefined),
  sendAccountDeletedAlert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/smsService', () => ({
  sendSmsOtp: jest.fn(),
  normalizePhone: jest.fn((p: string) => p),
}));

jest.mock('../services/pushService', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

// Mock bcrypt for endpoints that use it (currently account-delete and
// change-password). compare returns true by default so tests exercise the
// happy path; flip per-test for failure paths via mockResolvedValueOnce(false).
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: { compare: jest.fn().mockResolvedValue(true), hash: jest.fn().mockResolvedValue('hashed') },
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed'),
}));

// Mock expo-server-sdk used by /user/push-token to validate Expo token
// shape (HIGH-10). Default isExpoPushToken returns true; tests flip per
// case to exercise the malformed-token reject path.
const mockIsExpoPushToken = jest.fn().mockReturnValue(true);
jest.mock('expo-server-sdk', () => ({
  __esModule: true,
  default: { isExpoPushToken: mockIsExpoPushToken },
  Expo: { isExpoPushToken: mockIsExpoPushToken },
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

// ─── DELETE /api/user/trusted-devices/:id ────────────────────────────────────

describe('DELETE /api/user/trusted-devices/:id', () => {
  // IDOR regression pin. The route at server/src/routes/user.ts:755 fetches
  // the device with findUnique, then checks `device.userId !== req.userId`
  // and returns 404 (NOT 403 — 404 is the "leakage protection" pattern that
  // hides existence from probes). If the userId check is ever dropped, these
  // tests catch the regression on the next run.
  // Must match CUID_RE = /^c[a-z0-9]{20,30}$/ from routes/user.ts:32
  const OWN_DEVICE_ID = 'cmdevown000000000000001a';
  const OTHER_DEVICE_ID = 'cmdevoth000000000000002b';

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
  });

  it('401 without token', async () => {
    const res = await request(app).delete(`/api/user/trusted-devices/${OWN_DEVICE_ID}`);
    expect(res.status).toBe(401);
  });

  it('SECURITY: 404 when device belongs to another user (IDOR — leakage protection)', async () => {
    (prisma.trustedDevice.findUnique as jest.Mock).mockResolvedValueOnce({
      userId: 'someone-else',
    });

    const res = await request(app)
      .delete(`/api/user/trusted-devices/${OTHER_DEVICE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    // Critically: the delete must NEVER fire for a foreign device. If a future
    // refactor swaps findUnique for "delete with where: id", this assertion
    // breaks immediately.
    expect(prisma.trustedDevice.delete).not.toHaveBeenCalled();
    // And we want the "leakage protection" 404 shape, not 403.
    expect(res.body.error).not.toMatch(/access|доступ|forbidden/i);
  });

  it('404 when device does not exist (same leakage shape)', async () => {
    (prisma.trustedDevice.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/user/trusted-devices/${OWN_DEVICE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(prisma.trustedDevice.delete).not.toHaveBeenCalled();
  });

  it('200 when device belongs to the caller (happy path)', async () => {
    (prisma.trustedDevice.findUnique as jest.Mock).mockResolvedValueOnce({
      userId: mockUser.id,
    });
    (prisma.trustedDevice.delete as jest.Mock).mockResolvedValueOnce({});

    const res = await request(app)
      .delete(`/api/user/trusted-devices/${OWN_DEVICE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.trustedDevice.delete).toHaveBeenCalledWith({
      where: { id: OWN_DEVICE_ID },
    });
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

  it('SECURITY: deleteMany must scope to req.userId (IDOR regression pin)', async () => {
    // The deleteMany pattern is TOCTOU-safe ONLY when the where clause
    // includes userId. If a future refactor drops that filter, this test
    // catches the regression — without the userId scope, any authenticated
    // user could wipe any measurement by guessing dates.
    (prisma.bodyMeasurement.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    await request(app)
      .delete('/api/user/measurements/2026-04-22')
      .set('Authorization', `Bearer ${makeToken()}`);

    const call = (prisma.bodyMeasurement.deleteMany as jest.Mock).mock.calls[0][0];
    expect(call.where.userId).toBe(mockUser.id);
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

  it('SECURITY: deleteMany must scope to req.userId (IDOR regression pin)', async () => {
    // Same TOCTOU-safe rationale as the measurements/:date pin above:
    // deleteMany without userId in the where clause would let user A
    // wipe user B's sleep entries by date.
    await request(app)
      .delete('/api/user/sleep/2026-04-22')
      .set('Authorization', `Bearer ${makeToken()}`);

    const call = (prisma.sleepEntry.deleteMany as jest.Mock).mock.calls[0][0];
    expect(call.where.userId).toBe(mockUser.id);
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

// ─── DELETE /api/user/sessions (logout-everywhere) ───────────────────────────

describe('DELETE /api/user/sessions (all)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
    (prisma.securityEvent.create as jest.Mock).mockResolvedValue({});
  });

  it('401 without token', async () => {
    const res = await request(app).delete('/api/user/sessions');
    expect(res.status).toBe(401);
  });

  it('200 revokes ALL refresh tokens for the calling user', async () => {
    const res = await request(app)
      .delete('/api/user/sessions')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // SECURITY: updateMany must scope by req.userId — never accept a userId
    // from the body. Without this scope a user could revoke ANYONE's
    // sessions by calling DELETE /sessions.
    const updateCalls = (prisma.refreshToken.updateMany as jest.Mock).mock.calls;
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0][0].where).toEqual(
      expect.objectContaining({ userId: 'u-test', revoked: false }),
    );
    expect(updateCalls[0][0].data).toEqual({ revoked: true });

    // Audit trail
    const seCalls = (prisma.securityEvent.create as jest.Mock).mock.calls;
    const auditCall = seCalls.find(
      (c) => c[0]?.data?.action === 'TOKEN_REVOKED' && c[0]?.data?.details === 'all_sessions',
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall![0].data.userId).toBe('u-test');
  });
});

// ─── POST /api/user/onboarding/step ──────────────────────────────────────────

describe('POST /api/user/onboarding/step', () => {
  it('401 without token', async () => {
    const res = await request(app).post('/api/user/onboarding/step').send({ step: 0 });
    expect(res.status).toBe(401);
  });

  it('400 when step is missing', async () => {
    const res = await request(app)
      .post('/api/user/onboarding/step')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('400 when step is out of range', async () => {
    const res = await request(app)
      .post('/api/user/onboarding/step')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ step: 5 });
    expect(res.status).toBe(400);
  });

  it('400 when step is negative', async () => {
    const res = await request(app)
      .post('/api/user/onboarding/step')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ step: -1 });
    expect(res.status).toBe(400);
  });

  it('400 when step is not an integer', async () => {
    const res = await request(app)
      .post('/api/user/onboarding/step')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ step: 1.5 });
    expect(res.status).toBe(400);
  });

  it('200 records first-touch step into onboardingStepLog', async () => {
    // Authenticate middleware → returns mockUser. Route handler then
    // re-queries with select: { onboardingStepLog: true } — return null
    // so the first-time branch runs.
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser) // auth middleware
      .mockResolvedValueOnce({ onboardingStepLog: null }); // route handler
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/user/onboarding/step')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ step: 1 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.step).toBe(1);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-test' },
        data: expect.objectContaining({
          onboardingStepLog: expect.objectContaining({ '1': expect.any(String) }),
        }),
      }),
    );
  });

  it('200 alreadyRecorded=true on idempotent re-submission (does NOT overwrite)', async () => {
    const existingLog = { '0': '2026-04-01T10:00:00.000Z' };
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce({ onboardingStepLog: existingLog });

    const res = await request(app)
      .post('/api/user/onboarding/step')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ step: 0 });

    expect(res.status).toBe(200);
    expect(res.body.alreadyRecorded).toBe(true);
    // Update must NOT be called — first-touch is preserved
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('200 step=4 also stamps onboardingCompletedAt', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce({ onboardingStepLog: { '0': '2026-04-01T10:00:00.000Z' } });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/user/onboarding/step')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ step: 4 });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingCompletedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('404 when user does not exist', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/user/onboarding/step')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ step: 0 });

    expect(res.status).toBe(404);
  });
});

// ─── POST /api/user/change-password ──────────────────────────────────────────
//
// Security-critical: HIGH-6 step-up reauth (current password), 2FA gate +
// TOTP replay check, password-history reuse block, and post-change session
// revocation. Was untested despite covering all of these.

describe('POST /api/user/change-password', () => {
  const userWithPassword = {
    id: 'u-test',
    email: 'test@example.com',
    emailVerified: true,
    passwordHash: 'bcrypt-hash',
    totpEnabled: false,
    totpSecret: null,
  };
  const userWith2FA = {
    ...userWithPassword,
    totpEnabled: true,
    totpSecret: 'JBSWY3DPEHPK3PXP',
  };

  beforeEach(() => {
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.default.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('new-hash');
    bcrypt.default.hash.mockResolvedValue('new-hash');
  });

  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/user/change-password')
      .send({ currentPassword: 'old', newPassword: 'NewPassw0rd!' });
    expect(res.status).toBe(401);
  });

  it('400 when newPassword fails strong-password validation (too short)', async () => {
    const res = await request(app)
      .post('/api/user/change-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ currentPassword: 'old', newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('401 WRONG_CURRENT_PASSWORD when bcrypt.compare returns false', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)              // auth middleware
      .mockResolvedValueOnce(userWithPassword);     // route handler
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValueOnce(false);
    bcrypt.default.compare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/user/change-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ currentPassword: 'wrong', newPassword: 'NewPassw0rd!' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('WRONG_CURRENT_PASSWORD');
    // No password update or session revocation should have happened
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('400 TOTP_REQUIRED when 2FA is enabled but no totpCode provided', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWith2FA);

    const res = await request(app)
      .post('/api/user/change-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ currentPassword: 'old', newPassword: 'NewPassw0rd!' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOTP_REQUIRED');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('200 success — updates password + revokes all sessions atomically', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWithPassword);
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ id: 'u-test' });
    (prisma.$transaction as jest.Mock).mockResolvedValueOnce([
      { count: 2 }, // refresh tokens revoked
      { count: 1 }, // trusted devices wiped
    ]);

    const res = await request(app)
      .post('/api/user/change-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ currentPassword: 'correct', newPassword: 'NewPassw0rd!' });

    expect(res.status).toBe(200);

    // user.update called with new bcrypt hash
    const updateCalls = (prisma.user.update as jest.Mock).mock.calls;
    const pwUpdate = updateCalls.find((c) => c[0]?.data?.passwordHash !== undefined);
    expect(pwUpdate).toBeTruthy();
    expect(pwUpdate![0].data.passwordHash).toBe('new-hash');

    // Sessions wiped via $transaction (atomic) — verify it was called
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

// ─── DELETE /api/user/2fa ────────────────────────────────────────────────────
//
// 2FA disable accepts EITHER current TOTP code OR password (whichever the
// user provides). If 2FA is enabled, a stolen access token alone must NOT
// be enough to disable it. Was untested.
//
// Note: tests below avoid mocking otpauth's TOTP.validate by exercising
// only the password-based path (the route's `else if (password && ...)`
// branch). The TOTP branch is covered indirectly via /admin/users/:id/
// force-disable-2fa tests.

describe('DELETE /api/user/2fa', () => {
  const userWith2FA = {
    id: 'u-test',
    totpEnabled: true,
    totpSecret: 'JBSWY3DPEHPK3PXP',
    passwordHash: 'bcrypt-hash',
  };

  beforeEach(() => {
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.default.compare.mockResolvedValue(true);
  });

  it('401 without token', async () => {
    const res = await request(app).delete('/api/user/2fa').send({ password: 'pw' });
    expect(res.status).toBe(401);
  });

  it('400 TOTP_NOT_ENABLED when 2FA is currently off', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce({
        ...userWith2FA,
        totpEnabled: false,
        totpSecret: null,
      });

    const res = await request(app)
      .delete('/api/user/2fa')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: 'pw' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOTP_NOT_ENABLED');
  });

  it('401 VERIFICATION_FAILED when password is wrong (no code provided)', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWith2FA);
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValueOnce(false);
    bcrypt.default.compare.mockResolvedValueOnce(false);

    const res = await request(app)
      .delete('/api/user/2fa')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('VERIFICATION_FAILED');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('401 VERIFICATION_FAILED when neither code nor password is provided', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWith2FA);

    const res = await request(app)
      .delete('/api/user/2fa')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('VERIFICATION_FAILED');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('200 disables 2FA when correct password provided + writes TOTP_DISABLED event', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWith2FA);
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ id: 'u-test' });

    const res = await request(app)
      .delete('/api/user/2fa')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: 'correct' });

    expect(res.status).toBe(200);

    // Verify 2FA state fully wiped
    const updateCalls = (prisma.user.update as jest.Mock).mock.calls;
    const wipeCall = updateCalls.find(
      (c) => c[0]?.where?.id === 'u-test' && c[0]?.data?.totpEnabled === false,
    );
    expect(wipeCall).toBeTruthy();
    expect(wipeCall![0].data).toEqual(
      expect.objectContaining({
        totpEnabled: false,
        totpSecret: null,
        totpBackupCodes: null,
      }),
    );

    // SecurityEvent for the user's own audit trail
    const seCalls = (prisma.securityEvent.create as jest.Mock).mock.calls;
    const auditCall = seCalls.find((c) => c[0]?.data?.action === 'TOTP_DISABLED');
    expect(auditCall).toBeTruthy();
    expect(auditCall![0].data.userId).toBe('u-test');
  });
});

// ─── POST /api/user/push-token ───────────────────────────────────────────────
//
// Sec audit HIGH-10: refuses silent reassignment of a token already owned by
// another user. Without this guard, an authenticated attacker could submit
// the victim's push token (obtained from a leaked log, shared device etc.),
// hijack notification delivery (DoS the victim's security alerts) AND
// receive crafted security pushes meant for the victim (phishing primitive).

describe('POST /api/user/push-token', () => {
  const VALID_EXPO_TOKEN = 'ExponentPushToken[abcdefghij1234567890]';

  beforeEach(() => {
    mockIsExpoPushToken.mockReturnValue(true); // assume valid by default
  });

  it('401 without token', async () => {
    const res = await request(app).post('/api/user/push-token').send({ token: VALID_EXPO_TOKEN });
    expect(res.status).toBe(401);
  });

  it('400 INVALID_PUSH_TOKEN when format check fails', async () => {
    mockIsExpoPushToken.mockReturnValueOnce(false);

    const res = await request(app)
      .post('/api/user/push-token')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ token: 'not-an-expo-token' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PUSH_TOKEN');
    expect(prisma.pushToken.upsert).not.toHaveBeenCalled();
  });

  it('SECURITY HIGH-10: 409 PUSH_TOKEN_OWNED when token already belongs to another user', async () => {
    (prisma.pushToken.findUnique as jest.Mock).mockResolvedValueOnce({ userId: 'u-victim' });

    const res = await request(app)
      .post('/api/user/push-token')
      .set('Authorization', `Bearer ${makeToken('u-attacker')}`)
      .send({ token: VALID_EXPO_TOKEN });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PUSH_TOKEN_OWNED');
    expect(prisma.pushToken.upsert).not.toHaveBeenCalled();

    // Both sides get a security event so the legit owner can see the
    // attempted takeover via /user/security-events
    const seCalls = (prisma.securityEvent.create as jest.Mock).mock.calls;
    const attemptCall = seCalls.find(
      (c) => c[0]?.data?.action === 'PUSH_TOKEN_TAKEOVER_BLOCKED' && c[0]?.data?.details === 'attempt',
    );
    const targetCall = seCalls.find(
      (c) => c[0]?.data?.action === 'PUSH_TOKEN_TAKEOVER_BLOCKED' && c[0]?.data?.details === 'target',
    );
    expect(attemptCall).toBeTruthy();
    expect(targetCall).toBeTruthy();
    // Attempt event lands on the attacker, target event on the legit owner
    expect(attemptCall![0].data.userId).toBe('u-attacker');
    expect(targetCall![0].data.userId).toBe('u-victim');
  });

  it('200 succeeds when token is unowned (new device registration)', async () => {
    (prisma.pushToken.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/user/push-token')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ token: VALID_EXPO_TOKEN });

    expect(res.status).toBe(200);
    expect(prisma.pushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: VALID_EXPO_TOKEN },
        create: expect.objectContaining({ token: VALID_EXPO_TOKEN, userId: 'u-test' }),
      }),
    );
  });

  it('200 succeeds when token already belongs to caller (reauth/refresh path)', async () => {
    // Same user re-registering — common after an OS-level token rotation
    (prisma.pushToken.findUnique as jest.Mock).mockResolvedValueOnce({ userId: 'u-test' });

    const res = await request(app)
      .post('/api/user/push-token')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ token: VALID_EXPO_TOKEN });

    expect(res.status).toBe(200);
    // Should hit the upsert path (no takeover block)
    expect(prisma.pushToken.upsert).toHaveBeenCalled();
  });
});

// ─── POST /api/user/change-phone ─────────────────────────────────────────────
//
// Same security pattern as /change-email: HIGH-6 step-up reauth (the SMS OTP
// goes to the new attacker-chosen phone, so it adds zero proof of identity)
// + 2FA gate + phone-change OTP + atomic mark-as-used + post-change session
// revocation. Was untested.

describe('POST /api/user/change-phone', () => {
  const userWithPassword = {
    id: 'u-test',
    passwordHash: 'bcrypt-hash',
    totpEnabled: false,
    totpSecret: null,
  };
  const socialOnlyUser = {
    id: 'u-test',
    passwordHash: null,
    totpEnabled: false,
    totpSecret: null,
  };
  const NEW_PHONE = '+79991234567';
  const VALID_OTP = '123456';

  beforeEach(() => {
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.default.compare.mockResolvedValue(true);
  });

  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/user/change-phone')
      .send({ phone: NEW_PHONE, code: VALID_OTP });
    expect(res.status).toBe(401);
  });

  it('403 STEPUP_REQUIRED for social-only account without 2FA', async () => {
    // Same HIGH-6 rationale as /change-email: a stolen access token must
    // not be enough to repoint the phone on a social-only account.
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)        // auth middleware
      .mockResolvedValueOnce(socialOnlyUser); // route handler

    const res = await request(app)
      .post('/api/user/change-phone')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ phone: NEW_PHONE, code: VALID_OTP });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STEPUP_REQUIRED');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('400 PASSWORD_REQUIRED when user has password but none provided', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWithPassword);

    const res = await request(app)
      .post('/api/user/change-phone')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ phone: NEW_PHONE, code: VALID_OTP });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_REQUIRED');
  });

  it('401 INVALID_PASSWORD writes REAUTH_FAILED security event', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWithPassword);
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValueOnce(false);
    bcrypt.default.compare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/user/change-phone')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ phone: NEW_PHONE, code: VALID_OTP, currentPassword: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_PASSWORD');
    // SECURITY: must write REAUTH_FAILED audit so a brute-force pattern
    // shows up in /user/security-events
    const seCalls = (prisma.securityEvent.create as jest.Mock).mock.calls;
    const auditCall = seCalls.find((c) => c[0]?.data?.action === 'REAUTH_FAILED');
    expect(auditCall).toBeTruthy();
    expect(auditCall![0].data.details).toContain('change-phone');
  });

  it('400 INVALID_OTP when no active phone-change OTP found', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWithPassword);
    (prisma.otpCode.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/user/change-phone')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ phone: NEW_PHONE, code: VALID_OTP, currentPassword: 'correct' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OTP');
  });
});

// ─── POST /api/user/change-email — step-up reauth (sec audit HIGH-6) ─────────
//
// Email is the account's recovery anchor. A stolen 60-min access token alone
// must NOT be enough to repoint the email — once the attacker controls the
// email they can trigger /auth/forgot-password and lock the legitimate owner
// out permanently. The /change-email route requires either:
//   - current password (for password owners), or
//   - TOTP code (for 2FA users), or
//   - rejects entirely (social-only without 2FA).
//
// These pins guard the contract from a refactor that drops the gate.

describe('POST /api/user/change-email — step-up reauth', () => {
  const userWithPassword = {
    id: 'u-test',
    email: 'old@example.com',
    passwordHash: 'bcrypt-hash',
    totpEnabled: false,
    totpSecret: null,
    isBanned: false,
    lockedUntil: null,
    role: 'USER',
    healthRestrictions: [],
  };

  const userSocialOnly = {
    id: 'u-test',
    email: 'social@example.com',
    passwordHash: null,
    totpEnabled: false,
    totpSecret: null,
    isBanned: false,
    lockedUntil: null,
    role: 'USER',
    healthRestrictions: [],
  };

  const NEW_EMAIL = 'new@example.com';
  const VALID_OTP = '123456';

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(userWithPassword);
  });

  it('401 without token', async () => {
    const res = await request(app).post('/api/user/change-email').send({});
    expect(res.status).toBe(401);
  });

  it('SECURITY: 400 PASSWORD_REQUIRED when user has password but didn\'t send currentPassword', async () => {
    // Without currentPassword, the route must NOT proceed — a stolen
    // access token alone cannot repoint email. Asserts the gate.
    const res = await request(app)
      .post('/api/user/change-email')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ email: NEW_EMAIL, code: VALID_OTP });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_REQUIRED');
    // No email update should have happened — authenticate-middleware may
    // touch lastActiveAt but the route-level email change must not fire.
    const updateCalls = (prisma.user.update as jest.Mock).mock.calls;
    const emailUpdateFired = updateCalls.some((c) => c[0]?.data?.email !== undefined);
    expect(emailUpdateFired).toBe(false);
  });

  it('SECURITY: 401 INVALID_PASSWORD on wrong password + REAUTH_FAILED audit logged', async () => {
    // Wrong password attempt must:
    //   1. Return 401 + code INVALID_PASSWORD
    //   2. Log REAUTH_FAILED security event (so brute-force gets caught
    //      by SIEM / log alert)
    //   3. NOT trigger an email update
    const bcrypt = require('bcryptjs').default;
    bcrypt.compare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/user/change-email')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ email: NEW_EMAIL, code: VALID_OTP, currentPassword: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_PASSWORD');

    // SECURITY: REAUTH_FAILED security event must be written so a SIEM
    // / brute-force monitor can spot the pattern.
    const seCalls = (prisma.securityEvent.create as jest.Mock).mock.calls;
    const auditCall = seCalls.find((c) => c[0]?.data?.action === 'REAUTH_FAILED');
    expect(auditCall).toBeDefined();
    expect(auditCall![0].data.userId).toBe('u-test');
    expect(auditCall![0].data.details).toContain('op=change-email');

    const updateCalls = (prisma.user.update as jest.Mock).mock.calls;
    expect(updateCalls.some((c) => c[0]?.data?.email !== undefined)).toBe(false);
  });

  it('SECURITY: 403 STEPUP_REQUIRED when account is social-only (no password, no 2FA)', async () => {
    // A social-only account where the attacker captured a Google/VK access
    // token must NOT be able to repoint the email — there's no second
    // factor to prove identity. Route forces user to add password or 2FA
    // first.
    //
    // Use mockResolvedValue (not Once) because the route fetches the user
    // BOTH inside the authenticate middleware AND again in the handler.
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(userSocialOnly);

    const res = await request(app)
      .post('/api/user/change-email')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ email: NEW_EMAIL, code: VALID_OTP });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STEPUP_REQUIRED');
    const updateCalls = (prisma.user.update as jest.Mock).mock.calls;
    expect(updateCalls.some((c) => c[0]?.data?.email !== undefined)).toBe(false);
  });

  it('SECURITY: 400 TOTP_REQUIRED when 2FA is enabled but totpCode missing', async () => {
    // mockResolvedValue (not Once) — authenticate middleware AND route
    // handler both call findUnique.
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...userWithPassword,
      totpEnabled: true,
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });

    const res = await request(app)
      .post('/api/user/change-email')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ email: NEW_EMAIL, code: VALID_OTP, currentPassword: 'correct' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOTP_REQUIRED');
    const updateCalls = (prisma.user.update as jest.Mock).mock.calls;
    expect(updateCalls.some((c) => c[0]?.data?.email !== undefined)).toBe(false);
  });
});

// ─── DELETE /api/user/account ────────────────────────────────────────────────
//
// 152-FZ right-to-erasure compliance + sec audit HIGH-7 (step-up reauth on
// destructive ops). The endpoint cascades the user row, which Prisma schema
// has wired with onDelete: Cascade across every relation — so a regression
// here could either:
//   - Allow a 60-min access token alone to permanently destroy an account
//     (no password/2FA confirmation), or
//   - Block legitimate deletion when the user types the right password
//
// Both are user-visible high-severity bugs.

describe('DELETE /api/user/account', () => {
  const userWithPasswordOnly = {
    id: 'u-test',
    email: 'test@example.com',
    passwordHash: 'bcrypt-hash',
    totpEnabled: false,
    totpSecret: null,
  };
  const userWithPasswordAnd2FA = {
    ...userWithPasswordOnly,
    totpEnabled: true,
    totpSecret: 'JBSWY3DPEHPK3PXP', // base32 — not actually validated since we mock
  };
  const socialOnlyUser = {
    id: 'u-test',
    email: 'social@example.com',
    passwordHash: null, // OAuth-only account
    totpEnabled: false,
    totpSecret: null,
  };

  beforeEach(() => {
    // Reset bcrypt mock to default (compare returns true)
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.default.compare.mockResolvedValue(true);
  });

  it('401 without token', async () => {
    const res = await request(app).delete('/api/user/account').send({ password: 'pw' });
    expect(res.status).toBe(401);
  });

  it('403 STEPUP_REQUIRED when account has no password AND no 2FA (HIGH-7)', async () => {
    // Sec audit HIGH-7: a social-only account without 2FA used to be
    // deletable by anyone holding the access token. Now we refuse.
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)        // auth middleware
      .mockResolvedValueOnce(socialOnlyUser); // route handler

    const res = await request(app)
      .delete('/api/user/account')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STEPUP_REQUIRED');
    // No deletion should have happened
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('400 PASSWORD_REQUIRED when user has password but none provided', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWithPasswordOnly);

    const res = await request(app)
      .delete('/api/user/account')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_REQUIRED');
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('401 WRONG_PASSWORD when password does not match', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWithPasswordOnly);
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValueOnce(false);
    bcrypt.default.compare.mockResolvedValueOnce(false);

    const res = await request(app)
      .delete('/api/user/account')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('WRONG_PASSWORD');
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('400 TOTP_REQUIRED when 2FA is enabled but no totpCode provided', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWithPasswordAnd2FA);

    const res = await request(app)
      .delete('/api/user/account')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: 'pw' }); // password ok but no totpCode

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOTP_REQUIRED');
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('200 deletes account + writes ACCOUNT_DELETED security event', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWithPasswordOnly);
    (prisma.user.delete as jest.Mock).mockResolvedValueOnce({ id: 'u-test' });

    const res = await request(app)
      .delete('/api/user/account')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    // Cascade deletion happened
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u-test' } });
    // Audit trail: must write ACCOUNT_DELETED BEFORE the delete cascade
    // (otherwise the FK reference would be gone). This ordering is
    // critical — verify it via call order.
    const seCalls = (prisma.securityEvent.create as jest.Mock).mock.calls;
    const auditCall = seCalls.find((c) => c[0]?.data?.action === 'ACCOUNT_DELETED');
    expect(auditCall).toBeTruthy();
    expect(auditCall![0].data.userId).toBe('u-test');
    // SECURITY: AdminLog/SecurityEvent.details must NOT carry the full
    // email — 152-ФЗ right-to-erasure applies after user deletes, but a
    // raw email in details would survive forever in the audit log. The
    // route stores a redacted form (e.g. `t***t@example.com`).
    const details = auditCall![0].data.details as string;
    expect(details).not.toContain(userWithPasswordOnly.email);
    expect(details).toMatch(/\*\*\*/); // contains the redaction marker
  });

  it('round 236: fires sendAccountDeletedAlert with email + ip BEFORE delete', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sendAccountDeletedAlert } = require('../services/emailService');
    (sendAccountDeletedAlert as jest.Mock).mockClear();

    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWithPasswordOnly);
    (prisma.user.delete as jest.Mock).mockResolvedValueOnce({ id: 'u-test' });

    await request(app)
      .delete('/api/user/account')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: 'correct-password' });

    expect(sendAccountDeletedAlert).toHaveBeenCalledTimes(1);
    const [calledEmail, calledIp, calledDate] = (sendAccountDeletedAlert as jest.Mock).mock.calls[0];
    expect(calledEmail).toBe('test@example.com');
    expect(typeof calledIp).toBe('string');
    expect(calledDate).toBeInstanceOf(Date);

    // Ordering: alert must be invoked BEFORE prisma.user.delete so that
    // user.email is still resolvable (it's local var here, but the
    // contract documents the ordering — pinning it prevents a future
    // refactor from accidentally moving the SMTP call after the cascade
    // and losing the in-flight reference).
    const alertOrder = (sendAccountDeletedAlert as jest.Mock).mock.invocationCallOrder[0];
    const deleteOrder = (prisma.user.delete as jest.Mock).mock.invocationCallOrder[0];
    expect(alertOrder).toBeLessThan(deleteOrder);
  });

  it('round 236: SMTP failure on alert does NOT block account delete', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sendAccountDeletedAlert } = require('../services/emailService');
    (sendAccountDeletedAlert as jest.Mock).mockReset();
    (sendAccountDeletedAlert as jest.Mock).mockRejectedValueOnce(new Error('SMTP timeout'));

    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce(userWithPasswordOnly);
    (prisma.user.delete as jest.Mock).mockResolvedValueOnce({ id: 'u-test' });

    const res = await request(app)
      .delete('/api/user/account')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: 'correct-password' });

    expect(res.status).toBe(200);
    // The delete still happened despite the SMTP failure — irreversible
    // commitment from user-pressed-button shouldn't strand on a flaky
    // mail server.
    expect(prisma.user.delete).toHaveBeenCalledTimes(1);

    // Restore the success mock for any later tests that share this suite.
    (sendAccountDeletedAlert as jest.Mock).mockResolvedValue(undefined);
  });
});
