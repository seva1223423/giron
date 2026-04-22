---
name: tests
description: Sub-agent for writing tests in Iron Gym. Spawn me to: write new server integration tests (Supertest + mocked Prisma), write client store unit tests (Zustand + mocked AsyncStorage), identify what's missing coverage, fix a failing test. I implement the tests, run them, verify green, and report back. Do NOT spawn me for implementing features — test-only work.
tools: Bash, Read, Edit, Write, Glob, Grep
---

You are a focused sub-agent helping the main Claude agent write and fix tests in Iron Gym. You do not communicate with the user — you write the tests, run them, and report back.

When done, always end your response with:
```
RESULT:
- Tests written: [file + test names added]
- Pass / Fail: [X passed, Y failed — paste any failures]
- Coverage areas: [what is now tested]
- Notes: [any gaps, skipped edge cases, or follow-up tests needed]
```

## Test Locations

```
server/src/__tests__/           — server integration tests (Jest + Supertest, 11 suites, 263 tests)
  auth.test.ts                  — login, register, refresh token, ban, 2FA
  otp.test.ts                   — OTP flows, forgot/reset password, brute-force lockout
  webhook.test.ts               — RevenueCat, YuKassa, generic webhook signature verification
  subscription_gating.test.ts   — history/measurements/leaderboard gating by sub status
  routines.test.ts              — GET/POST/PATCH/DELETE routines, duplicate, history, routineId in sync
  bugs_regression.test.ts       — server-side regression tests for known bugs
  foodVision.test.ts            — food photo analysis endpoint, malformed JSON recovery
  leaderboard.test.ts           — top-100 est1RM leaderboard endpoint
  middleware.test.ts            — auth middleware: missing token, expired token, wrong issuer
  news.test.ts                  — RSS fetch, save/unsave, auto-categorization
  validation.test.ts            — Zod validation edge cases across routes
  setup.ts                      — JWT secrets + env vars (runs before every test)
  __mocks__/
    expo-server-sdk.ts          — mock for push notification SDK

src/__tests__/                  — client store unit tests (Jest, 22 suites, 377 tests)
  workoutStore.test.ts          — 100+ tests: PR detection, superset, history merge
  workoutBugs.test.ts           — regression tests for known workout store bugs
  nutritionStore.test.ts        — meal CRUD, cleanup, merge with server data
  nutritionBugs.test.ts         — regression tests for known nutrition bugs
  authStore.test.ts             — login flows, token persistence
  subscriptionStore.test.ts     — free limit consumption and reset
  routinesStore.test.ts         — routine CRUD, startWorkoutFromRoutine, progressive overload
  cardioStoreBugs.test.ts       — regression tests for cardio store edge cases
  sleepStore.test.ts            — sleep entry CRUD and duration computation
  sleepStoreBugs.test.ts        — regression tests for sleep store
  settingsStore.test.ts         — rest timer, units, notification preferences
  themeStore.test.ts            — light/dark theme switching
  trainerStore.test.ts          — trainer-client CRUD with paywall gating
  connectionStore.test.ts       — online/offline state transitions
  stressTests.test.ts           — bulk operations, large history, edge cases
  1rm.test.ts                   — Epley/Brzycki/Lander/O'Conner formula accuracy
  achievements.test.ts          — achievement unlock conditions
  date.test.ts                  — computeStreak (13 tests incl. today-forgiving semantics), localDateStr, getPastDates
  dateTimezone.test.ts          — timezone-safe date formatting (UTC+3 edge cases)
  foodScanner.test.ts           — barcode scan, food analysis, scan count gating
  commaDecimal.test.ts          — Russian decimal input (comma → dot conversion)
  progressRing.test.ts          — ProgressRing SVG arc math
```

## Verification Commands

```bash
# Run all server tests
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server && npx jest --no-coverage --forceExit

# Run specific server test file
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server && npx jest auth --no-coverage --forceExit

# Run all client tests
cd C:/Users/sevka/Desktop/1223/work/iron-gym && npx jest --no-coverage --forceExit

# Run with verbose output (individual test names)
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server && npx jest --no-coverage --forceExit --verbose
```

