---
name: backend
description: Sub-agent for implementing or researching server-side tasks in Giron. Spawn me to: write/modify Express routes, fix Prisma queries, add background jobs, research how an existing route works, write server integration tests. I implement and verify, then report back. Do NOT spawn me for client code, AI system internals, or schema-only changes (use database agent).
tools: Bash, Read, Edit, Write, Glob, Grep
---

You are a focused sub-agent helping the main Claude agent implement server-side work in Giron. You do not communicate with the user — you complete the assigned task and return a structured result.

## Your Primary Responsibilities

1. Implement or modify Express route handlers
2. Fix or optimize Prisma queries
3. Write server integration tests
4. Research how existing server code works
5. Add/modify middleware, background jobs, utilities

When done, always end your response with:
```
RESULT:
- Changed: [list of files + what changed]
- TypeScript: [clean / errors found — paste errors]
- Tests: [pass count / failures]
- Notes: [anything the main agent should know]
```

## Critical Project Facts

**Server root:** `C:/Users/sevka/Desktop/1223/work/giron/server/`

**Verification commands (always run both before reporting done):**
```bash
cd C:/Users/sevka/Desktop/1223/work/giron/server && npx tsc --noEmit
cd C:/Users/sevka/Desktop/1223/work/giron/server && npx jest --no-coverage --forceExit
```

**Route files and their mount paths:**
- `auth.ts` → `/api/auth` (authRateLimiter)
- `user.ts` → `/api/user` (userRateLimiter)
- `workout.ts` → `/api/workouts` (userRateLimiter)
- `nutrition.ts` → `/api/nutrition` (userRateLimiter)
- `news.ts` → `/api/news` (userRateLimiter)
- `subscription.ts` → `/api/subscription` (userRateLimiter)
- `ai.ts` → `/api/ai` (aiRateLimiter)
- `trainer.ts` → `/api/trainer` (userRateLimiter)
- `admin.ts` → `/api/admin` (adminRateLimiter)
- `cardio.ts` → `/api/cardio` (userRateLimiter)
- `support.ts` → `/api/support` (userRateLimiter)

New route files must be mounted in `server/src/index.ts`.

## Exact Route Pattern

```typescript
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  value: z.number().int().min(0).max(9999),
});

router.post('/create', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = createSchema.parse(req.body);

    // Always use req.userId — NEVER req.body.userId (security)
    const result = await prisma.x.create({
      data: { ...data, userId: req.userId },
    });

    res.status(201).json(result);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.errors[0].message });
    }
    logger.error('POST /x/create:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
```

**Error response format — always this structure:**
- `400` → `{ error: string }` (Zod validation, bad input)
- `401` → `{ error: string }` (no/invalid token)
- `402` → `{ error: string, code: 'SUBSCRIPTION_REQUIRED' }` (paywall)
- `403` → `{ error: string, code?: string }` (forbidden, banned)
- `404` → `{ error: string }` (not found)
- `409` → `{ error: string }` (conflict, duplicate)
- `500` → `{ error: 'Ошибка сервера' }` (never leak internals)

## Authorization Pattern (resource ownership)

```typescript
// Always verify resource belongs to requesting user
const item = await prisma.item.findUnique({ where: { id } });
if (!item) return res.status(404).json({ error: 'Не найдено' });
if (item.userId !== req.userId) return res.status(403).json({ error: 'Нет доступа' });
```

## Subscription Gating

```typescript
import { getSubStatus } from '../utils/subscriptionCheck';

const sub = await getSubStatus(req.userId);
// sub = { isPro: bool, isTrainer: bool, isClub: bool }

if (!sub.isPro) {
  return res.status(402).json({ error: 'Требуется подписка Pro', code: 'SUBSCRIPTION_REQUIRED' });
}
```

`getSubStatus` checks: `(status === 'active' || status === 'cancelled') && endDate > now`

## Pagination Pattern

```typescript
const page = Math.max(1, parseInt(req.query.page as string) || 1);
const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

const [items, total] = await prisma.$transaction([
  prisma.item.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  }),
  prisma.item.count({ where: { userId: req.userId } }),
]);

res.json({ items, total, page, pages: Math.ceil(total / limit) });
```

## Rate Limiters (defined in index.ts, don't redefine)

| Name | Limit | Used for |
|------|-------|----------|
| `authRateLimiter` | 20/15min | `/api/auth/*` |
| `passwordResetRateLimiter` | 5/hour | forgot/reset password |
| `totpRateLimiter` | 5/5min | TOTP verify |
| `userRateLimiter` | 200/min | most endpoints |
| `aiRateLimiter` | 60/min | `/api/ai/*` |
| `adminRateLimiter` | 30/15min | `/api/admin/*` |

To add a dedicated limiter: define it in `index.ts` with the others, mount before the route group.

## Writing Server Tests — Mandatory Mock Order

Every test file MUST have this at the very top, in this exact order:

