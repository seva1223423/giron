/**
 * Integration tests for server/src/routes/cardio.ts
 *
 * Covers: GET /, POST /, DELETE /:id — auth gating, Zod validation,
 * IDOR protection via userId filter on all mutations.
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
      findMany: jest.fn(),
      create: jest.fn(),
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

const sampleSession = {
  id: 'ccardio00000000000000001',
  userId: 'u-test',
  type: 'running',
  date: '2026-04-20',
  durationMinutes: 30,
  distanceKm: 5,
  caloriesBurned: 320,
  avgHeartRate: 145,
  notes: null,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
});

// ─── GET /api/cardio ──────────────────────────────────────────────────────────

describe('GET /api/cardio', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/cardio');
    expect(res.status).toBe(401);
  });

  it('200 returns sessions array', async () => {
    (prisma.cardioSession.findMany as jest.Mock).mockResolvedValueOnce([sampleSession]);

    const res = await request(app)
      .get('/api/cardio')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('running');
  });

  it('200 returns empty array when no sessions', async () => {
    (prisma.cardioSession.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/cardio')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('SECURITY: findMany filters by req.userId', async () => {
    (prisma.cardioSession.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/cardio')
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const calls = (prisma.cardioSession.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.userId).toBe('u-test');
  });
});

// ─── POST /api/cardio ─────────────────────────────────────────────────────────

describe('POST /api/cardio', () => {
  const validPayload = {
    type: 'running',
    date: '2026-04-20',
    durationMinutes: 30,
    distanceKm: 5,
    caloriesBurned: 320,
  };

  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/cardio')
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  it('400 when type is invalid', async () => {
    const res = await request(app)
      .post('/api/cardio')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validPayload, type: 'yoga' }); // not in enum

    expect(res.status).toBe(400);
  });

  it('400 when durationMinutes is 0 (min is 1)', async () => {
    const res = await request(app)
      .post('/api/cardio')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validPayload, durationMinutes: 0 });

    expect(res.status).toBe(400);
  });

  it('400 when avgHeartRate is below 30 (implausible)', async () => {
    const res = await request(app)
      .post('/api/cardio')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validPayload, avgHeartRate: 20 }); // below min 30

    expect(res.status).toBe(400);
  });

  it('201 creates session with valid payload', async () => {
    (prisma.cardioSession.create as jest.Mock).mockResolvedValueOnce(sampleSession);

    const res = await request(app)
      .post('/api/cardio')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('running');
    expect(res.body.durationMinutes).toBe(30);
  });

  it('201 accepts minimal payload (only required fields)', async () => {
    const minimalSession = { ...sampleSession, distanceKm: null, caloriesBurned: null, avgHeartRate: null };
    (prisma.cardioSession.create as jest.Mock).mockResolvedValueOnce(minimalSession);

    const res = await request(app)
      .post('/api/cardio')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ type: 'walking', date: '2026-04-20', durationMinutes: 45 });

    expect(res.status).toBe(201);
  });

  it('SECURITY: create uses req.userId from JWT, not body-supplied userId', async () => {
    (prisma.cardioSession.create as jest.Mock).mockResolvedValueOnce(sampleSession);

    await request(app)
      .post('/api/cardio')
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ ...validPayload, userId: 'u-victim-777' }); // must be ignored

    const createCalls = (prisma.cardioSession.create as jest.Mock).mock.calls;
    expect(createCalls.length).toBeGreaterThan(0);
    expect(createCalls[0][0].data.userId).toBe('u-test');
    expect(createCalls[0][0].data.userId).not.toBe('u-victim-777');
  });
});

// ─── DELETE /api/cardio/:id ───────────────────────────────────────────────────

describe('DELETE /api/cardio/:id', () => {
  const SESSION_ID = 'ccardio00000000000000001';

  it('401 without token', async () => {
    const res = await request(app).delete(`/api/cardio/${SESSION_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .delete('/api/cardio/not-a-valid-cuid')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when session not found or belongs to another user', async () => {
    (prisma.cardioSession.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .delete(`/api/cardio/${SESSION_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('200 deletes session and returns success', async () => {
    (prisma.cardioSession.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete(`/api/cardio/${SESSION_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('SECURITY: deleteMany includes userId filter — no IDOR on delete', async () => {
    (prisma.cardioSession.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    await request(app)
      .delete(`/api/cardio/${SESSION_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const deleteManyCalls = (prisma.cardioSession.deleteMany as jest.Mock).mock.calls;
    expect(deleteManyCalls[0][0].where.userId).toBe('u-test');
    expect(deleteManyCalls[0][0].where.id).toBe(SESSION_ID);
  });
});