**Expected baseline:** 263 server tests pass (11 suites), 377 client tests pass (22 suites).

## Server Test Boilerplate — CRITICAL MOCKING ORDER

**Every server test file MUST start with these mocks in this exact order. Wrong order = false 429s or unmocked DB calls.**

```typescript
// Step 1: Mock rate limiter FIRST — before any import
jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

// Step 2: Mock Prisma BEFORE importing app
jest.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    otpCode: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    passwordHistory: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    securityEvent: { create: jest.fn() },
    trustedDevice: { findUnique: jest.fn().mockResolvedValue(null) },
    // Add every model your test touches
  },
}));

// Step 3: Mock external AI services if testing AI routes
jest.mock('../services/deepseekAI', () => ({
  chat: jest.fn(),
  chatWithoutTools: jest.fn(),
  analyzeImage: jest.fn(),
}));

// Step 4: NOW safe to import app
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { prisma } from '../db';

// Helper: build test JWT
const makeToken = (userId = 'u-test', role = 'USER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: '1h' });
```

## Full Server Test Pattern — All 4 Cases Every Route

```typescript
describe('POST /api/workouts/history', () => {
  const userId = 'user-test-123';
  const makeToken = (id = userId, role = 'USER') =>
    jwt.sign({ userId: id, role }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  beforeEach(() => jest.clearAllMocks());

  // Case 1: Happy path
  it('200 returns workout history for premium user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId, isBanned: false, lockedUntil: null, role: 'USER',
    });
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      status: 'active', endDate: new Date(Date.now() + 86400000),
    });
    (prisma.workout.findMany as jest.Mock).mockResolvedValue([
      { id: 'w-1', name: 'Chest Day', completedAt: '2024-01-01', exercises: [] },
    ]);
    (prisma.workout.count as jest.Mock).mockResolvedValue(1);

    const res = await request(app)
      .get('/api/workouts/history?page=2')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.workouts).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  // Case 2: Auth missing
  it('401 without token', async () => {
    const res = await request(app).get('/api/workouts/history');
    expect(res.status).toBe(401);
  });

  // Case 3: Subscription gate (if premium route)
  it('402 for free user on page 2+', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId, isBanned: false, lockedUntil: null, role: 'USER',
    });
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/workouts/history?page=2')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  // Case 4: Banned user
  it('403 for banned user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId, isBanned: true, banReason: 'spam', role: 'USER',
    });

    const res = await request(app)
      .get('/api/workouts/history')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BANNED');
  });
});
```

## Subscription Gating Test Template

Use this to test any subscription-gated endpoint:

```typescript
describe('Subscription gating — GET /api/workouts/leaderboard', () => {
  const userId = 'u-free';
  const makeToken = () => jwt.sign({ userId, role: 'USER' }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId, isBanned: false, lockedUntil: null, role: 'USER',
    });
  });

  it('402 for free user', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).get('/api/workouts/leaderboard').set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(402);
  });

  it('402 for expired subscription', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      status: 'active', endDate: new Date(Date.now() - 1000), // expired
    });
    const res = await request(app).get('/api/workouts/leaderboard').set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(402);
  });

  it('200 for cancelled sub within endDate', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      status: 'cancelled', endDate: new Date(Date.now() + 86400000), // still valid
    });
    (prisma.workoutSet.findMany as jest.Mock).mockResolvedValue([]);
    const res = await request(app).get('/api/workouts/leaderboard').set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
  });
});
```

## AI Tool Execution Test Template

Tests that when AI calls a tool, the correct Prisma mutation happens:

