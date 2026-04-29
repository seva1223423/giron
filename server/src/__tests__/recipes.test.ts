/**
 * Integration tests for server/src/routes/recipes.ts
 *
 * Covers all 8 endpoints — auth gate, IDOR protection on USER recipes,
 * curated filter behavior, AI-generate JSON parse + validation, and the
 * recipe→meal "add to diary" projection.
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
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    recipe: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    meal: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../services/llm/router', () => ({
  chat: jest.fn(),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';
import { prisma } from '../db';
import { chat as llmChat } from '../services/llm/router';

const JWT_ISS = 'irongym-api';
const JWT_AUD = 'irongym-app';

const makeToken = (userId = 'u-test', role = 'USER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });

const baseUser = { id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' };

// CUID-like fixture id (must match CUID_RE: ^c[a-z0-9]{20,30}$)
const RECIPE_ID = 'cmrecipe000000000000001a';
const OTHER_USER_RECIPE_ID = 'cmrecipe000000000000002b';
const CURATED_ID = 'cmrecipecurated00000001a';

const sampleIngredient = {
  name: 'Куриная грудка',
  weightGrams: 200,
  calories: 220,
  protein: 41,
  fats: 5,
  carbs: 0,
};

const sampleRecipeBody = {
  name: 'Куриная грудка с овощами',
  descriptionRu: 'Простой обед на каждый день',
  prepTimeMin: 25,
  servings: 1,
  ingredients: [sampleIngredient],
  steps: ['Разогреть сковороду', 'Жарить грудку 7 минут с каждой стороны'],
  tags: ['lunch', 'high-protein'],
  allergens: [],
};

const sampleRecipeRow = {
  id: RECIPE_ID,
  source: 'USER',
  userId: 'u-test',
  ...sampleRecipeBody,
  totalCalories: 220,
  totalProtein: 41,
  totalFats: 5,
  totalCarbs: 0,
  imageUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const curatedRecipeRow = {
  ...sampleRecipeRow,
  id: CURATED_ID,
  source: 'CURATED',
  userId: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
});

// ─── Auth gate ────────────────────────────────────────────────────────────────

describe('auth gate', () => {
  it.each([
    ['GET', '/api/recipes/curated'],
    ['GET', '/api/recipes/mine'],
    ['GET', `/api/recipes/${RECIPE_ID}`],
    ['POST', '/api/recipes'],
    ['PATCH', `/api/recipes/${RECIPE_ID}`],
    ['DELETE', `/api/recipes/${RECIPE_ID}`],
    ['POST', '/api/recipes/ai-generate'],
    ['POST', `/api/recipes/${RECIPE_ID}/add-to-diary`],
  ])('%s %s without token → 401', async (method, path) => {
    const res = await (request(app) as any)[method.toLowerCase()](path);
    expect(res.status).toBe(401);
  });
});

// ─── GET /curated ─────────────────────────────────────────────────────────────

describe('GET /api/recipes/curated', () => {
  it('returns CURATED recipes only', async () => {
    (prisma.recipe.findMany as jest.Mock).mockResolvedValueOnce([curatedRecipeRow]);
    const res = await request(app)
      .get('/api/recipes/curated')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const calls = (prisma.recipe.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.source).toBe('CURATED');
  });

  it('filters by goal tag when provided', async () => {
    (prisma.recipe.findMany as jest.Mock).mockResolvedValueOnce([]);
    await request(app)
      .get('/api/recipes/curated?goal=weight-loss')
      .set('Authorization', `Bearer ${makeToken()}`);
    const where = (prisma.recipe.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.tags).toEqual({ has: 'weight-loss' });
  });

  it('excludes recipes containing forbidden allergens', async () => {
    (prisma.recipe.findMany as jest.Mock).mockResolvedValueOnce([]);
    await request(app)
      .get('/api/recipes/curated?allergen=lactose,gluten')
      .set('Authorization', `Bearer ${makeToken()}`);
    const where = (prisma.recipe.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.NOT).toEqual({ allergens: { hasSome: ['lactose', 'gluten'] } });
  });
});

// ─── GET /mine ────────────────────────────────────────────────────────────────

describe('GET /api/recipes/mine', () => {
  it('SECURITY: scopes to req.userId', async () => {
    (prisma.recipe.findMany as jest.Mock).mockResolvedValueOnce([sampleRecipeRow]);
    await request(app)
      .get('/api/recipes/mine')
      .set('Authorization', `Bearer ${makeToken('u-test')}`);
    const where = (prisma.recipe.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.userId).toBe('u-test');
    expect(where.source).toBe('USER');
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

describe('GET /api/recipes/:id', () => {
  it('returns CURATED recipe to any authed user', async () => {
    (prisma.recipe.findUnique as jest.Mock).mockResolvedValueOnce(curatedRecipeRow);
    const res = await request(app)
      .get(`/api/recipes/${CURATED_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('CURATED');
  });

  it('SECURITY: hides another user\'s USER recipe (404, not 403)', async () => {
    (prisma.recipe.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleRecipeRow,
      id: OTHER_USER_RECIPE_ID,
      userId: 'someone-else',
    });
    const res = await request(app)
      .get(`/api/recipes/${OTHER_USER_RECIPE_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);
    expect(res.status).toBe(404);
  });

  it('400 on malformed id', async () => {
    const res = await request(app)
      .get('/api/recipes/not-a-cuid')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });
});

// ─── POST / ───────────────────────────────────────────────────────────────────

describe('POST /api/recipes', () => {
  it('creates USER recipe and computes totals server-side', async () => {
    (prisma.recipe.create as jest.Mock).mockImplementationOnce(({ data }) => ({
      id: RECIPE_ID,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send(sampleRecipeBody);
    expect(res.status).toBe(201);
    expect(res.body.source).toBe('USER');
    expect(res.body.userId).toBe('u-test');
    expect(res.body.totalCalories).toBe(220);
    expect(res.body.totalProtein).toBe(41);
  });

  it('400 on missing required fields', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Foo' }); // missing ingredients/steps/prepTimeMin
    expect(res.status).toBe(400);
  });

  it('rejects out-of-range macros', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        ...sampleRecipeBody,
        ingredients: [{ ...sampleIngredient, calories: 999999 }],
      });
    expect(res.status).toBe(400);
  });
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

describe('PATCH /api/recipes/:id', () => {
  it('updates own recipe', async () => {
    (prisma.recipe.findUnique as jest.Mock).mockResolvedValueOnce(sampleRecipeRow);
    (prisma.recipe.update as jest.Mock).mockImplementationOnce(({ data }) => ({
      ...sampleRecipeRow,
      ...data,
    }));
    const res = await request(app)
      .patch(`/api/recipes/${RECIPE_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ ...sampleRecipeBody, name: 'Updated name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated name');
  });

  it('SECURITY: 403 on cross-user PATCH', async () => {
    (prisma.recipe.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleRecipeRow,
      userId: 'someone-else',
    });
    const res = await request(app)
      .patch(`/api/recipes/${RECIPE_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send(sampleRecipeBody);
    expect(res.status).toBe(403);
  });

  it('SECURITY: 403 on patching CURATED', async () => {
    (prisma.recipe.findUnique as jest.Mock).mockResolvedValueOnce(curatedRecipeRow);
    const res = await request(app)
      .patch(`/api/recipes/${CURATED_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(sampleRecipeBody);
    expect(res.status).toBe(403);
  });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

describe('DELETE /api/recipes/:id', () => {
  it('deletes own recipe', async () => {
    (prisma.recipe.findUnique as jest.Mock).mockResolvedValueOnce(sampleRecipeRow);
    (prisma.recipe.delete as jest.Mock).mockResolvedValueOnce(sampleRecipeRow);
    const res = await request(app)
      .delete(`/api/recipes/${RECIPE_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('SECURITY: 403 cross-user DELETE', async () => {
    (prisma.recipe.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleRecipeRow,
      userId: 'someone-else',
    });
    const res = await request(app)
      .delete(`/api/recipes/${RECIPE_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);
    expect(res.status).toBe(403);
  });
});

// ─── POST /ai-generate ────────────────────────────────────────────────────────

describe('POST /api/recipes/ai-generate', () => {
  it('parses LLM JSON and returns AI-source recipe', async () => {
    (llmChat as jest.Mock).mockResolvedValueOnce({
      content: JSON.stringify(sampleRecipeBody),
      toolCalls: [],
      hasToolCalls: false,
    });
    const res = await request(app)
      .post('/api/recipes/ai-generate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: 'Куриная грудка 400 ккал, без молочки, 30 мин' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('AI');
    expect(res.body.totalCalories).toBe(220);
    expect(res.body.name).toBe('Куриная грудка с овощами');
  });

  it('handles fenced markdown JSON blocks from LLM', async () => {
    (llmChat as jest.Mock).mockResolvedValueOnce({
      content: '```json\n' + JSON.stringify(sampleRecipeBody) + '\n```',
      toolCalls: [],
      hasToolCalls: false,
    });
    const res = await request(app)
      .post('/api/recipes/ai-generate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: 'foo' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('AI');
  });

  it('502 when LLM returns garbage', async () => {
    (llmChat as jest.Mock).mockResolvedValueOnce({
      content: 'unparseable text without any json',
      toolCalls: [],
      hasToolCalls: false,
    });
    const res = await request(app)
      .post('/api/recipes/ai-generate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: 'foo' });
    expect(res.status).toBe(502);
  });

  it('400 on too-short query', async () => {
    const res = await request(app)
      .post('/api/recipes/ai-generate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: 'a' });
    expect(res.status).toBe(400);
  });
});

// ─── POST /:id/add-to-diary ───────────────────────────────────────────────────

describe('POST /api/recipes/:id/add-to-diary', () => {
  it('creates a Meal with one MealItem per ingredient', async () => {
    (prisma.recipe.findUnique as jest.Mock).mockResolvedValueOnce(curatedRecipeRow);
    (prisma.meal.create as jest.Mock).mockImplementationOnce(({ data }) => ({
      id: 'cmeal0000000000000000001',
      ...data,
      items: data.items.create,
    }));

    const res = await request(app)
      .post(`/api/recipes/${CURATED_ID}/add-to-diary`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ date: '2026-04-29', mealType: 'lunch', servings: 1 });

    expect(res.status).toBe(201);
    const data = (prisma.meal.create as jest.Mock).mock.calls[0][0].data;
    expect(data.type).toBe('lunch');
    expect(data.date).toBe('2026-04-29');
    expect(data.totalCalories).toBe(220);
    expect(data.items.create).toHaveLength(1);
    expect(data.items.create[0].name).toBe('Куриная грудка');
  });

  it('scales macros when servings > recipe.servings', async () => {
    (prisma.recipe.findUnique as jest.Mock).mockResolvedValueOnce(curatedRecipeRow);
    (prisma.meal.create as jest.Mock).mockImplementationOnce(({ data }) => ({ id: 'm', ...data }));
    await request(app)
      .post(`/api/recipes/${CURATED_ID}/add-to-diary`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ date: '2026-04-29', mealType: 'lunch', servings: 2 });
    const data = (prisma.meal.create as jest.Mock).mock.calls[0][0].data;
    expect(data.totalCalories).toBe(440); // 220 * 2 servings, recipe.servings=1
  });

  it('400 on bad date format', async () => {
    const res = await request(app)
      .post(`/api/recipes/${CURATED_ID}/add-to-diary`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ date: '29-04-2026', mealType: 'lunch' });
    expect(res.status).toBe(400);
  });

  it('SECURITY: cannot add another user\'s USER recipe', async () => {
    (prisma.recipe.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleRecipeRow,
      userId: 'someone-else',
    });
    const res = await request(app)
      .post(`/api/recipes/${RECIPE_ID}/add-to-diary`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ date: '2026-04-29', mealType: 'lunch' });
    expect(res.status).toBe(404);
  });
});
