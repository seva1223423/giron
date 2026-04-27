/**
 * Integration tests for server/src/routes/nutrition.ts
 *
 * Covers all 4 meal endpoints with auth gating, input validation,
 * ownership isolation, and total macro calculation.
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
      updateMany: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    meal: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    mealItem: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// Step 3: import after mocks
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

const baseUser = {
  id: 'u-test',
  isBanned: false,
  lockedUntil: null,
  role: 'USER',
};

const sampleItem = {
  name: 'Chicken Breast',
  calories: 165,
  protein: 31,
  fats: 3.6,
  carbs: 0,
  weightGrams: 100,
};

const sampleMeal = {
  id: 'cmeal000000000000000001',
  userId: 'u-test',
  type: 'lunch',
  date: '2026-04-20',
  totalCalories: 165,
  totalProtein: 31,
  totalFats: 3.6,
  totalCarbs: 0,
  photoUrl: null,
  createdAt: new Date().toISOString(),
  items: [{ id: 'citem000000000000000001', ...sampleItem }],
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
  // Routes touch user.update for the lastActiveAt retention bookkeeping
  // (RETENTION-01) — fire-and-forget, but the chained .catch() needs the
  // mock to return a thenable. Default to no-op success.
  (prisma.user.update as jest.Mock).mockResolvedValue(baseUser);
});

// ─── POST /api/nutrition/meals ────────────────────────────────────────────────

describe('POST /api/nutrition/meals', () => {
  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/nutrition/meals')
      .send({ type: 'lunch', items: [sampleItem] });
    expect(res.status).toBe(401);
  });

  it('400 when type is invalid', async () => {
    const res = await request(app)
      .post('/api/nutrition/meals')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ type: 'dessert', items: [sampleItem] }); // 'dessert' not in enum

    expect(res.status).toBe(400);
  });

  it('400 when items array is empty', async () => {
    const res = await request(app)
      .post('/api/nutrition/meals')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ type: 'breakfast', items: [] });

    expect(res.status).toBe(400);
  });

  it('400 when photoUrl is http (not https)', async () => {
    const res = await request(app)
      .post('/api/nutrition/meals')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ type: 'breakfast', items: [sampleItem], photoUrl: 'http://cdn.example.com/photo.jpg' });

    expect(res.status).toBe(400);
  });

  it('201 creates meal and returns it with correct totals', async () => {
    (prisma.meal.create as jest.Mock).mockResolvedValueOnce(sampleMeal);

    const res = await request(app)
      .post('/api/nutrition/meals')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ type: 'lunch', items: [sampleItem], date: '2026-04-20' });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('lunch');
    expect(res.body.totalCalories).toBe(165);
    expect(res.body.items).toHaveLength(1);
  });

  it('SECURITY: meal.create uses req.userId from JWT, not body-supplied userId', async () => {
    (prisma.meal.create as jest.Mock).mockResolvedValueOnce(sampleMeal);

    await request(app)
      .post('/api/nutrition/meals')
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      // Attacker supplies a victim userId — must be ignored
      .send({ type: 'lunch', items: [sampleItem], userId: 'u-victim-999' });

    const createCalls = (prisma.meal.create as jest.Mock).mock.calls;
    expect(createCalls.length).toBeGreaterThan(0);
    expect(createCalls[0][0].data.userId).toBe('u-test');
    expect(createCalls[0][0].data.userId).not.toBe('u-victim-999');
  });

  it('calculates macro totals server-side (ignores client totals)', async () => {
    // Two items: 100 cal + 200 cal = 300 cal total
    const twoItems = [
      { name: 'Rice', calories: 100, protein: 2, fats: 0, carbs: 22 },
      { name: 'Beef', calories: 200, protein: 20, fats: 10, carbs: 0 },
    ];
    const createdMeal = { ...sampleMeal, totalCalories: 300, totalProtein: 22, items: twoItems };
    (prisma.meal.create as jest.Mock).mockResolvedValueOnce(createdMeal);

    const res = await request(app)
      .post('/api/nutrition/meals')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ type: 'dinner', items: twoItems });

    expect(res.status).toBe(201);
    // Verify server-side calculation was invoked (totals are computed, not passed through)
    const createData = (prisma.meal.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.totalCalories).toBe(300);
    expect(createData.totalProtein).toBe(22);
  });
});

// ─── GET /api/nutrition/meals ─────────────────────────────────────────────────

describe('GET /api/nutrition/meals', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/nutrition/meals?date=2026-04-20');
    expect(res.status).toBe(401);
  });

  it('400 when date query param is missing', async () => {
    const res = await request(app)
      .get('/api/nutrition/meals')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('400 when date format is wrong', async () => {
    const res = await request(app)
      .get('/api/nutrition/meals?date=20-04-2026')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('200 returns meals for the requested date', async () => {
    (prisma.meal.findMany as jest.Mock).mockResolvedValueOnce([sampleMeal]);

    const res = await request(app)
      .get('/api/nutrition/meals?date=2026-04-20')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('cmeal000000000000000001');
  });

  it('SECURITY: findMany filters by req.userId — user only sees their own meals', async () => {
    (prisma.meal.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/nutrition/meals?date=2026-04-20')
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const findManyCalls = (prisma.meal.findMany as jest.Mock).mock.calls;
    expect(findManyCalls[0][0].where.userId).toBe('u-test');
  });

  it('200 returns empty array for date with no meals', async () => {
    (prisma.meal.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/nutrition/meals?date=2026-01-01')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── PATCH /api/nutrition/meals/:id ──────────────────────────────────────────

describe('PATCH /api/nutrition/meals/:id', () => {
  const MEAL_ID = 'cmeal000000000000000001';

  it('401 without token', async () => {
    const res = await request(app)
      .patch(`/api/nutrition/meals/${MEAL_ID}`)
      .send({ items: [sampleItem] });
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .patch('/api/nutrition/meals/not-a-cuid')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ items: [sampleItem] });
    expect(res.status).toBe(400);
  });

  it('404 when meal not found or belongs to another user', async () => {
    (prisma.meal.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch(`/api/nutrition/meals/${MEAL_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ items: [sampleItem] });

    expect(res.status).toBe(404);
  });

  it('200 updates meal items and recalculates totals', async () => {
    (prisma.meal.findFirst as jest.Mock).mockResolvedValueOnce(sampleMeal);
    const updatedMeal = { ...sampleMeal, totalCalories: 330, items: [sampleItem, sampleItem] };
    (prisma.$transaction as jest.Mock).mockResolvedValueOnce(updatedMeal);

    const res = await request(app)
      .patch(`/api/nutrition/meals/${MEAL_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ items: [sampleItem, sampleItem] });

    expect(res.status).toBe(200);
    expect(res.body.totalCalories).toBe(330);
  });

  it('SECURITY: ownership checked before update — findFirst includes userId filter', async () => {
    (prisma.meal.findFirst as jest.Mock).mockResolvedValueOnce(null); // simulating wrong user

    await request(app)
      .patch(`/api/nutrition/meals/${MEAL_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ items: [sampleItem] });

    const findFirstCalls = (prisma.meal.findFirst as jest.Mock).mock.calls;
    // findFirst must include userId: req.userId — not just id
    expect(findFirstCalls[0][0].where.userId).toBe('u-test');
    expect(findFirstCalls[0][0].where.id).toBe(MEAL_ID);
  });
});

// ─── DELETE /api/nutrition/meals/:id ─────────────────────────────────────────

describe('DELETE /api/nutrition/meals/:id', () => {
  const MEAL_ID = 'cmeal000000000000000001';

  it('401 without token', async () => {
    const res = await request(app).delete(`/api/nutrition/meals/${MEAL_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .delete('/api/nutrition/meals/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when meal not found or belongs to another user', async () => {
    (prisma.meal.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .delete(`/api/nutrition/meals/${MEAL_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('200 deletes meal and returns success', async () => {
    (prisma.meal.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete(`/api/nutrition/meals/${MEAL_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('SECURITY: deleteMany includes userId filter — no IDOR on delete', async () => {
    (prisma.meal.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    await request(app)
      .delete(`/api/nutrition/meals/${MEAL_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const deleteManyCalls = (prisma.meal.deleteMany as jest.Mock).mock.calls;
    expect(deleteManyCalls[0][0].where.userId).toBe('u-test');
    expect(deleteManyCalls[0][0].where.id).toBe(MEAL_ID);
  });
});