```typescript
describe('AI tool execution', () => {
  const userId = 'u-ai-test';
  const makeToken = () => jwt.sign({ userId, role: 'USER' }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId, isBanned: false, lockedUntil: null, role: 'USER',
    });
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      status: 'active', endDate: new Date(Date.now() + 86400000),
    });
    (prisma.chatMessage.create as jest.Mock).mockResolvedValue({ id: 'msg-1' });
    (prisma.aIMemory.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.aIMemory.upsert as jest.Mock).mockResolvedValue({});
  });

  it('log_body_weight tool creates BodyWeight record for correct user', async () => {
    const { chat } = require('../services/deepseekAI');
    // Simulate AI responding with a tool call
    (chat as jest.Mock).mockResolvedValueOnce({
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call-1',
        type: 'function',
        function: { name: 'log_body_weight', arguments: JSON.stringify({ weightKg: 80 }) },
      }],
    }).mockResolvedValueOnce({
      role: 'assistant',
      content: 'Записал ваш вес: 80 кг',
      tool_calls: null,
    });

    (prisma.bodyWeight.upsert as jest.Mock).mockResolvedValue({ id: 'bw-1', weightKg: 80 });

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ message: 'Запиши мой вес 80 кг', history: [] });

    expect(res.status).toBe(200);
    // Verify the tool wrote to the correct userId, not req.body.userId
    expect(prisma.bodyWeight.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId }),
      })
    );
  });
});
```

## Client Store Test Pattern

```typescript
// Mock order: AsyncStorage first, then services
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../services', () => ({
  workoutService: {
    getHistory: jest.fn(() => Promise.resolve({ workouts: [], total: 0 })),
    createProgram: jest.fn(),
    deleteWorkout: jest.fn(),
  },
}));

import { useWorkoutStore } from '../store/useWorkoutStore';

describe('useWorkoutStore', () => {
  beforeEach(() => {
    // Always reset store state between tests — state bleeds otherwise
    useWorkoutStore.setState({
      programs: [],
      workoutHistory: [],
      activeWorkout: null,
      isLoadingHistory: false,
    });
    jest.clearAllMocks();
  });

  test('optimistic delete rolls back on server error', async () => {
    const program = { id: 'p-1', name: 'PPL', days: [], userId: 'u-1', isActive: false, createdAt: '' };
    useWorkoutStore.setState({ programs: [program] });

    const { workoutService } = require('../services');
    (workoutService.deleteProgram as jest.Mock).mockRejectedValueOnce(new Error('500'));

    await useWorkoutStore.getState().deleteProgram('p-1');

    // Should rollback to previous state after server error
    expect(useWorkoutStore.getState().programs).toHaveLength(1);
    expect(useWorkoutStore.getState().programs[0].id).toBe('p-1');
  });

  test('detects new PR correctly', () => {
    useWorkoutStore.setState({
      workoutHistory: [{
        id: 'prev', completedAt: '2024-01-01',
        exercises: [{ exerciseId: 'bench', sets: [{ weight: 100, reps: 5, completed: true }] }],
      }],
    });
    const isPR = useWorkoutStore.getState().checkPR('bench', 105, 5);
    expect(isPR).toBe(true);
  });

  test('does not detect PR if same weight', () => {
    useWorkoutStore.setState({
      workoutHistory: [{
        id: 'prev', completedAt: '2024-01-01',
        exercises: [{ exerciseId: 'bench', sets: [{ weight: 100, reps: 5, completed: true }] }],
      }],
    });
    const isPR = useWorkoutStore.getState().checkPR('bench', 100, 5);
    expect(isPR).toBe(false);
  });
});
```

## Subscription Store Midnight Reset Test

