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
server/src/__tests__/           — server integration tests (Jest + Supertest, 20 suites, 719 tests)
  cardio.test.ts                — GET/POST/DELETE cardio sessions; type enum validation, all Zod boundary conditions, IDOR isolation (22 tests)
  nutrition.test.ts             — POST/GET/PATCH/DELETE meals; macro calc, IDOR isolation, ownership checks (23 tests)
  trainer.test.ts               — GET/POST/DELETE/PATCH trainer clients+sessions; requireTrainerRole, sub access, IDOR isolation (37 tests)
  support.test.ts               — ticket CRUD, message posting, close, staff GET/all, PATCH /status, PATCH /assign; IDOR + role guards (35 tests)
  admin.test.ts                 — ADMIN auth gating, ban/unban, role change, unlock, GET /users, announcements CRUD; self-protect guards (47 tests)
  workout.test.ts               — programs CRUD, GET /history, GET /exercises, POST /start, POST /sync, POST /:id/complete, POST /:id/autosave, GET /leaderboard, routines CRUD; IDOR + userId isolation (56 tests)
  user.test.ts                  — GET/PATCH profile, PATCH nutrition-targets, POST weight, measurements, sleep, trusted-devices; req.userId isolation (37 tests)
  ai_security.test.ts           — AI tool userId isolation, daily quota gating, per-user rate limit (7 tests)
  auth.test.ts                  — login, register, refresh, forgot/reset-password, logout, check-email, check-phone, verify-email, resend-verification (45 tests)
  otp.test.ts                   — OTP flows, forgot/reset password, brute-force lockout
  webhook.test.ts               — RevenueCat, YuKassa, generic webhook signature verification
  subscription_gating.test.ts   — history/measurements/leaderboard gating by sub status
  routines.test.ts              — GET/POST/PATCH/DELETE routines, duplicate, history, routineId in sync
  bugs_regression.test.ts       — server-side regression tests for known bugs
  foodVision.test.ts            — food photo analysis endpoint, malformed JSON recovery
  leaderboard.test.ts           — top-100 est1RM leaderboard endpoint
  middleware.test.ts            — auth middleware: missing token, expired token, wrong issuer
  news.test.ts                  — RSS fetch, save/unsave, auto-categorization
  validation.test.ts            — Zod schema boundary tests: meal, weight, login (bcrypt DoS), registration (strong password), workout, program, routines, cardio, body measurements, sleep/bedtime, profile update, nutrition targets (155 tests)
  setup.ts                      — JWT secrets + env vars (runs before every test)
  __mocks__/
    expo-server-sdk.ts          — mock for push notification SDK

