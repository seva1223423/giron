/**
 * Unit tests for saveMemories (round 115).
 *
 * saveMemories is the persistence half of the memory pipeline:
 *   memoryExtractor.extractMemories(message) → saveMemories(userId, list)
 *
 * Properties to pin:
 *   - userId comes from the function arg (server-sourced), never the
 *     memory entry payload.
 *   - Key + value are length-capped (100 / 500 chars) before upsert
 *     so a malicious extractor capture can't bloat the row.
 *   - Confidence increments by 0.05 on repeated mention (the upsert
 *     update path).
 *   - Source defaults to 'stated' (not auto-inferred without explicit
 *     opt-in via memory pattern).
 *   - DB errors are caught per-memory; one bad row doesn't fail the
 *     batch (Promise.all + try/catch around each upsert).
 */

jest.mock('../db', () => ({
  prisma: {
    aIMemory: {
      upsert: jest.fn().mockResolvedValue({}),
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

import { saveMemories } from '../routes/ai';
import { prisma } from '../db';

const USER_ID = 'save-test-user';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('saveMemories — happy path', () => {
  test('upserts each memory with userId from arg', async () => {
    await saveMemories(USER_ID, [
      { category: 'preference', key: 'training_location', value: 'дома', confidence: 0.8, source: 'stated' },
      { category: 'goal', key: 'target_weight_kg', value: '75', confidence: 0.9, source: 'stated' },
    ]);

    const calls = (prisma.aIMemory.upsert as jest.Mock).mock.calls;
    expect(calls.length).toBe(2);
    for (const [args] of calls) {
      expect(args.where.userId_key.userId).toBe(USER_ID);
      expect(args.create.userId).toBe(USER_ID);
    }
  });

  test('passes value through to upsert (no double-sanitization)', async () => {
    await saveMemories(USER_ID, [
      { category: 'preference', key: 'k', value: 'дома', confidence: 0.7, source: 'stated' },
    ]);
    const [args] = (prisma.aIMemory.upsert as jest.Mock).mock.calls[0];
    expect(args.create.value).toBe('дома');
  });

  test('passes source through to upsert', async () => {
    await saveMemories(USER_ID, [
      { category: 'preference', key: 'k', value: 'v', confidence: 0.7, source: 'stated' },
    ]);
    const [args] = (prisma.aIMemory.upsert as jest.Mock).mock.calls[0];
    expect(args.create.source).toBe('stated');
  });

  test('confidence increment on update is 0.05 (gradual learning)', async () => {
    await saveMemories(USER_ID, [
      { category: 'preference', key: 'k', value: 'v', confidence: 0.7, source: 'stated' },
    ]);
    const [args] = (prisma.aIMemory.upsert as jest.Mock).mock.calls[0];
    expect(args.update.confidence).toEqual({ increment: 0.05 });
  });
});

describe('saveMemories — length caps', () => {
  test('key longer than 100 chars is truncated', async () => {
    const longKey = 'k'.repeat(150);
    await saveMemories(USER_ID, [
      { category: 'preference', key: longKey, value: 'v', confidence: 0.7, source: 'stated' },
    ]);
    const [args] = (prisma.aIMemory.upsert as jest.Mock).mock.calls[0];
    expect(args.create.key.length).toBe(100);
    expect(args.where.userId_key.key.length).toBe(100);
  });

  test('value longer than 500 chars is truncated', async () => {
    const longValue = 'v'.repeat(800);
    await saveMemories(USER_ID, [
      { category: 'preference', key: 'k', value: longValue, confidence: 0.7, source: 'stated' },
    ]);
    const [args] = (prisma.aIMemory.upsert as jest.Mock).mock.calls[0];
    expect(args.create.value.length).toBe(500);
  });

  test('non-string key/value coerced to string before slicing', async () => {
    await saveMemories(USER_ID, [
      // @ts-expect-error — testing runtime safety with bad input
      { category: 'preference', key: 12345, value: { obj: true }, confidence: 0.7, source: 'stated' },
    ]);
    // The String() coercion + .slice means upsert gets *strings*, which
    // is what the Prisma column expects.
    const [args] = (prisma.aIMemory.upsert as jest.Mock).mock.calls[0];
    expect(typeof args.create.key).toBe('string');
    expect(typeof args.create.value).toBe('string');
  });
});

describe('saveMemories — error resilience', () => {
  test('one failing upsert does not break the others (Promise.all + try/catch)', async () => {
    (prisma.aIMemory.upsert as jest.Mock)
      .mockRejectedValueOnce(new Error('row 1 broken'))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await expect(saveMemories(USER_ID, [
      { category: 'preference', key: 'k1', value: 'v1', confidence: 0.7, source: 'stated' },
      { category: 'preference', key: 'k2', value: 'v2', confidence: 0.7, source: 'stated' },
      { category: 'preference', key: 'k3', value: 'v3', confidence: 0.7, source: 'stated' },
    ])).resolves.toBeUndefined();

    expect((prisma.aIMemory.upsert as jest.Mock).mock.calls.length).toBe(3);
  });

  test('empty memories list — no upsert calls, no error', async () => {
    await saveMemories(USER_ID, []);
    expect((prisma.aIMemory.upsert as jest.Mock).mock.calls.length).toBe(0);
  });
});

describe('saveMemories — userId isolation', () => {
  test('userId argument is the only userId in any upsert call', async () => {
    const TARGET = 'target-user';
    const VICTIM = 'victim-user';

    await saveMemories(TARGET, [
      { category: 'preference', key: 'k', value: VICTIM, confidence: 0.7, source: 'stated' },
    ]);

    const [args] = (prisma.aIMemory.upsert as jest.Mock).mock.calls[0];
    expect(args.where.userId_key.userId).toBe(TARGET);
    expect(args.create.userId).toBe(TARGET);
    // Even if VICTIM appears in the value, it should NOT be userId.
    expect(args.where.userId_key.userId).not.toBe(VICTIM);
  });
});
