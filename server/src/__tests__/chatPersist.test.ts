/**
 * Tests for ai/chatPersist.persistChatMessage.
 *
 * Verifies:
 *   1. Saves a row with role='assistant', userId, content, actions JSON
 *   2. Empty performedActions → actions is `undefined` (not [])
 *   3. Non-empty performedActions → JSON-cloned then persisted
 *   4. Awaits the create (returns after row is written)
 *   5. Schedules the retention prune with 90d window
 *   6. Prune errors don't propagate — the caller's promise resolves OK
 */

const mockCreate = jest.fn();
const mockDeleteMany = jest.fn();

jest.mock('../db', () => ({
  prisma: {
    chatMessage: {
      create: mockCreate,
      deleteMany: mockDeleteMany,
    },
  },
}));

import { persistChatMessage, _internal } from '../ai/chatPersist';

beforeEach(() => {
  mockCreate.mockReset();
  mockDeleteMany.mockReset();
  mockCreate.mockResolvedValue({});
  mockDeleteMany.mockResolvedValue({ count: 0 });
});

describe('persistChatMessage — create shape', () => {
  test('saves role=assistant + userId + content', async () => {
    await persistChatMessage({
      userId: 'u-1',
      aiContent: 'reply text',
      performedActions: [],
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0];
    expect(call.data.role).toBe('assistant');
    expect(call.data.userId).toBe('u-1');
    expect(call.data.content).toBe('reply text');
  });

  test('empty performedActions → actions field is undefined', async () => {
    await persistChatMessage({
      userId: 'u-1',
      aiContent: 'r',
      performedActions: [],
    });
    const call = mockCreate.mock.calls[0][0];
    expect(call.data.actions).toBeUndefined();
  });

  test('non-empty actions → JSON-cloned and serialised', async () => {
    const actions = [
      { type: 'log_meal', description: 'logged dinner', data: { id: 'm1' } },
      { type: 'create_workout', description: 'made chest day' },
    ];
    await persistChatMessage({
      userId: 'u-1',
      aiContent: 'done',
      performedActions: actions,
    });
    const call = mockCreate.mock.calls[0][0];
    // Should be a JSON-cloned copy, not the same reference (Prisma Json
    // serialisation does not mutate the input; the clone is defensive).
    expect(call.data.actions).toEqual(actions);
    expect(call.data.actions).not.toBe(actions);
  });
});

describe('persistChatMessage — awaits create + schedules prune', () => {
  test('does NOT await deleteMany — caller resolves before prune finishes', async () => {
    let pruneResolved = false;
    mockDeleteMany.mockReturnValueOnce(
      new Promise((resolve) => {
        setTimeout(() => {
          pruneResolved = true;
          resolve({ count: 0 });
        }, 100);
      }),
    );
    await persistChatMessage({
      userId: 'u-1',
      aiContent: 'r',
      performedActions: [],
    });
    // Caller has resolved; the prune is still in flight.
    expect(pruneResolved).toBe(false);
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
  });

  test('uses a 90-day cutoff for retention', async () => {
    const before = Date.now();
    await persistChatMessage({
      userId: 'u-1',
      aiContent: 'r',
      performedActions: [],
    });
    const after = Date.now();
    const call = mockDeleteMany.mock.calls[0][0];
    const cutoff = call.where.createdAt.lt as Date;
    expect(cutoff).toBeInstanceOf(Date);
    const expectedMin = before - _internal.NINETY_DAYS_MS;
    const expectedMax = after - _internal.NINETY_DAYS_MS + 50;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoff.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  test('prune errors are swallowed (caller still resolves cleanly)', async () => {
    mockDeleteMany.mockRejectedValueOnce(new Error('prune blew up'));
    await expect(
      persistChatMessage({
        userId: 'u-1',
        aiContent: 'r',
        performedActions: [],
      }),
    ).resolves.toBeUndefined();
  });

  test('NINETY_DAYS_MS constant is exactly 90 × 24 × 60 × 60 × 1000', () => {
    expect(_internal.NINETY_DAYS_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