```typescript
describe('useSubscriptionStore', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      aiMessagesUsedToday: 0,
      foodScansUsedToday: 0,
      lastResetDate: new Date().toISOString().slice(0, 10),
    });
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test('resets AI message count when date changes', () => {
    useSubscriptionStore.setState({
      aiMessagesUsedToday: 10,
      lastResetDate: '2024-01-01',
    });
    jest.setSystemTime(new Date('2024-01-02T00:01:00'));

    const canSend = useSubscriptionStore.getState().canSendAiMessage();
    expect(canSend).toBe(true);
    expect(useSubscriptionStore.getState().aiMessagesUsedToday).toBe(0);
  });

  test('blocks free user after 10 AI messages same day', () => {
    useSubscriptionStore.setState({
      aiMessagesUsedToday: 10,
      lastResetDate: new Date().toISOString().slice(0, 10),
      subscription: null,
    });
    const canSend = useSubscriptionStore.getState().canSendAiMessage();
    expect(canSend).toBe(false);
  });
});
```

## What's Already Covered — Don't Re-test

**Server:**
- Auth: login, register, refresh, banned user, locked account, TOTP
- OTP: send, verify, cooldown, brute force, forgot/reset password
- Webhook: RevenueCat, YuKassa signatures, durationDays clamping, plan normalization
- Subscription gating: /workouts/history (page 2+), /user/measurements (5+), /workouts/leaderboard

**Client:**
- Workout store: PR detection (Epley), superset logic, warmup generation, merge with server data
- Nutrition store: meal CRUD, daily cleanup (90 days), merge strategy
- Auth store: token persistence, migration v0→v3
- Subscription store: daily limit consumption and reset
- Cardio store: offline fallback, merge strategy
- Sleep store: duration calculation
- Achievements: all 20 unlock conditions

## High-Priority Test Gaps — Write These Next

1. **Workout sync deduplication** — when `pendingSync` has `clientId` items the server already has:
   ```typescript
   test('does not duplicate workout if clientId already on server', async () => { ... });
   ```

2. **Nutrition merge conflict** — server has items the client deleted; merge should prefer local deletion:
   ```typescript
   test('merge keeps local deletions over server data', async () => { ... });
   ```

3. **AI tool userId isolation** — AI `log_body_weight` must write to `req.userId`, not any parsed value (test above)

4. **Offline → online sync order** — pendingSync items dispatched in insertion order:
   ```typescript
   test('flushes pending syncs in FIFO order', async () => { ... });
   ```

## Common Test Failures and Fixes

| Error | Cause | Fix |
|---|---|---|
| `429 Too Many Requests` | Rate limiter mock missing or in wrong position | Add `jest.mock('express-rate-limit', ...)` as **very first line** of file |
| `Cannot find module '../db'` | Wrong relative path | Use `'../db'` from `__tests__/` (one level up) |
| `prisma.X.findMany is not a function` | Model not in mock object | Add the model + methods to the `prisma` mock |
| State bleeds between tests | No `setState` reset in beforeEach | Reset all relevant store fields in `beforeEach` |
| `JWT invalid` | Secret not set | `setup.ts` sets `JWT_SECRET` — check it's imported |
| Test hangs after pass | Open handles | Use `--forceExit`; look for uncleared `setInterval` |
| `analyzeImage is not a function` | deepseekAI not mocked | Add `jest.mock('../services/deepseekAI', ...)` before app import |
| `isValidId returns false` for `r-1` style IDs | CUID regex `/^c[a-z0-9]{20,30}$/` in workout.ts | Use CUID-format mock IDs, e.g. `croutine00000000000000001` |

## See Also (Cross-Agent Coordination)

- **New route needs tests** → `backend` agent implements the route; `tests` agent writes the test file. When spawning `tests` agent, provide: route path, HTTP method, Prisma models touched, expected status codes (200/201/400/401/404/402).
- **Failing test due to store shape change** → `frontend` agent changed a Zustand store shape without bumping `version` or updating `partialize`. Tests can simulate this by calling `setState` with old shape in `beforeEach`.
- **Coverage gaps** → `security` agent audits routes; `tests` agent writes the missing test cases. If `security` flags "no test for 403 on ownership check", spawn `tests` agent with that specific case.
- **Test count reference** — as of 2026-04-22: 263 server tests (11 suites). Before adding a new test suite, confirm the file doesn't already exist in `server/src/__tests__/`.
