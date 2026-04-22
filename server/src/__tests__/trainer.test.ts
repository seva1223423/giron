/**
 * Integration tests for server/src/routes/trainer.ts
 *
 * Covers: GET/POST/PATCH/DELETE /clients — auth gating, trainer-role
 * enforcement, input validation, and IDOR protection via trainerId filter.
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
    trainerClient: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    trainerSession: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
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

const makeToken = (userId = 'u-trainer', role = 'TRAINER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });

// Trainer user — role TRAINER bypasses subscription check via fast-path
const trainerUser = { id: 'u-trainer', isBanned: false, lockedUntil: null, role: 'TRAINER' };
// Regular user — will get 403 on trainer routes
const regularUser = { id: 'u-regular', isBanned: false, lockedUntil: null, role: 'USER' };

const CLIENT_ID = 'cclient00000000000000001';

const sampleClient = {
  id: CLIENT_ID,
  trainerId: 'u-trainer',
  name: 'Ivan Petrov',
  phone: '+79001234567',
  age: 28,
  goal: 'Похудение',
  level: 'Начинающий',
  notes: null,
  totalWorkouts: 0,
  lastVisit: null,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(trainerUser);
});

// ─── GET /api/trainer/clients ─────────────────────────────────────────────────

describe('GET /api/trainer/clients', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/trainer/clients');
    expect(res.status).toBe(401);
  });

  it('403 for regular USER (no trainer role, no trainer subscription)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);

    expect(res.status).toBe(403);
  });

  it('200 for TRAINER role user', async () => {
    (prisma.trainerClient.findMany as jest.Mock).mockResolvedValueOnce([sampleClient]);

    const res = await request(app)
      .get('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Ivan Petrov');
  });

  it('200 via trainer subscription (not TRAINER role, but active trainer plan)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      plan: 'trainer',
      status: 'active',
      endDate: new Date(Date.now() + 86_400_000), // valid
    });
    (prisma.trainerClient.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);

    expect(res.status).toBe(200);
  });

  it('SECURITY: findMany filters by req.userId (trainerId)', async () => {
    (prisma.trainerClient.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken('u-trainer')}`);

    const calls = (prisma.trainerClient.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.trainerId).toBe('u-trainer');
  });
});

// ─── POST /api/trainer/clients ────────────────────────────────────────────────

describe('POST /api/trainer/clients', () => {
  const validPayload = { name: 'Anna Ivanova', age: 30, goal: 'Набор массы', level: 'Средний' };

  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/trainer/clients')
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  it('403 for non-trainer user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send(validPayload);

    expect(res.status).toBe(403);
  });

  it('400 when name is empty', async () => {
    const res = await request(app)
      .post('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: '', age: 25 });

    expect(res.status).toBe(400);
  });

  it('201 creates client with trainerId from JWT', async () => {
    (prisma.trainerClient.create as jest.Mock).mockResolvedValueOnce(sampleClient);

    const res = await request(app)
      .post('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(CLIENT_ID);
  });

  it('SECURITY: create uses req.userId as trainerId, not body-supplied trainerId', async () => {
    (prisma.trainerClient.create as jest.Mock).mockResolvedValueOnce(sampleClient);

    await request(app)
      .post('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken('u-trainer')}`)
      .send({ ...validPayload, trainerId: 'u-victim-trainer' }); // must be ignored

    const createCalls = (prisma.trainerClient.create as jest.Mock).mock.calls;
    expect(createCalls.length).toBeGreaterThan(0);
    expect(createCalls[0][0].data.trainerId).toBe('u-trainer');
    expect(createCalls[0][0].data.trainerId).not.toBe('u-victim-trainer');
  });
});

// ─── DELETE /api/trainer/clients/:id ─────────────────────────────────────────

describe('DELETE /api/trainer/clients/:id', () => {
  it('401 without token', async () => {
    const res = await request(app).delete(`/api/trainer/clients/${CLIENT_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .delete('/api/trainer/clients/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when client not found or belongs to different trainer', async () => {
    (prisma.trainerClient.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .delete(`/api/trainer/clients/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('200 deletes client and returns success', async () => {
    (prisma.trainerClient.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete(`/api/trainer/clients/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('SECURITY: deleteMany includes trainerId filter — IDOR protection', async () => {
    (prisma.trainerClient.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    await request(app)
      .delete(`/api/trainer/clients/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-trainer')}`);

    const calls = (prisma.trainerClient.deleteMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.trainerId).toBe('u-trainer');
    expect(calls[0][0].where.id).toBe(CLIENT_ID);
  });
});
