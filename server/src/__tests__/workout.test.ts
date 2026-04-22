/**
 * Integration tests for server/src/routes/workout.ts
 *
 * Covers: programs CRUD (GET/POST/PATCH/DELETE), GET /history,
 * GET /exercises — auth gating, Zod validation, and IDOR protection
 * via userId filter on all mutations.
 *
 * Note: leaderboard, start/complete/sync are covered in subscription_gating
 * and bugs_regression test suites.
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
    program: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    workout: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    exercise: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../utils/memCache', () => {
  const mc = { get: jest.fn().mockReturnValue(null), set: jest.fn(), delete: jest.fn(), clear: jest.fn(), prune: jest.fn() };
  class MemCache { get = mc.get; set = mc.set; delete = mc.delete; clear = mc.clear; prune = mc.prune; }
  return { MemCache, adminStatsCache: mc, newsCache: mc, foodVisionCache: mc };
});

jest.mock('../utils/activityTracker', () => ({
  getActiveUsersCount: jest.fn().mockReturnValue(0),
  getActiveUserIds: jest.fn().mockReturnValue(new Set()),
  recordActivity: jest.fn(),
}));

jest.mock('../utils/subscriptionCheck', () => ({
  getSubStatus: jest.fn().mockResolvedValue({ plan: 'free', isActive: false }),
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

const PROGRAM_ID = 'cprog000000000000000001';

const sampleProgram = {
  id: PROGRAM_ID,
  userId: 'u-test',
  name: 'Силовая программа',
  description: null,
  type: 'strength',
  goal: 'STRENGTH',
  level: 'INTERMEDIATE',
  daysPerWeek: 3,
  durationWeeks: 8,
  isActive: true,
  createdBy: 'user',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  workouts: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
  // $transaction: delegate to callback for program create
  (prisma.$transaction as jest.Mock).mockImplementation((fn) =>
    typeof fn === 'function' ? fn(prisma) : Promise.resolve(fn)
  );
  (prisma.program.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  (prisma.program.create as jest.Mock).mockResolvedValue(sampleProgram);
  // Must re-mock after clearAllMocks (exercise.findMany used by /exercises endpoint)
  (prisma.exercise.findMany as jest.Mock).mockResolvedValue([]);
  // history endpoint uses both findMany AND count
  (prisma.workout.count as jest.Mock).mockResolvedValue(0);
});

// ─── GET /api/workouts/programs ────────────────────────────────────────────────

describe('GET /api/workouts/programs', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/workouts/programs');
    expect(res.status).toBe(401);
  });

  it('200 returns programs array', async () => {
    (prisma.program.findMany as jest.Mock).mockResolvedValueOnce([sampleProgram]);

    const res = await request(app)
      .get('/api/workouts/programs')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Силовая программа');
  });

  it('200 returns empty array when no programs', async () => {
    (prisma.program.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/workouts/programs')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('SECURITY: findMany filters by req.userId', async () => {
    (prisma.program.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/workouts/programs')
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const calls = (prisma.program.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.userId).toBe('u-test');
  });
});

// ─── POST /api/workouts/programs ───────────────────────────────────────────────

describe('POST /api/workouts/programs', () => {
  const validPayload = {
    name: 'Моя программа',
    type: 'strength',
    daysPerWeek: 4,
  };

  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/workouts/programs')
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  it('400 when name is empty', async () => {
    const res = await request(app)
      .post('/api/workouts/programs')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validPayload, name: '' });

    expect(res.status).toBe(400);
  });

  it('400 when daysPerWeek > 7', async () => {
    const res = await request(app)
      .post('/api/workouts/programs')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validPayload, daysPerWeek: 8 });

    expect(res.status).toBe(400);
  });

  it('201 creates program with userId from JWT', async () => {
    const res = await request(app)
      .post('/api/workouts/programs')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(PROGRAM_ID);
  });

  it('SECURITY: create uses req.userId as userId, not body-supplied userId', async () => {
    await request(app)
      .post('/api/workouts/programs')
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ ...validPayload, userId: 'u-victim' }); // must be ignored

    const createCalls = (prisma.program.create as jest.Mock).mock.calls;
    expect(createCalls.length).toBeGreaterThan(0);
    expect(createCalls[0][0].data.userId).toBe('u-test');
    expect(createCalls[0][0].data.userId).not.toBe('u-victim');
  });
});

// ─── DELETE /api/workouts/programs/:id ────────────────────────────────────────

describe('DELETE /api/workouts/programs/:id', () => {
  it('401 without token', async () => {
    const res = await request(app).delete(`/api/workouts/programs/${PROGRAM_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .delete('/api/workouts/programs/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when program not found or belongs to different user', async () => {
    (prisma.program.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .delete(`/api/workouts/programs/${PROGRAM_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('200 deletes program and returns success', async () => {
    (prisma.program.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete(`/api/workouts/programs/${PROGRAM_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('SECURITY: deleteMany includes userId filter — IDOR protection', async () => {
    (prisma.program.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    await request(app)
      .delete(`/api/workouts/programs/${PROGRAM_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const calls = (prisma.program.deleteMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.userId).toBe('u-test');
    expect(calls[0][0].where.id).toBe(PROGRAM_ID);
  });
});

// ─── PATCH /api/workouts/programs/:id ─────────────────────────────────────────

describe('PATCH /api/workouts/programs/:id', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .patch(`/api/workouts/programs/${PROGRAM_ID}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .patch('/api/workouts/programs/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Valid name' });
    expect(res.status).toBe(400);
  });

  it('404 when program belongs to different user (IDOR)', async () => {
    (prisma.program.findUnique as jest.Mock).mockResolvedValueOnce({
      userId: 'u-other-user', // not the token user
    });

    const res = await request(app)
      .patch(`/api/workouts/programs/${PROGRAM_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ name: 'Stolen name' });

    expect(res.status).toBe(404);
  });

  it('200 updates own program', async () => {
    (prisma.program.findUnique as jest.Mock).mockResolvedValueOnce({ userId: 'u-test' });
    (prisma.program.update as jest.Mock).mockResolvedValueOnce({
      ...sampleProgram,
      name: 'Renamed',
    });

    const res = await request(app)
      .patch(`/api/workouts/programs/${PROGRAM_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
  });
});

// ─── GET /api/workouts/history ─────────────────────────────────────────────────

describe('GET /api/workouts/history', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/workouts/history');
    expect(res.status).toBe(401);
  });

  it('200 returns workout history (paginated response)', async () => {
    const workoutHistory = [{
      id: 'cwrkt000000000000000001',
      userId: 'u-test',
      name: 'Тренировка 1',
      completedAt: new Date().toISOString(),
      exercises: [],
    }];
    (prisma.workout.findMany as jest.Mock).mockResolvedValueOnce(workoutHistory);
    (prisma.workout.count as jest.Mock).mockResolvedValueOnce(1);

    const res = await request(app)
      .get('/api/workouts/history')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('workouts');
    expect(res.body.workouts).toHaveLength(1);
  });

  it('SECURITY: findMany filters by req.userId', async () => {
    (prisma.workout.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.workout.count as jest.Mock).mockResolvedValueOnce(0);

    await request(app)
      .get('/api/workouts/history')
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const calls = (prisma.workout.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.userId).toBe('u-test');
  });
});

// ─── GET /api/workouts/exercises ──────────────────────────────────────────────

describe('GET /api/workouts/exercises', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/workouts/exercises');
    expect(res.status).toBe(401);
  });

  it('200 returns exercises list', async () => {
    const exercises = [
      { id: 'ex1', name: 'Жим лёжа', muscleGroup: 'chest', equipment: 'barbell' },
    ];
    (prisma.exercise.findMany as jest.Mock).mockResolvedValueOnce(exercises);

    const res = await request(app)
      .get('/api/workouts/exercises')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Жим лёжа');
  });
});