src/__tests__/                  — client tests (Jest, 71 suites, 1701 tests)

  — Store unit tests —
  workoutStore.test.ts          — 100+ tests: PR detection, superset, history merge
  workoutBugs.test.ts           — regression: clientId dedup, FIFO pending sync
  nutritionStore.test.ts        — meal CRUD, cleanup, merge with server data
  nutritionBugs.test.ts         — regression: no-duplicate on sync, offline-delete limitation
  authStore.test.ts             — login flows, token persistence
  subscriptionStore.test.ts     — free limit consumption and reset
  routinesStore.test.ts         — routine CRUD, startWorkoutFromRoutine, progressive overload
  cardioStore.test.ts           — addSession (server + offline fallback + 4xx rethrow), removeSession, getWeekSessions, sync (15 tests)
  cardioStoreBugs.test.ts       — regression: cardio store edge cases
  sleepStore.test.ts            — sleep entry CRUD and duration computation
  sleepStoreBugs.test.ts        — regression: sleep store
  settingsStore.test.ts         — rest timer, units, notification preferences
  themeStore.test.ts            — light/dark theme switching
  trainerStore.test.ts          — trainer-client CRUD with paywall gating
  measurementsStore.test.ts     — body measurements CRUD, server-* ID upgrade, sync merge, 404-safe delete (22 tests)
  supportStore.test.ts          — ticket fetch/create, message send, close, loading/error states (19 tests)
  onboardingTipsStore.test.ts   — markShown idempotency, hasShown, resetAll (8 tests)
  connectionStore.test.ts       — online/offline state transitions
  stressTests.test.ts           — bulk operations, large history, edge cases

  — Pure logic / utilities —
  1rm.test.ts                   — Epley/Brzycki/Lander/O'Conner formula accuracy
  achievements.test.ts          — achievement unlock conditions
  date.test.ts                  — computeStreak (13 tests incl. today-forgiving semantics), localDateStr, getPastDates
  dateTimezone.test.ts          — timezone-safe date formatting (UTC+3 edge cases)
  foodScanner.test.ts           — barcode scan, food analysis, scan count gating
  commaDecimal.test.ts          — Russian decimal input (comma → dot conversion)
  progressRing.test.ts          — ProgressRing SVG arc math
  gender.test.ts                — normalizeGender/isMale/isFemale: UPPERCASE server enum → lowercase, null/undefined (22 tests)
  macros.test.ts                — Mifflin-St Jeor BMR, TDEE, full macro pipeline, floor guards (24 tests)
  plates.test.ts                — calculatePlates greedy algorithm, PLATE_SIZES invariants (17 tests)
  homeDerivations.test.ts       — WeekPlanStrip + streak derivations from store state
  paywallLogic.test.ts          — PaywallModal prop contracts and subscription gate logic
  storageKeys.test.ts           — AsyncStorage key smoke: all stores use consistent key names

  — Direction A design layer —
  designComponents.test.ts      — formatDateMetaRu (all 7 weekdays/12 months), findLiveSet, rpeFillRatio, buildSetEyebrow (24 tests)
  designPalette.test.ts         — Premium Graphite + Gold token invariants; contrast ratios, hex validity
  designThemeParity.test.ts     — light/dark theme color parity: no undefined tokens, no cross-bleed
  designButtonContract.test.ts  — Button height/radius/padding/text contracts across all variants
  designMathInvariants.test.ts  — ProgressRing arc math, MacroBar ratios, ring clamp under Direction A tokens
  designSafeArea.test.ts        — safe-area/notch/keyboard insets on 19 real device profiles (19 tests)
  designAccessibility.test.ts   — a11y label contracts: all tappable elements have accessibilityLabel
  designAccessibilityScaling.test.ts — Dynamic Type / font scaling safety (contentSizeCategory)
  designRegression.test.ts      — regression guards for all Direction A fixes (ProgressRing, MacroBar, Streak, null guards)
  designEdgeCases.test.ts       — null/undefined/empty data guards in Hero, Ring, WeekPlan components
  designPerformance.test.ts     — performance budgets + memo-friendly shape contracts
  designComplianceAudit.test.ts — design token compliance: theme mapping, no hardcoded hex in components
  designQuotaReset.test.ts      — subscription quota reset at midnight / timezone edge cases
  designTimezoneEdges.test.ts   — date display correctness across UTC±N timezones
  designExtremeDevices.test.ts  — 19 real devices × 6 invariants (102 cases): foldables, iPad, tiny phones
  designFullAuditSummary.test.ts — design audit snapshot: summary of all Direction A invariants

  — Icon system —
  iconSet.test.ts               — all Icon names resolve to non-empty paths; no missing glyphs
  iconRender.test.tsx           — Icon renders without crash, size prop applied
  a11yLabels.test.ts            — accessibilityLabel coverage across Icon usage sites

  — Cross-device / safety —
  crossDevice.test.ts           — layout constants correct on 19 device profiles
  orientationSafety.test.ts     — portrait/landscape state invariants
  russianTextEdges.test.ts      — long Russian strings, Cyrillic edge cases in date/macro formatters
  componentStructuralSmoke.test.ts — component tree smoke: Button/Card/Input/Spinner render without crash
  scannerDesignFlow.test.ts     — FoodScanner 2×2 grid state machine + meal-type selector contracts
  designPlatformDivergence.test.ts — Platform.select() branch coverage, font family fallbacks, status bar height per OS (15 tests)
  designStorageRobustness.test.ts  — AsyncStorage getStorageUsage thresholds, corrupt/large payload tolerance, store key invariants (21 tests)
  designRapidInput.test.ts         — 1000-tap burst quota caps, clampProgress idempotency, parallel consume safety (14 tests)
  designQuotaReset.test.ts         — quota resets at midnight, timezone edge cases
  designTimezoneEdges.test.ts      — date display correctness across UTC offsets, DST transitions
  designUnicodeEdges.test.ts       — Cyrillic + CJK + emoji text in formatters, length invariants
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

**Expected baseline:** 719 server tests pass (20 suites), 1701 client tests pass (71 suites).

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

// Step 3 (admin/workout routes only): Mock MemCache + activityTracker
// MemCache is a class — must export the constructor or tests crash with "not a constructor"
jest.mock('../utils/memCache', () => {
  const mc = { get: jest.fn().mockReturnValue(null), set: jest.fn(), delete: jest.fn(), clear: jest.fn(), prune: jest.fn() };
  class MemCache { get = mc.get; set = mc.set; delete = mc.delete; clear = mc.clear; prune = mc.prune; }
  return { MemCache, adminStatsCache: mc, newsCache: mc, foodVisionCache: mc };
});
jest.mock('../utils/activityTracker', () => ({
  getActiveUsersCount: jest.fn().mockReturnValue(0),
  getActiveUserIds: jest.fn().mockReturnValue(new Set()),
  recordActivity: jest.fn(), // required — called by authenticate middleware
}));

