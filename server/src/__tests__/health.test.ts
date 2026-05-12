/**
 * Integration tests for server/src/routes/health.ts — round 240 (Phase A
 * of the smartwatch integration).
 *
 * Covers all 5 endpoints:
 *   POST   /api/user/health/sync
 *   GET    /api/user/health/summary
 *   GET    /api/user/devices
 *   POST   /api/user/devices
 *   DELETE /api/user/devices/:id
 *
 * Each block tests: auth gating, Zod validation boundaries, IDOR
 * protection (every write/read filters by req.userId, never trusts
 * body-supplied userId), and the dedupe contract via createMany +
 * skipDuplicates. Follows the cardio.test.ts pattern.
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    cardioSession: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    },
    sleepEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    },
    healthSample: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    },
    connectedDevice: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

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

const baseUser = { id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' };

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
});

// ─── POST /api/user/health/sync ──────────────────────────────────────────────

describe('POST /api/user/health/sync', () => {
  const validCardio = {
    type: 'running',
    date: '2026-05-10',
    durationMinutes: 32,
    distanceKm: 5.4,
    caloriesBurned: 380,
    avgHeartRate: 148,
    maxHeartRate: 172,
    minHeartRate: 62,
    vo2Max: 47.2,
    deviceSource: 'HEALTHKIT',
    externalId: 'HK-workout-abc123',
  };

  const validSleep = {
    date: '2026-05-10',
    bedtime: '23:30',
    wakeTime: '07:15',
    durationHours: 7.75,
    quality: 4,
    stages: { rem: 95, deep: 88, light: 252, awake: 30 },
    spo2Avg: 96,
    awakenings: 2,
    hrvAvg: 48,
    deviceSource: 'HEALTH_CONNECT',
    externalId: 'HC-sleep-2026-05-10',
  };

  const validSample = {
    kind: 'restingHr',
    value: 58,
    unit: 'bpm',
    startAt: '2026-05-10T04:30:00.000Z',
    source: 'HEALTHKIT',
    externalId: 'HK-rhr-2026-05-10',
  };

  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/user/health/sync')
      .send({ cardio: [validCardio] });
    expect(res.status).toBe(401);
  });

  it('200 with empty payload — nothing to ingest', async () => {
    const res = await request(app)
      .post('/api/user/health/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ingested).toEqual({ cardio: 0, sleep: 0, samples: 0 });
  });

  it('200 ingests cardio array via createMany + skipDuplicates', async () => {
    (prisma.cardioSession.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post('/api/user/health/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ cardio: [validCardio] });

    expect(res.status).toBe(200);
    expect(res.body.ingested.cardio).toBe(1);

    const calls = (prisma.cardioSession.createMany as jest.Mock).mock.calls;
    expect(calls[0][0].skipDuplicates).toBe(true);
    expect(calls[0][0].data[0].userId).toBe('u-test');
    expect(calls[0][0].data[0].externalId).toBe('HK-workout-abc123');
  });

  it('200 ingests sleep array', async () => {
    (prisma.sleepEntry.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post('/api/user/health/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ sleep: [validSleep] });

    expect(res.status).toBe(200);
    expect(res.body.ingested.sleep).toBe(1);

    const calls = (prisma.sleepEntry.createMany as jest.Mock).mock.calls;
    expect(calls[0][0].skipDuplicates).toBe(true);
    expect(calls[0][0].data[0].stages).toEqual({ rem: 95, deep: 88, light: 252, awake: 30 });
  });

  it('200 ingests samples array', async () => {
    (prisma.healthSample.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post('/api/user/health/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ samples: [validSample] });

    expect(res.status).toBe(200);
    expect(res.body.ingested.samples).toBe(1);

    const calls = (prisma.healthSample.createMany as jest.Mock).mock.calls;
    expect(calls[0][0].data[0].kind).toBe('restingHr');
    expect(calls[0][0].data[0].startAt).toBeInstanceOf(Date);
  });

  it('400 invalid cardio.type', async () => {
    const res = await request(app)
      .post('/api/user/health/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ cardio: [{ ...validCardio, type: 'yoga' }] });
    expect(res.status).toBe(400);
  });

  it('400 invalid sample.kind', async () => {
    const res = await request(app)
      .post('/api/user/health/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ samples: [{ ...validSample, kind: 'bogus' }] });
    expect(res.status).toBe(400);
  });

  it('400 gpsTrack exceeds 5000 points', async () => {
    const tooManyPoints = Array.from({ length: 5001 }, (_, i) => ({
      lat: 55.7,
      lng: 37.6,
      t: i * 1000,
    }));
    const res = await request(app)
      .post('/api/user/health/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ cardio: [{ ...validCardio, gpsTrack: tooManyPoints }] });
    expect(res.status).toBe(400);
  });

  it('400 cardio array > 2000 items', async () => {
    const bulk = Array.from({ length: 2001 }, () => validCardio);
    const res = await request(app)
      .post('/api/user/health/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ cardio: bulk });
    expect(res.status).toBe(400);
  });

  it('400 avgHeartRate below safety bound (30 bpm)', async () => {
    const res = await request(app)
      .post('/api/user/health/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ cardio: [{ ...validCardio, avgHeartRate: 20 }] });
    expect(res.status).toBe(400);
  });

  it('400 spo2Avg below 50% (implausible)', async () => {
    const res = await request(app)
      .post('/api/user/health/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ sleep: [{ ...validSleep, spo2Avg: 40 }] });
    expect(res.status).toBe(400);
  });

  it('SECURITY: createMany uses req.userId, not body-supplied', async () => {
    (prisma.cardioSession.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    await request(app)
      .post('/api/user/health/sync')
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({
        cardio: [{ ...validCardio, userId: 'u-victim-777' as any }],
      });

    const calls = (prisma.cardioSession.createMany as jest.Mock).mock.calls;
    expect(calls[0][0].data[0].userId).toBe('u-test');
    expect(calls[0][0].data[0].userId).not.toBe('u-victim-777');
  });
});

// ─── GET /api/user/health/summary ────────────────────────────────────────────

describe('GET /api/user/health/summary', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/user/health/summary');
    expect(res.status).toBe(401);
  });

  it('200 returns aggregate shape with no data', async () => {
    const res = await request(app)
      .get('/api/user/health/summary?days=7')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        days: 7,
        today: expect.objectContaining({
          activeMin: 0,
          caloriesFromCardio: 0,
        }),
        restingHr: null,
        latestVo2Max: null,
        latestSpo2: null,
        lastSleep: null,
        cardioSessions: 0,
      }),
    );
  });

  it('200 computes restingHr median from samples', async () => {
    (prisma.healthSample.findMany as jest.Mock).mockResolvedValueOnce([
      { kind: 'restingHr', value: 55, unit: 'bpm', startAt: new Date() },
      { kind: 'restingHr', value: 60, unit: 'bpm', startAt: new Date() },
      { kind: 'restingHr', value: 58, unit: 'bpm', startAt: new Date() },
    ]);

    const res = await request(app)
      .get('/api/user/health/summary?days=7')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.restingHr).toBe(58); // median of [55, 58, 60]
  });

  it('200 clamps days to 30 (max)', async () => {
    const res = await request(app)
      .get('/api/user/health/summary?days=999')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.days).toBe(30);
  });

  it('200 clamps days to 1 (min) when 0 or negative', async () => {
    const res = await request(app)
      .get('/api/user/health/summary?days=0')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.days).toBe(1);
  });

  it('SECURITY: all three findMany queries filter by req.userId', async () => {
    await request(app)
      .get('/api/user/health/summary')
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const cardioCalls = (prisma.cardioSession.findMany as jest.Mock).mock.calls;
    const sleepCalls = (prisma.sleepEntry.findMany as jest.Mock).mock.calls;
    const sampleCalls = (prisma.healthSample.findMany as jest.Mock).mock.calls;

    expect(cardioCalls[0][0].where.userId).toBe('u-test');
    expect(sleepCalls[0][0].where.userId).toBe('u-test');
    expect(sampleCalls[0][0].where.userId).toBe('u-test');
  });
});

// ─── GET /api/user/devices ───────────────────────────────────────────────────

describe('GET /api/user/devices', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/user/devices');
    expect(res.status).toBe(401);
  });

  it('200 returns devices array', async () => {
    (prisma.connectedDevice.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'dev-1', userId: 'u-test', kind: 'apple_watch',
        displayName: 'Apple Watch Series 9', externalId: 'HK-bundle-id',
        capabilities: ['hr', 'sleep'], lastSyncAt: null, createdAt: new Date(),
      },
    ]);

    const res = await request(app)
      .get('/api/user/devices')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].kind).toBe('apple_watch');
  });

  it('SECURITY: findMany filters by req.userId', async () => {
    (prisma.connectedDevice.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/user/devices')
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const calls = (prisma.connectedDevice.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.userId).toBe('u-test');
  });
});

// ─── POST /api/user/devices ──────────────────────────────────────────────────

describe('POST /api/user/devices', () => {
  const validDevice = {
    kind: 'mi_band',
    displayName: 'Mi Band 8 Pro',
    externalId: 'AA:BB:CC:DD:EE:FF',
    capabilities: ['hr', 'steps', 'sleep'],
  };

  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/user/devices')
      .send(validDevice);
    expect(res.status).toBe(401);
  });

  it('400 missing kind', async () => {
    const res = await request(app)
      .post('/api/user/devices')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validDevice, kind: '' });
    expect(res.status).toBe(400);
  });

  it('400 missing externalId', async () => {
    const res = await request(app)
      .post('/api/user/devices')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validDevice, externalId: '' });
    expect(res.status).toBe(400);
  });

  it('201 creates device via upsert (idempotent on kind+externalId)', async () => {
    (prisma.connectedDevice.upsert as jest.Mock).mockResolvedValueOnce({
      id: 'dev-1', userId: 'u-test', ...validDevice,
      lastSyncAt: null, createdAt: new Date(),
    });

    const res = await request(app)
      .post('/api/user/devices')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validDevice);

    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('mi_band');

    const calls = (prisma.connectedDevice.upsert as jest.Mock).mock.calls;
    expect(calls[0][0].where.userId_kind_externalId).toEqual({
      userId: 'u-test',
      kind: 'mi_band',
      externalId: 'AA:BB:CC:DD:EE:FF',
    });
  });

  it('SECURITY: upsert uses req.userId, not body-supplied', async () => {
    (prisma.connectedDevice.upsert as jest.Mock).mockResolvedValueOnce({
      id: 'dev-1', userId: 'u-test', ...validDevice,
      lastSyncAt: null, createdAt: new Date(),
    });

    await request(app)
      .post('/api/user/devices')
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ ...validDevice, userId: 'u-victim-777' as any });

    const calls = (prisma.connectedDevice.upsert as jest.Mock).mock.calls;
    expect(calls[0][0].where.userId_kind_externalId.userId).toBe('u-test');
    expect(calls[0][0].create.userId).toBe('u-test');
  });
});

// ─── DELETE /api/user/devices/:id ────────────────────────────────────────────

describe('DELETE /api/user/devices/:id', () => {
  const DEVICE_ID = 'cdev0000000000000000001';

  it('401 without token', async () => {
    const res = await request(app).delete(`/api/user/devices/${DEVICE_ID}`);
    expect(res.status).toBe(401);
  });

  it('404 when device not found or belongs to another user', async () => {
    (prisma.connectedDevice.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .delete(`/api/user/devices/${DEVICE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('200 deletes device and returns ok', async () => {
    (prisma.connectedDevice.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete(`/api/user/devices/${DEVICE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('SECURITY: deleteMany filters by userId + id — no IDOR', async () => {
    (prisma.connectedDevice.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    await request(app)
      .delete(`/api/user/devices/${DEVICE_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const calls = (prisma.connectedDevice.deleteMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.userId).toBe('u-test');
    expect(calls[0][0].where.id).toBe(DEVICE_ID);
  });
});
