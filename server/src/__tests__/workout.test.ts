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
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    workout: {
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn(),
    },
    workoutSet: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    exercise: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    routine: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
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
import { getSubStatus } from '../utils/subscriptionCheck';

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
const WORKOUT_ID = 'cwkt000000000000000001';
const ROUTINE_ID = 'crtn000000000000000001';

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
  (prisma.workout.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.workout.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  (prisma.program.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.routine.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.routine.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
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

// ─── POST /api/workouts/start ─────────────────────────────────────────────────

describe('POST /api/workouts/start', () => {
  const validPayload = {
    name: 'Утренняя тренировка',
    exercises: [
      {
        exerciseId: 'ex-bench-press',
        restSeconds: 90,
        sets: [{ type: 'normal', reps: 8, weight: 80 }],
      },
    ],
  };

  it('401 without token', async () => {
    const res = await request(app).post('/api/workouts/start').send(validPayload);
    expect(res.status).toBe(401);
  });

  it('400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/workouts/start')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ exercises: validPayload.exercises });
    expect(res.status).toBe(400);
  });

  it('400 when exercises array is empty', async () => {
    const res = await request(app)
      .post('/api/workouts/start')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Test', exercises: [] });
    expect(res.status).toBe(400);
  });

  it('400 when exercise has no sets', async () => {
    const res = await request(app)
      .post('/api/workouts/start')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Test', exercises: [{ exerciseId: 'ex-1', sets: [] }] });
    expect(res.status).toBe(400);
  });

  it('201 creates workout with userId from JWT', async () => {
    const newWorkout = {
      id: 'cwkt00000000000000001',
      name: 'Утренняя тренировка',
      userId: 'u-test',
      startedAt: new Date().toISOString(),
      completedAt: null,
      exercises: [],
    };
    (prisma.workout.create as jest.Mock).mockResolvedValueOnce(newWorkout);

    const res = await request(app)
      .post('/api/workouts/start')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Утренняя тренировка');

    const createCalls = (prisma.workout.create as jest.Mock).mock.calls;
    expect(createCalls[0][0].data.userId).toBe('u-test');
  });

  it('400 when exerciseId does not exist in DB (P2003 FK violation)', async () => {
    const fkError = new Error('Foreign key constraint') as any;
    fkError.code = 'P2003';
    (prisma.workout.create as jest.Mock).mockRejectedValueOnce(fkError);

    const res = await request(app)
      .post('/api/workouts/start')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('упражнений');
  });
});

// ─── POST /api/workouts/sync ──────────────────────────────────────────────────