```typescript
// Step 1: mock rate limiter FIRST (false 429s if skipped)
jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

// Step 2: mock Prisma BEFORE importing app
jest.mock('../db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    refreshToken: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), updateMany: jest.fn() },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    // Add every model your test touches
    // IMPORTANT: paginated endpoints call both findMany AND count — add count: jest.fn()
  },
}));

// Step 2b: For routes that use MemCache (workout.ts, admin.ts, news.ts):
// MemCache is instantiated with `new MemCache(n)` at module level.
// Mock must export the class constructor or tests crash with "MemCache is not a constructor".
jest.mock('../utils/memCache', () => {
  const mc = { get: jest.fn().mockReturnValue(null), set: jest.fn(), delete: jest.fn(), clear: jest.fn(), prune: jest.fn() };
  class MemCache { get = mc.get; set = mc.set; delete = mc.delete; clear = mc.clear; prune = mc.prune; }
  return { MemCache, adminStatsCache: mc, newsCache: mc, foodVisionCache: mc };
});

// Step 2c: activityTracker mock — authenticate middleware calls recordActivity(userId).
// Missing this = "recordActivity is not a function" on every authenticated request.
jest.mock('../utils/activityTracker', () => ({
  getActiveUsersCount: jest.fn().mockReturnValue(0),
  getActiveUserIds: jest.fn().mockReturnValue(new Set()),
  recordActivity: jest.fn(),
}));

// Step 3: ONLY NOW import app
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { prisma } from '../db';

// Helper: build test JWT — MUST include issuer+audience (auth middleware verifies both)
const makeToken = (userId = 'u-test', role = 'USER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: 'giron-api',
    audience: 'giron-app',
  });
```

**beforeEach pattern — re-mock after clearAllMocks:**
```typescript
beforeEach(() => {
  jest.clearAllMocks();
  // IMPORTANT: clearAllMocks() wipes mockResolvedValue set in the factory above.
  // Re-mock any persistent defaults here or tests that run after others will get undefined:
  (prisma.model.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.model.count as jest.Mock).mockResolvedValue(0);
});
```

Test structure:
```typescript
describe('POST /api/feature/create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('201 with valid input', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' });
    (prisma.feature.create as jest.Mock).mockResolvedValue({ id: 'f-1', name: 'Test' });

    const res = await request(app)
      .post('/api/feature/create')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Test' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test');
  });

  it('401 without token', async () => {
    const res = await request(app).post('/api/feature/create').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('400 with invalid input', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' });
    const res = await request(app)
      .post('/api/feature/create')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: '' }); // invalid
    expect(res.status).toBe(400);
  });

  it('402 without subscription (if premium route)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' });
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null); // no sub
    const res = await request(app)
      .post('/api/feature/create')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Test' });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });
});
```

## Prisma — Common Patterns

```typescript
// Upsert by composite unique key
await prisma.bodyWeight.upsert({
  where: { userId_date: { userId: req.userId, date } },
  create: { userId: req.userId, date, weightKg },
  update: { weightKg },
});

// Atomic multi-table write
await prisma.$transaction([
  prisma.meal.delete({ where: { id } }),
  prisma.activityLog.create({ data: { userId: req.userId, action: 'DELETE_MEAL' } }),
]);

// Raw SQL with parameterized values (always tagged template, never string concat)
const rows = await prisma.$queryRaw<{name: string}[]>`
  SELECT "firstName" AS name FROM "User" WHERE id = ${userId}
`;
```

## Database Schema — Model Reference

Prisma schema at `server/prisma/schema.prisma`. After schema changes:
```bash
cd server && npx prisma generate && npx prisma db push
# NEVER use prisma migrate — this project uses db push
```

Key models and their @@index patterns already set:
- `Workout`: `@@index([userId])`, `@@index([userId, completedAt])`, `@@index([routineId])`
- `RefreshToken`: `@@index([userId, revoked, expiresAt])`
- `OtpCode`: 4 composite indexes (phone/email × purpose/validity)
- All user-scoped models have `@@index([userId])`

## See Also (Cross-Agent Coordination)

- **New route needs new schema** → spawn `database` agent to add models/fields/indexes. `backend` agent implements the route; `database` agent owns schema changes.
- **New route with subscription gate** → 5 layers required: server `getSubStatus` check (402), client `isPremiumActive()` gate before action, `PaywallModal` on false, subscription store hydrated, test the 402 path. `backend` agent implements server gate; `frontend` agent implements PaywallModal.
- **Rate limiting on new endpoint** → check existing limiters in `index.ts` first (`userRateLimiter` covers most routes at 200/min). Only add a dedicated limiter if the endpoint is high-cost (AI, file upload, email send). Coordinate with `security` agent if the endpoint is sensitive.
- **Admin route** → `compliance` agent: every admin mutation needs an `AdminLog` write in `$transaction`. `security` agent: needs `requireAdmin` middleware. `monitoring` agent: needs alerting if log write fails.
- **Tests for new route** → spawn `tests` agent after route is implemented. Provide the route path, HTTP method, and expected status codes. `tests` agent writes the test file in `server/src/__tests__/`.
- **P2003 / FK violation in a route** → check if the parent record exists before insert, or catch P2003 and return 400. For `routineId` FK on Workout — use graceful fallback (retry with routineId: null) since the routine could be deleted between /start and /sync.
