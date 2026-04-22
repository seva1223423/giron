---
description: Scaffold a server integration test file in Iron Gym. Argument: "routeFile" — e.g. "nutrition" or "cardio". Reads the route file, infers which Prisma models are touched, writes a complete test file with all required mocks in the correct order, runs it, and verifies green.
---

You are scaffolding a server integration test file for Iron Gym. Argument: **$ARGUMENTS**

The route file is `server/src/routes/$ARGUMENTS.ts`. The test file will be `server/src/__tests__/$ARGUMENTS.test.ts`.

## Step 1 — Check if Test Already Exists

```bash
ls C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/__tests__/$ARGUMENTS.test.ts 2>/dev/null && echo "EXISTS" || echo "NOT_FOUND"
```

If EXISTS — read it, find what's missing, and fill gaps rather than overwriting.

## Step 2 — Audit the Route File

```bash
wc -l C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/$ARGUMENTS.ts
grep -n "router\.\(get\|post\|put\|patch\|delete\)" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/$ARGUMENTS.ts | head -40
```

Extract:
- All endpoints (method + path)
- All Prisma models accessed (`prisma.xxx.findMany`, etc.)
- Whether the route uses `authenticate` middleware (most do)
- Whether any endpoint has subscription gating (`getSubStatus`)
- Whether the route uses `MemCache` (leaderboardCache, exercisesCache, etc.)
- Whether the route uses `activityTracker`
- The mount path (check `server/src/index.ts` for `app.use('/api/...', ..., router)`)

```bash
grep -n "$ARGUMENTS\|routeFile" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/index.ts | head -10
```

```bash
grep -n "prisma\." C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/$ARGUMENTS.ts | grep -oP "prisma\.\w+" | sort -u
```

## Step 3 — Write the Test File

**MANDATORY MOCK ORDER — wrong order causes false 429s or unmocked DB calls:**