describe('POST /api/workouts/sync', () => {
  const validSync = {
    name: 'Готовая тренировка',
    completedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    durationMinutes: 60,
    totalVolume: 3000,
    exercises: [
      {
        exerciseId: 'ex-bench-press',
        sets: [{ type: 'normal', reps: 8, weight: 80, completed: true }],
      },
    ],
  };

  it('401 without token', async () => {
    const res = await request(app).post('/api/workouts/sync').send(validSync);
    expect(res.status).toBe(401);
  });

  it('400 when exercises array is empty', async () => {
    const res = await request(app)
      .post('/api/workouts/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validSync, exercises: [] });
    expect(res.status).toBe(400);
  });

  it('200 returns existing workout when same clientId is synced twice (idempotency)', async () => {
    const existingWorkout = { id: 'cwkt-existing', clientId: 'client-abc', userId: 'u-test', name: 'Already synced' };
    (prisma.workout.findFirst as jest.Mock).mockResolvedValueOnce(existingWorkout); // idempotency lookup

    const res = await request(app)
      .post('/api/workouts/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validSync, clientId: 'client-abc' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('cwkt-existing');
    // workout.create should NOT have been called — idempotent short-circuit
    expect(prisma.workout.create as jest.Mock).not.toHaveBeenCalled();
  });

  it('SECURITY: idempotency lookup scopes clientId by req.userId', async () => {
    (prisma.workout.findFirst as jest.Mock).mockResolvedValueOnce(null); // no existing
    const newWorkout = { id: 'cwkt-new', userId: 'u-test', name: 'New sync', exercises: [] };
    (prisma.workout.create as jest.Mock).mockResolvedValueOnce(newWorkout);
    (prisma.program.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await request(app)
      .post('/api/workouts/sync')
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ ...validSync, clientId: 'client-xyz' });

    const findFirstCalls = (prisma.workout.findFirst as jest.Mock).mock.calls;
    expect(findFirstCalls[0][0].where.userId).toBe('u-test');
    expect(findFirstCalls[0][0].where.clientId).toBe('client-xyz');
  });
});

// Workout with nested exercises shape — used by complete/autosave
const sampleWorkoutFull = {
  id: WORKOUT_ID,
  userId: 'u-test',
  name: 'Тренировка',
  startedAt: new Date(Date.now() - 3_600_000), // started 1h ago
  completedAt: null,
  exercises: [{ id: 'cwe0000000000000000001', sets: [{ id: 'cwset00000000000000001' }] }],
};

const sampleRoutine = {
  id: ROUTINE_ID,
  userId: 'u-test',
  name: 'Силовая рутина',
  description: null,
  exercises: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ─── POST /api/workouts/:id/complete ─────────────────────────────────────────

describe('POST /api/workouts/:id/complete', () => {
  it('401 without token', async () => {
    const res = await request(app).post(`/api/workouts/${WORKOUT_ID}/complete`).send({});
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/workouts/bad-id/complete')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('404 when workout belongs to different user (IDOR)', async () => {
    (prisma.workout.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleWorkoutFull,
      userId: 'u-other', // not the token user
    });

    const res = await request(app)
      .post(`/api/workouts/${WORKOUT_ID}/complete`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it('409 when workout already completed (atomic guard count=0)', async () => {
    (prisma.workout.findUnique as jest.Mock)
      .mockResolvedValueOnce(sampleWorkoutFull)    // ownership check
      .mockResolvedValueOnce(sampleWorkoutFull);   // refetch after tx
    (prisma.workout.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .post(`/api/workouts/${WORKOUT_ID}/complete`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('уже завершена');
  });

  it('200 completes workout — sets userId via JWT, returns updated workout', async () => {
    const completedWorkout = { ...sampleWorkoutFull, completedAt: new Date(), exercises: [] };
    (prisma.workout.findUnique as jest.Mock)
      .mockResolvedValueOnce(sampleWorkoutFull)  // ownership + validSetIds
      .mockResolvedValueOnce(sampleWorkoutFull)  // refetch after tx (totalVolume calc)
      .mockResolvedValueOnce(completedWorkout);  // final return
    (prisma.workout.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post(`/api/workouts/${WORKOUT_ID}/complete`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.completedAt).toBeDefined();

    // Atomic guard must scope to req.userId (IDOR protection)
    const updateManyCalls = (prisma.workout.updateMany as jest.Mock).mock.calls;
    expect(updateManyCalls[0][0].where.userId).toBe('u-test');
    expect(updateManyCalls[0][0].where.id).toBe(WORKOUT_ID);
    expect(updateManyCalls[0][0].where.completedAt).toBeNull();
  });
});

// ─── POST /api/workouts/:id/autosave ─────────────────────────────────────────

describe('POST /api/workouts/:id/autosave', () => {
  const validSets = [{ id: 'cwset00000000000000001', reps: 8, weight: 80, completed: true }];

  it('401 without token', async () => {
    const res = await request(app).post(`/api/workouts/${WORKOUT_ID}/autosave`).send({ sets: validSets });
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/workouts/bad-id/autosave')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ sets: validSets });
    expect(res.status).toBe(400);
  });

  it('404 when workout belongs to a different user (IDOR)', async () => {
    (prisma.workout.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleWorkoutFull,
      userId: 'u-other',
    });

    const res = await request(app)
      .post(`/api/workouts/${WORKOUT_ID}/autosave`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ sets: validSets });

    expect(res.status).toBe(404);
  });

  it('200 fire-and-forget — returns { success: true } even if no set IDs match', async () => {
    (prisma.workout.findUnique as jest.Mock).mockResolvedValueOnce(sampleWorkoutFull);

    const res = await request(app)
      .post(`/api/workouts/${WORKOUT_ID}/autosave`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ sets: [{ id: 'cwset00000000000000001', reps: 5, weight: 60 }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── GET /api/workouts/leaderboard ───────────────────────────────────────────

describe('GET /api/workouts/leaderboard', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/workouts/leaderboard');
    expect(res.status).toBe(401);
  });

  it('402 for free user (subscription required)', async () => {
    (getSubStatus as jest.Mock).mockResolvedValueOnce({ isPaid: false, plan: 'free', isActive: false });

    const res = await request(app)
      .get('/api/workouts/leaderboard')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('200 for paid user — calls $queryRaw and returns rows', async () => {
    (getSubStatus as jest.Mock).mockResolvedValueOnce({ isPaid: true, plan: 'premium', isActive: true });
    const leaderboardRows = [
      { exerciseName: 'Жим лёжа', userName: 'Иван', weightKg: 120, reps: 5, estimated1RM: 140, date: new Date().toISOString(), verified: true },
    ];
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce(leaderboardRows);

    const res = await request(app)
      .get('/api/workouts/leaderboard')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.leaderboard)).toBe(true);
    expect(res.body.leaderboard[0].exerciseName).toBe('Жим лёжа');
  });
});

// ─── GET /api/workouts/routines ───────────────────────────────────────────────

describe('GET /api/workouts/routines', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/workouts/routines');
    expect(res.status).toBe(401);
  });

  it('200 returns routines array for authenticated user', async () => {
    (prisma.routine.findMany as jest.Mock).mockResolvedValueOnce([sampleRoutine]);

    const res = await request(app)
      .get('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Силовая рутина');
  });

  it('SECURITY: findMany filters by req.userId', async () => {
    (prisma.routine.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const calls = (prisma.routine.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.userId).toBe('u-test');
  });
});

// ─── POST /api/workouts/routines ──────────────────────────────────────────────

describe('POST /api/workouts/routines', () => {
  const validRoutinePayload = {
    name: 'Рутина жим',
    exercises: [
      {
        exerciseId: 'ex-bench-press',
        order: 0,
        restSeconds: 90,
        sets: [{ setNumber: 1, type: 'normal', reps: 8, weight: 80 }],
      },
    ],
  };

  it('401 without token', async () => {
    const res = await request(app).post('/api/workouts/routines').send(validRoutinePayload);
    expect(res.status).toBe(401);
  });

  it('400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ exercises: validRoutinePayload.exercises });
    expect(res.status).toBe(400);
  });

  it('201 creates routine with userId from JWT', async () => {
    (prisma.routine.create as jest.Mock).mockResolvedValueOnce({ ...sampleRoutine, exercises: [] });

    const res = await request(app)
      .post('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validRoutinePayload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(ROUTINE_ID);

    const createCalls = (prisma.routine.create as jest.Mock).mock.calls;
    expect(createCalls[0][0].data.userId).toBe('u-test');
  });

  it('400 when exerciseId does not exist in DB (P2003 FK violation)', async () => {
    const fkError = new Error('Foreign key constraint') as any;
    fkError.code = 'P2003';
    (prisma.routine.create as jest.Mock).mockRejectedValueOnce(fkError);

    const res = await request(app)
      .post('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validRoutinePayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('упражнений');
  });
});

// ─── GET /api/workouts/routines/:id ──────────────────────────────────────────

describe('GET /api/workouts/routines/:id', () => {
  it('401 without token', async () => {
    const res = await request(app).get(`/api/workouts/routines/${ROUTINE_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .get('/api/workouts/routines/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when routine belongs to different user (IDOR)', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleRoutine,
      userId: 'u-other', // not the token user
    });

    const res = await request(app)
      .get(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    expect(res.status).toBe(404);
  });

  it('200 returns owned routine', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValueOnce(sampleRoutine);

    const res = await request(app)
      .get(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ROUTINE_ID);
    expect(res.body.name).toBe('Силовая рутина');
  });
});
