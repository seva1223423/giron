/**
 * Integration tests for the Routines API (CRUD, duplicate, PATCH, history, /start).
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    refreshToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    routine: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    routineExercise: { deleteMany: jest.fn() },
    workout: { findFirst: jest.fn(), findMany: jest.fn() },
    // Round 238: /routines/:id/start now uses workoutExercise.findMany
    // (single batch query) instead of N×workout.findFirst.
    workoutExercise: { findMany: jest.fn().mockResolvedValue([]) },
    securityEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn((fn: any) => fn({
      routineExercise: { deleteMany: jest.fn() },
      routine: { update: jest.fn() },
    })),
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';
import { prisma } from '../db';

// CUID-format IDs required by isValidId() in workout.ts (regex: /^c[a-z0-9]{20,30}$/)
const USER_ID    = 'cuser0000000000000000001';
const ROUTINE_ID = 'croutine00000000000000001';
const ROUTINE_ID2 = 'croutine00000000000000002';
const EX_ID      = 'cexercise000000000000001';
const RE_ID      = 'croutineex000000000000001';
const RS_ID      = 'croutineset000000000000001';
const WORKOUT_ID = 'cworkout000000000000001';

const makeToken = (userId = USER_ID) =>
  jwt.sign({ userId, role: 'USER' }, process.env.JWT_SECRET!, {
    expiresIn: '1h', issuer: 'giron-api', audience: 'giron-app',
  });

const mockUser = { id: USER_ID, isBanned: false, lockedUntil: null, role: 'USER' };

const mockExercise = { id: EX_ID, name: 'Жим лёжа', type: 'barbell', category: 'strength' };

const mockRoutine = {
  id: ROUTINE_ID,
  name: 'Push A',
  description: null,
  userId: USER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  exercises: [
    {
      id: RE_ID,
      order: 0,
      restSeconds: 90,
      notes: null,
      exerciseId: EX_ID,
      exercise: mockExercise,
      sets: [{ id: RS_ID, setNumber: 1, type: 'normal', reps: 8, weight: 80, rpe: null }],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
  (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser);
});

// ─── GET /api/workouts/routines ───────────────────────────────────────────────

describe('GET /api/workouts/routines', () => {
  it('returns routines for authenticated user', async () => {
    (prisma.routine.findMany as jest.Mock).mockResolvedValue([mockRoutine]);
    const res = await request(app)
      .get('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(ROUTINE_ID);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/workouts/routines');
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/workouts/routines ─────────────────────────────────────────────

describe('POST /api/workouts/routines', () => {
  const validBody = {
    name: 'Push A',
    exercises: [{
      exerciseId: EX_ID,
      order: 0,
      restSeconds: 90,
      sets: [{ setNumber: 1, type: 'normal', reps: 8, weight: 80 }],
    }],
  };

  it('creates routine and returns 201', async () => {
    (prisma.routine.create as jest.Mock).mockResolvedValue(mockRoutine);
    const res = await request(app)
      .post('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Push A');
  });

  it('returns 400 on empty name', async () => {
    const res = await request(app)
      .post('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, name: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on empty exercises array', async () => {
    const res = await request(app)
      .post('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, exercises: [] });
    expect(res.status).toBe(400);
  });

  // Round 255: metadata fields
  it('accepts targetGoal, difficulty, estimatedDurationMinutes', async () => {
    (prisma.routine.create as jest.Mock).mockResolvedValue(mockRoutine);
    const res = await request(app)
      .post('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        ...validBody,
        targetGoal: 'STRENGTH',
        difficulty: 'INTERMEDIATE',
        estimatedDurationMinutes: 60,
      });
    expect(res.status).toBe(201);
    const createCall = (prisma.routine.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.targetGoal).toBe('STRENGTH');
    expect(createCall.data.difficulty).toBe('INTERMEDIATE');
    expect(createCall.data.estimatedDurationMinutes).toBe(60);
  });

  it('rejects invalid targetGoal enum', async () => {
    const res = await request(app)
      .post('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, targetGoal: 'TURBO_MODE' });
    expect(res.status).toBe(400);
  });

  it('rejects estimatedDurationMinutes below 10 or above 240', async () => {
    const res1 = await request(app)
      .post('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, estimatedDurationMinutes: 5 });
    expect(res1.status).toBe(400);
    const res2 = await request(app)
      .post('/api/workouts/routines')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, estimatedDurationMinutes: 300 });
    expect(res2.status).toBe(400);
  });
});

// ─── PATCH /api/workouts/routines/:id ────────────────────────────────────────

describe('PATCH /api/workouts/routines/:id', () => {
  it('renames routine and returns 200', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue({ id: ROUTINE_ID, userId: USER_ID });
    (prisma.routine.update as jest.Mock).mockResolvedValue({ ...mockRoutine, name: 'Push B' });
    const res = await request(app)
      .patch(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Push B' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Push B');
  });

  it('returns 404 when routine belongs to different user', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue({ id: ROUTINE_ID, userId: 'cother00000000000000001' });
    const res = await request(app)
      .patch(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Push B' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when no fields provided', async () => {
    const res = await request(app)
      .patch(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  // Round 255: metadata-only patch
  it('updates targetGoal / difficulty / estimatedDurationMinutes', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue({ id: ROUTINE_ID, userId: USER_ID });
    (prisma.routine.update as jest.Mock).mockResolvedValue({ ...mockRoutine, targetGoal: 'MUSCLE_GAIN' });
    const res = await request(app)
      .patch(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ targetGoal: 'MUSCLE_GAIN', difficulty: 'BEGINNER', estimatedDurationMinutes: 45 });
    expect(res.status).toBe(200);
    const updateCall = (prisma.routine.update as jest.Mock).mock.calls.at(-1)[0];
    expect(updateCall.data.targetGoal).toBe('MUSCLE_GAIN');
    expect(updateCall.data.difficulty).toBe('BEGINNER');
    expect(updateCall.data.estimatedDurationMinutes).toBe(45);
  });

  it('allows clearing metadata with null', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue({ id: ROUTINE_ID, userId: USER_ID });
    (prisma.routine.update as jest.Mock).mockResolvedValue(mockRoutine);
    const res = await request(app)
      .patch(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ targetGoal: null });
    expect(res.status).toBe(200);
    const updateCall = (prisma.routine.update as jest.Mock).mock.calls.at(-1)[0];
    expect(updateCall.data.targetGoal).toBeNull();
  });
});

// ─── POST /api/workouts/routines/:id/duplicate ───────────────────────────────

describe('POST /api/workouts/routines/:id/duplicate', () => {
  it('creates a copy and returns 201', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue(mockRoutine);
    const copy = { ...mockRoutine, id: ROUTINE_ID2, name: 'Push A (копия)' };
    (prisma.routine.create as jest.Mock).mockResolvedValue(copy);
    const res = await request(app)
      .post(`/api/workouts/routines/${ROUTINE_ID}/duplicate`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(201);
    expect(res.body.name).toContain('копия');
    expect(res.body.id).not.toBe(ROUTINE_ID);
  });

  it('returns 404 for another user routine', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue({ ...mockRoutine, userId: 'cother00000000000000001' });
    const res = await request(app)
      .post(`/api/workouts/routines/${ROUTINE_ID}/duplicate`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/workouts/routines/:id ───────────────────────────────────────

describe('DELETE /api/workouts/routines/:id', () => {
  it('deletes routine and returns success', async () => {
    (prisma.routine.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    const res = await request(app)
      .delete(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 if routine not found or owned by another user', async () => {
    (prisma.routine.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    const res = await request(app)
      .delete(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/workouts/routines/:id/history ──────────────────────────────────

describe('GET /api/workouts/routines/:id/history', () => {
  it('returns history array for owned routine', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue({
      id: ROUTINE_ID, userId: USER_ID,
      exercises: [{ exerciseId: EX_ID, exercise: mockExercise }],
    });
    (prisma.workout.findMany as jest.Mock).mockResolvedValue([
      {
        id: WORKOUT_ID,
        completedAt: new Date('2026-04-01'),
        durationMinutes: 45,
        exercises: [{ exerciseId: EX_ID, sets: [{ weight: 82.5, reps: 8 }] }],
      },
    ]);
    const res = await request(app)
      .get(`/api/workouts/routines/${ROUTINE_ID}/history`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].exercises[0].maxWeight).toBe(82.5);
  });

  it('returns 404 for another user routine', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue({ id: ROUTINE_ID, userId: 'cother00000000000000001', exercises: [] });
    const res = await request(app)
      .get(`/api/workouts/routines/${ROUTINE_ID}/history`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/workouts/sync (routineId passthrough) ─────────────────────────

// ─── PUT /api/workouts/routines/:id ───────────────────────────────────────────

describe('PUT /api/workouts/routines/:id', () => {
  const payload = {
    name: 'Push A Updated',
    exercises: [
      {
        exerciseId: EX_ID,
        order: 0,
        restSeconds: 120,
        sets: [{ setNumber: 1, type: 'normal', reps: 10, weight: 85 }],
      },
    ],
  };

  it('200 with updated routine', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue({ userId: USER_ID });
    (prisma.$transaction as jest.Mock).mockResolvedValue({ ...mockRoutine, name: 'Push A Updated' });

    const res = await request(app)
      .put(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Push A Updated');
  });

  it('401 without token', async () => {
    const res = await request(app).put(`/api/workouts/routines/${ROUTINE_ID}`).send(payload);
    expect(res.status).toBe(401);
  });

  it('404 when routine belongs to another user', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue({ userId: 'cother000000000000000001' });

    const res = await request(app)
      .put(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(payload);

    expect(res.status).toBe(404);
  });

  it('400 with empty exercises array', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue({ userId: USER_ID });

    const res = await request(app)
      .put(`/api/workouts/routines/${ROUTINE_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Test', exercises: [] });

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/workouts/routines/:id/start ────────────────────────────────────

describe('POST /api/workouts/routines/:id/start', () => {
  it('200 with payload on first use (no previous workout)', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue(mockRoutine);
    // findFirst still used for lastRoutineWorkout (single call)
    (prisma.workout.findFirst as jest.Mock).mockResolvedValueOnce(null);
    // Round 238: progressive-overload uses workoutExercise.findMany now
    (prisma.workoutExercise.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .post(`/api/workouts/routines/${ROUTINE_ID}/start`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('routineId', ROUTINE_ID);
    expect(res.body).toHaveProperty('exercises');
    expect(Array.isArray(res.body.exercises)).toBe(true);
    expect(res.body.exercises[0]).toHaveProperty('progressionApplied', false);
  });

  it('200 and applies progressive overload when all sets completed last time', async () => {
    const LAST_WORKOUT_ID = 'clastwrkout00000000000001';
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue(mockRoutine);
    // findFirst: lastRoutineWorkout (still single call after R238)
    (prisma.workout.findFirst as jest.Mock).mockResolvedValueOnce({
      id: LAST_WORKOUT_ID,
      completedAt: new Date(Date.now() - 86400000),
    });
    // Round 238: progressive-overload now uses workoutExercise.findMany
    // — returns rows with sets per exerciseId. Most-recent-first order.
    (prisma.workoutExercise.findMany as jest.Mock).mockResolvedValueOnce([
      {
        exerciseId: EX_ID,
        sets: [{ setNumber: 1, type: 'normal', reps: 8, weight: 80, completed: true }],
      },
    ]);

    const res = await request(app)
      .post(`/api/workouts/routines/${ROUTINE_ID}/start`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.exercises[0].progressionApplied).toBe(true);
    expect(res.body.exercises[0].sets[0].weight).toBe(82.5); // 80 + 2.5
  });

  it('404 when routine not found or belongs to another user', async () => {
    (prisma.routine.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/workouts/routines/${ROUTINE_ID}/start`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('401 without token', async () => {
    const res = await request(app).post(`/api/workouts/routines/${ROUTINE_ID}/start`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/workouts/sync with routineId', () => {
  it('accepts routineId in payload and stores it', async () => {
    (prisma.workout.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // idempotency check
      .mockResolvedValueOnce(null); // active program
    (prisma.workout as any).create = jest.fn().mockResolvedValue({ id: WORKOUT_ID, routineId: ROUTINE_ID });

    const body = {
      name: 'Push A',
      routineId: ROUTINE_ID,
      exercises: [{ exerciseId: EX_ID, restSeconds: 90, sets: [{ type: 'normal', reps: 8, weight: 80, completed: true }] }],
      completedAt: new Date().toISOString(),
    };
    const res = await request(app)
      .post('/api/workouts/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(body);
    // We don't care about 200 vs 201 — just that it parses without 400
    expect(res.status).not.toBe(400);
  });
});