```typescript
/**
 * Server integration tests for $ARGUMENTS routes.
 * [Brief description of what this route handles]
 */

// Step 1: Rate limiter FIRST — before any import, or all requests get false 429
jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

// Step 2: Prisma mock BEFORE importing app
// Include EVERY model the route touches — missing one = runtime TypeError
jest.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn().mockResolvedValue(null), // authenticate reads this
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null), // getSubStatus reads this
    },
    // Add every model the route touches:
    <model>: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),        // REQUIRED for paginated endpoints
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

// Step 3 (only for routes using MemCache): mock the cache module
// MemCache is instantiated as a CLASS at module level — must export constructor
jest.mock('../utils/memCache', () => {
  const mc = {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    prune: jest.fn(),
  };
  class MemCache {
    get = mc.get; set = mc.set; delete = mc.delete; clear = mc.clear; prune = mc.prune;
  }
  return { MemCache, adminStatsCache: mc, newsCache: mc, foodVisionCache: mc };
});

// Step 4: activityTracker mock — authenticate middleware calls recordActivity()
// Missing this mock = "recordActivity is not a function" on every authenticated route
jest.mock('../utils/activityTracker', () => ({
  getActiveUsersCount: jest.fn().mockReturnValue(0),
  getActiveUserIds: jest.fn().mockReturnValue(new Set()),
  recordActivity: jest.fn(),
}));

// Step 5: Only now import app + test dependencies
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { prisma } from '../db';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeToken = (userId = 'u-test', role = 'USER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: '1h' });

// Standard authenticated user mock (re-use across describe blocks)
const mockAuthUser = (userId = 'u-test') => {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({
    id: userId,
    isBanned: false,
    lockedUntil: null,
    role: 'USER',
  });
};

// Standard active subscription mock
const mockActiveSub = () => {
  (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
    status: 'active',
    endDate: new Date(Date.now() + 86_400_000),
  });
};

// ─── GET /<resource> ──────────────────────────────────────────────────────────

describe('GET /api/$ARGUMENTS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-mock after clearAllMocks (it wipes factory mockResolvedValue defaults)
    (prisma.<model>.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.<model>.count as jest.Mock).mockResolvedValue(0);
  });

  it('200 returns items for authenticated user', async () => {
    mockAuthUser();
    (prisma.<model>.findMany as jest.Mock).mockResolvedValue([
      { id: 'item-1', userId: 'u-test', /* other fields */ },
    ]);

    const res = await request(app)
      .get('/api/$ARGUMENTS')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/$ARGUMENTS');
    expect(res.status).toBe(401);
  });

  // Add 403 (banned user) test if route uses authenticate
  it('403 for banned user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u-test', isBanned: true, banReason: 'spam', role: 'USER',
    });

    const res = await request(app)
      .get('/api/$ARGUMENTS')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(403);
  });

  // Add 402 test if route has subscription gating
  it('402 for free user on premium endpoint', async () => {
    mockAuthUser();
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/$ARGUMENTS/premium-endpoint')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });
});

// ─── POST /<resource> ─────────────────────────────────────────────────────────

describe('POST /api/$ARGUMENTS', () => {
  const validPayload = {
    // Fill with valid fields per the Zod schema
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.<model>.create as jest.Mock).mockResolvedValue({ id: 'item-new', ...validPayload, userId: 'u-test' });
  });

  it('201 creates item with valid payload', async () => {
    mockAuthUser();

    const res = await request(app)
      .post('/api/$ARGUMENTS')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it('400 with missing required field', async () => {
    mockAuthUser();

    const res = await request(app)
      .post('/api/$ARGUMENTS')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({}); // empty body — fails Zod

    expect(res.status).toBe(400);
  });

  it('401 without token', async () => {
    const res = await request(app).post('/api/$ARGUMENTS').send(validPayload);
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /<resource>/:id ───────────────────────────────────────────────────

describe('DELETE /api/$ARGUMENTS/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Owner mock: item belongs to 'u-test'
    (prisma.<model>.findUnique as jest.Mock).mockResolvedValue({
      id: 'item-1', userId: 'u-test',
    });
    (prisma.<model>.delete as jest.Mock).mockResolvedValue({});
  });

  it('200 deletes owned item', async () => {
    mockAuthUser();

    const res = await request(app)
      .delete('/api/$ARGUMENTS/item-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
  });

  it('403 cannot delete another user\'s item (IDOR protection)', async () => {
    // Item belongs to different user
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u-attacker', isBanned: false, lockedUntil: null, role: 'USER',
    });
    (prisma.<model>.findUnique as jest.Mock).mockResolvedValue({
      id: 'item-1', userId: 'u-victim', // different from attacker
    });

    const res = await request(app)
      .delete('/api/$ARGUMENTS/item-1')
      .set('Authorization', `Bearer ${makeToken('u-attacker')}`);

    expect(res.status).toBe(403);
  });

  it('404 for non-existent item', async () => {
    mockAuthUser();
    (prisma.<model>.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/$ARGUMENTS/nonexistent')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('401 without token', async () => {
    const res = await request(app).delete('/api/$ARGUMENTS/item-1');
    expect(res.status).toBe(401);
  });
});
```

Replace `<model>` with the actual Prisma model name(s) the route uses.

## Step 4 — Run the Tests

```bash
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server && npx jest $ARGUMENTS --no-coverage --forceExit 2>&1
```

All tests must pass before reporting done. Common failures and fixes:

| Error | Cause | Fix |
|---|---|---|
| `429` on all routes | Rate limiter mock missing or not FIRST | Move `jest.mock('express-rate-limit', ...)` to line 1 |
| `500` on route | Prisma model missing from mock | Add model + methods to the `prisma` mock object |
| `500` on paginated route | `model.count` missing | Add `count: jest.fn()` and re-mock in `beforeEach` |
| `recordActivity is not a function` | activityTracker not mocked | Add `jest.mock('../utils/activityTracker', ...)` |
| `MemCache is not a constructor` | memCache mock exports object, not class | Use the class pattern in Step 3 above |
| Test passes alone but fails in suite | `clearAllMocks()` wiped factory mocks | Re-mock `findMany`, `count`, etc. in `beforeEach` |

## Step 5 — Update Baseline

After all tests pass, update counts in CLAUDE.md and `.claude/agents/tests.md`:
- Increment server suite count (was 19, now 20)
- Increment server test count (was 410, add new count)
- Add file entry to the `server/src/__tests__/` list in `tests.md`

## Step 6 — Report

```
ROUTE TEST CREATED:
- File: server/src/__tests__/$ARGUMENTS.test.ts
- Tests: X across Y describe blocks
- Endpoints covered: [list method + path]
- IDOR tests: [yes/no — which routes]
- Subscription gate tests: [yes/no — which routes]
- Baseline: [new server suite count] suites, [new test count] tests
- Test output: X passed, 0 failed
```
