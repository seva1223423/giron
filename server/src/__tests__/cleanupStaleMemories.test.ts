/**
 * Unit tests for cleanupStaleMemories (rounds 26 + 97 + 114).
 *
 * The cleanup runs probabilistically (5% of chat hits) so a bug here
 * accumulates for hours before manifesting in user-visible memory drift.
 * Pin the four phases:
 *   1. Delete confidence < 0.1 (very low signal)
 *   2. Clamp confidence > 1.0 to 1.0
 *   3. Round 97: TTL prune for soft (< 0.85) memories untouched 180+ days
 *   4. Top-100 cap: remove lowest-confidence/oldest beyond 100
 */

jest.mock('../db', () => ({
  prisma: {
    aIMemory: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { cleanupStaleMemories } from '../routes/ai';
import { prisma } from '../db';

const USER_ID = 'cleanup-test-user';

beforeEach(() => {
  jest.clearAllMocks();
  // Defaults: empty result, all updateMany ops succeed.
  (prisma.aIMemory.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.aIMemory.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  (prisma.aIMemory.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
});

describe('cleanupStaleMemories — phase 1: low-confidence delete', () => {
  test('deleteMany fires with confidence < 0.1 filter', async () => {
    await cleanupStaleMemories(USER_ID);
    const calls = (prisma.aIMemory.deleteMany as jest.Mock).mock.calls;
    const lowConfCall = calls.find(([args]) => args.where?.confidence?.lt === 0.1);
    expect(lowConfCall).toBeDefined();
    expect(lowConfCall![0].where.userId).toBe(USER_ID);
  });
});

describe('cleanupStaleMemories — phase 2: clamp confidence > 1.0', () => {
  test('updateMany fires with confidence > 1.0 filter', async () => {
    await cleanupStaleMemories(USER_ID);
    const calls = (prisma.aIMemory.updateMany as jest.Mock).mock.calls;
    const clampCall = calls.find(([args]) => args.where?.confidence?.gt === 1.0);
    expect(clampCall).toBeDefined();
    expect(clampCall![0].where.userId).toBe(USER_ID);
    expect(clampCall![0].data.confidence).toBe(1.0);
  });
});

describe('cleanupStaleMemories — phase 3: round 97 TTL prune', () => {
  test('deleteMany fires with confidence < 0.85 + updatedAt < 180 days ago', async () => {
    await cleanupStaleMemories(USER_ID);
    const calls = (prisma.aIMemory.deleteMany as jest.Mock).mock.calls;
    // Round 97 TTL clause: confidence lt 0.85 AND updatedAt lt cutoff.
    const ttlCall = calls.find(([args]) => {
      const w = args.where;
      return w?.confidence?.lt === 0.85 && w?.updatedAt?.lt instanceof Date;
    });
    expect(ttlCall).toBeDefined();
    expect(ttlCall![0].where.userId).toBe(USER_ID);
    // Cutoff is "now - 180 days" — must be in the past.
    const cutoff = ttlCall![0].where.updatedAt.lt;
    expect(cutoff.getTime()).toBeLessThan(Date.now());
    // Within a small window of 180 days.
    const days = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(179);
    expect(days).toBeLessThanOrEqual(181);
  });
});

describe('cleanupStaleMemories — phase 4: top-100 cap', () => {
  test('findMany scoped to user, ordered by confidence desc + updatedAt desc, skip 100', async () => {
    await cleanupStaleMemories(USER_ID);
    const calls = (prisma.aIMemory.findMany as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const [args] = calls[0];
    expect(args.where.userId).toBe(USER_ID);
    expect(args.skip).toBe(100);
    expect(args.orderBy).toEqual([
      { confidence: 'desc' },
      { updatedAt: 'desc' },
    ]);
  });

  test('when user has > 100 memories, deletes the excess', async () => {
    (prisma.aIMemory.findMany as jest.Mock).mockResolvedValue([
      { id: 'm-101' }, { id: 'm-102' }, { id: 'm-103' },
    ]);

    await cleanupStaleMemories(USER_ID);

    const deletes = (prisma.aIMemory.deleteMany as jest.Mock).mock.calls;
    const excessCall = deletes.find(([args]) => args.where?.id?.in);
    expect(excessCall).toBeDefined();
    expect(excessCall![0].where.id.in).toEqual(['m-101', 'm-102', 'm-103']);
  });

  test('when user has ≤ 100 memories, no excess delete fires', async () => {
    (prisma.aIMemory.findMany as jest.Mock).mockResolvedValue([]);

    await cleanupStaleMemories(USER_ID);

    const deletes = (prisma.aIMemory.deleteMany as jest.Mock).mock.calls;
    const excessCall = deletes.find(([args]) => args.where?.id?.in);
    expect(excessCall).toBeUndefined();
  });
});

describe('cleanupStaleMemories — error handling', () => {
  test('swallows DB errors silently (non-critical path)', async () => {
    (prisma.aIMemory.deleteMany as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    // Should NOT throw — wrapped in try/catch in the implementation.
    await expect(cleanupStaleMemories(USER_ID)).resolves.toBeUndefined();
  });

  test('findMany error swallowed', async () => {
    (prisma.aIMemory.findMany as jest.Mock).mockRejectedValueOnce(new Error('connection lost'));
    await expect(cleanupStaleMemories(USER_ID)).resolves.toBeUndefined();
  });
});

describe('cleanupStaleMemories — userId isolation', () => {
  test('every Prisma call scopes to the userId argument, never another userId', async () => {
    const TARGET = 'target-user-x';
    const VICTIM = 'victim-user-y';

    await cleanupStaleMemories(TARGET);

    const allCalls = [
      ...(prisma.aIMemory.deleteMany as jest.Mock).mock.calls,
      ...(prisma.aIMemory.updateMany as jest.Mock).mock.calls,
      ...(prisma.aIMemory.findMany as jest.Mock).mock.calls,
    ];

    for (const [args] of allCalls) {
      const w = JSON.stringify(args.where ?? {});
      expect(w).not.toContain(VICTIM);
      // If userId is in the filter, it must be TARGET.
      if (args.where?.userId) {
        expect(args.where.userId).toBe(TARGET);
      }
    }
  });
});