// Step 4: Mock external AI services if testing AI routes
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

// Helper: build test JWT — MUST include issuer+audience (auth middleware verifies both)
const makeToken = (userId = 'u-test', role = 'USER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: 'irongym-api',
    audience: 'irongym-app',
  });
```

## Full Server Test Pattern — All 4 Cases Every Route

```typescript
describe('POST /api/workouts/history', () => {
  const userId = 'user-test-123';
  const makeToken = (id = userId, role = 'USER') =>
    jwt.sign({ userId: id, role }, process.env.JWT_SECRET!, {
      expiresIn: '1h',
      issuer: 'irongym-api',
      audience: 'irongym-app',
    });

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
  const makeToken = () => jwt.sign({ userId, role: 'USER' }, process.env.JWT_SECRET!, {
    expiresIn: '1h', issuer: 'irongym-api', audience: 'irongym-app',
  });

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
  const makeToken = () => jwt.sign({ userId, role: 'USER' }, process.env.JWT_SECRET!, {
    expiresIn: '1h', issuer: 'irongym-api', audience: 'irongym-app',
  });

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

~~1. **Workout sync deduplication**~~ — **DONE** in `workoutBugs.test.ts` (2 tests: clientId dedup + full overlap)

~~4. **Offline → online sync order**~~ — **DONE** in `workoutBugs.test.ts` (2 tests: FIFO order + partial failure queue drain)

2. **Nutrition merge conflict** — server has items the client deleted; merge should prefer local deletion:
   (currently documented as KNOWN LIMITATION in `nutritionBugs.test.ts` — needs offline delete queue to fix)
   ```typescript
   test('merge keeps local deletions over server data', async () => { ... });
   ```

~~3. **AI tool userId isolation**~~ — **DONE** in `ai_security.test.ts` (BUG-AI-001, 2 tests)

## Common Test Failures and Fixes

| Error | Cause | Fix |
|---|---|---|
| `429 Too Many Requests` | Rate limiter mock missing or in wrong position | Add `jest.mock('express-rate-limit', ...)` as **very first line** of file |
| `Cannot find module '../db'` | Wrong relative path | Use `'../db'` from `__tests__/` (one level up) |
| `prisma.X.findMany is not a function` | Model not in mock object | Add the model + methods to the `prisma` mock |
| `500` on paginated endpoint | `model.count` missing from mock | Paginated handlers call both `findMany` AND `count` — add `count: jest.fn()` to mock and re-mock in `beforeEach` after `clearAllMocks` |
| `MemCache is not a constructor` | memCache mock missing class export | Use the MemCache class mock pattern (Step 3 in boilerplate above) |
| Test passes alone but 500s in full suite | `clearAllMocks()` wipes `mockResolvedValue` set in mock factory | Re-mock persistent fallback values (e.g. `findMany`, `count`) in `beforeEach` after `clearAllMocks()` |
| State bleeds between tests | No `setState` reset in beforeEach | Reset all relevant store fields in `beforeEach` |
| `JWT invalid` | Secret not set, or missing issuer/audience | `setup.ts` sets `JWT_SECRET`. Also add `issuer: 'irongym-api', audience: 'irongym-app'` to `jwt.sign()` — middleware verifies both |
| Test hangs after pass | Open handles | Use `--forceExit`; look for uncleared `setInterval` |
| `analyzeImage is not a function` | deepseekAI not mocked | Add `jest.mock('../services/deepseekAI', ...)` before app import |
| `isValidId returns false` for `r-1` style IDs | CUID regex `/^c[a-z0-9]{20,30}$/` in workout.ts | Use CUID-format mock IDs, e.g. `croutine00000000000000001` |

## See Also (Cross-Agent Coordination)

- **New route needs tests** → `backend` agent implements the route; `tests` agent writes the test file. When spawning `tests` agent, provide: route path, HTTP method, Prisma models touched, expected status codes (200/201/400/401/404/402).
- **Failing test due to store shape change** → `frontend` agent changed a Zustand store shape without bumping `version` or updating `partialize`. Tests can simulate this by calling `setState` with old shape in `beforeEach`.
- **Coverage gaps** → `security` agent audits routes; `tests` agent writes the missing test cases. If `security` flags "no test for 403 on ownership check", spawn `tests` agent with that specific case.
- **Test count reference** — as of 2026-04-23: 719 server tests (20 suites), 1675 client tests (70 suites). Before adding a new test suite, confirm the file doesn't already exist in the relevant `__tests__/` directory.
