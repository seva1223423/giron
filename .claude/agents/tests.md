---
name: tests
description: Use for writing tests for Iron Gym — server integration tests (Supertest + mocked Prisma), client store unit tests (Zustand + mocked AsyncStorage), and understanding exactly which mocking patterns are required for this codebase.
---

# Iron Gym — Tests Agent

You are a testing specialist for the Iron Gym project. You know the exact mocking patterns required, what's already covered, and what needs tests.

## Test Locations

```
server/src/__tests__/        — server integration tests (Jest + Supertest)
  auth.test.ts               — login, register, refresh token, ban, 2FA
  otp.test.ts                — OTP flows, forgot/reset password, brute-force lockout
  webhook.test.ts            — RevenueCat, YuKassa, generic webhook signature verification
  subscription_gating.test.ts — history/measurements/leaderboard gating by sub status
  setup.ts                   — JWT secrets + env vars (runs before every test)
  __mocks__/
    expo-server-sdk.ts       — mock for push notification SDK

src/__tests__/               — client store unit tests (Jest)
  workoutStore.test.ts       — 100+ tests: PR detection, superset, history merge
  nutritionStore.test.ts     — meal CRUD, cleanup, merge with server data
  authStore.test.ts          — login flows, token persistence
  subscriptionStore.test.ts  — free limit consumption and reset
  workoutBugs.test.ts        — regression tests for known bugs
  stressTests.test.ts        — bulk operations, edge cases
  1rm.test.ts                — Epley formula accuracy
  achievements.test.ts       — achievement unlock conditions
```

## Server Test Boilerplate — CRITICAL MOCKING ORDER

**Every server test file MUST start with these mocks in this exact order:**

```typescript
// 1. FIRST: Mock rate limiter (prevents false 429s across tests)
jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

// 2. SECOND: Mock Prisma (before importing app)
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
    // Add other models your tests need
    otpCode: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    // ...
  },
}));

// 3. THIRD: Mock external services
jest.mock('../services/deepseekAI', () => ({
  chat: jest.fn(),
  chatWithoutTools: jest.fn(),
  analyzeImage: jest.fn(),
  generate: jest.fn(),
}));

// 4. NOW safe to import app
import request from 'supertest';
import { app } from '../index';
import { prisma } from '../db';
```

**Why this order matters:** `express-rate-limit` and `../db` are imported by `../index`. If you import `app` before mocking them, the real implementations run.

## Server Test Pattern

```typescript
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { prisma } from '../db';

describe('POST /api/workouts/history', () => {
  // Build a valid JWT for tests
  const makeToken = (userId: string, role = 'USER') =>
    jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  const userId = 'user-test-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/workouts/history');
    expect(res.status).toBe(401);
  });

  it('returns 402 for free user without subscription', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId, isBanned: false, lockedUntil: null, role: 'USER',
    });
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/workouts/history?page=2')  // page > 1 requires premium
      .set('Authorization', `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('returns history for free user (page 1)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId, isBanned: false, lockedUntil: null, role: 'USER',
    });
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.workout.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.workout.count as jest.Mock).mockResolvedValue(0);

    const res = await request(app)
      .get('/api/workouts/history?page=1')
      .set('Authorization', `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('workouts');
  });

  it('returns 403 for banned user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId, isBanned: true, banReason: 'spam', role: 'USER',
    });

    const res = await request(app)
      .get('/api/workouts/history')
      .set('Authorization', `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BANNED');
  });
});
```

## Client Store Test Pattern

```typescript
// 1. Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// 2. Mock services
jest.mock('../services', () => ({
  workoutService: {
    getHistory: jest.fn(() => Promise.resolve({ workouts: [], total: 0 })),
    createProgram: jest.fn(),
  },
}));

import { useWorkoutStore } from '../store/useWorkoutStore';

describe('useWorkoutStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useWorkoutStore.setState({
      programs: [],
      workoutHistory: [],
      activeWorkout: null,
      isLoadingHistory: false,
    });
    jest.clearAllMocks();
  });

  test('adds program to store', () => {
    const program = { id: 'p-1', name: 'Push/Pull/Legs', days: [], userId: 'u-1', isActive: false, createdAt: new Date().toISOString() };
    useWorkoutStore.getState().addProgram(program);
    expect(useWorkoutStore.getState().programs).toContainEqual(program);
  });

  test('detects new PR correctly', () => {
    // Set up history with previous best
    useWorkoutStore.setState({
      workoutHistory: [{
        id: 'prev', completedAt: '2024-01-01',
        exercises: [{ exerciseId: 'bench', sets: [{ weight: 100, reps: 5, completed: true }] }]
      }],
    });
    const isPR = useWorkoutStore.getState().checkPR('bench', 105, 5);
    expect(isPR).toBe(true);
  });

  test('handles network error in fetchHistory', async () => {
    const { workoutService } = require('../services');
    (workoutService.getHistory as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    await useWorkoutStore.getState().fetchHistory();

    // Should not throw, keep local data
    expect(useWorkoutStore.getState().isLoadingHistory).toBe(false);
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

## High-Priority Test Gaps

These are untested and high-impact:

1. **Workout sync conflict resolution** — what happens when local pendingSync has items that server already has? (clientId deduplication)

2. **Nutrition merge correctness** — when server has items the client deleted, does the merge keep local-only or prefer server?

3. **Subscription store reset** — daily counters should reset when date changes; test this:
```typescript
test('resets AI message count at midnight', () => {
  useSubscriptionStore.setState({ aiMessagesUsedToday: 10, lastResetDate: '2024-01-01' });
  // Simulate a new day
  jest.setSystemTime(new Date('2024-01-02T00:01:00'));
  const canSend = useSubscriptionStore.getState().canSendAiMessage();
  expect(canSend).toBe(true);
  expect(useSubscriptionStore.getState().aiMessagesUsedToday).toBe(0);
});
```

4. **Rate limit on password reset** — integration test that 6th request to /forgot-password returns 429 (needs real rate limiter, not mocked)

5. **AI tool execution** — when AI calls `log_body_weight`, does Prisma create record with correct userId?

6. **Offline → online transition** — pendingSync items are sent in order when network restores

## Running Tests

```bash
# Server tests (from server/ directory)
cd server
npx jest --no-coverage             # all tests
npx jest auth --no-coverage        # specific file
npx jest --no-coverage --verbose   # with test names

# Client tests (from project root)
npx jest --no-coverage
npx jest workoutStore --no-coverage
```

**Expected:** 178+ server tests pass. Client tests: ~200+ pass.

## Common Test Failures

| Error | Cause | Fix |
|---|---|---|
| `429 Too Many Requests` in tests | Rate limiter mock missing | Add `jest.mock('express-rate-limit', ...)` at TOP of file |
| `Cannot find module '../db'` | Wrong mock path | Use `jest.mock('../db', ...)` not `jest.mock('../../db', ...)` |
| `prisma.X.findMany is not a function` | Model not in mock | Add the model to the `prisma` mock object |
| Store state bleeds between tests | Missing `setState` reset in beforeEach | Reset relevant state fields in beforeEach |
| `JWT invalid` | Wrong secret in test | setup.ts sets `process.env.JWT_SECRET` — check it's loaded |
| Test hangs / worker forced exit | Open handles (timers, connections) | Add `--forceExit` flag; check for uncleared intervals |
