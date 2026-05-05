/**
 * Unit tests for services/pushService.sendPushToUser.
 *
 * Critical retention path: when this is broken, retention nudges and
 * trainer-invite alerts silently disappear. The two highest-value
 * branches to lock in:
 *   1. DeviceNotRegistered cleanup — invalid tokens MUST be removed from
 *      DB or every retention tick re-sends to dead devices.
 *   2. Non-DeviceNotRegistered errors — MUST surface via logger.warn so
 *      MessageTooBig / MessageRateExceeded / InvalidCredentials get
 *      caught in monitoring rather than silently swallowed.
 *
 * The whole function is wrapped in a try/catch, so we also verify it
 * doesn't throw on prisma failures (callers expect best-effort delivery).
 */

const sendPushNotificationsAsync = jest.fn();
const isExpoPushToken = jest.fn();

jest.mock('expo-server-sdk', () => {
  class Expo {
    static isExpoPushToken(token: string): boolean {
      return isExpoPushToken(token) as boolean;
    }
    chunkPushNotifications(messages: unknown[]): unknown[][] {
      return [messages];
    }
    async sendPushNotificationsAsync(messages: unknown[]): Promise<unknown[]> {
      return sendPushNotificationsAsync(messages) as Promise<unknown[]>;
    }
  }
  return { __esModule: true, default: Expo, ExpoPushMessage: {} };
});

jest.mock('../db', () => ({
  prisma: {
    pushToken: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { sendPushToUser } from '../services/pushService';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const findMany = prisma.pushToken.findMany as jest.Mock;
const deleteMany = prisma.pushToken.deleteMany as jest.Mock;

beforeEach(() => {
  findMany.mockReset();
  deleteMany.mockReset();
  sendPushNotificationsAsync.mockReset();
  isExpoPushToken.mockReset();
  isExpoPushToken.mockReturnValue(true); // valid by default
  (logger.info as jest.Mock).mockClear();
  (logger.warn as jest.Mock).mockClear();
  (logger.error as jest.Mock).mockClear();
});

const NOTIF = { title: 'Hi', body: 'Time to train', data: { foo: 'bar' } };

// ── No-token short-circuits ────────────────────────────────────────────────

describe('sendPushToUser — no tokens to send to', () => {
  test('user with zero tokens: no API call, no DB delete, no throw', async () => {
    findMany.mockResolvedValueOnce([]);

    await expect(sendPushToUser('u-1', NOTIF)).resolves.toBeUndefined();

    expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  test('user has tokens but ALL fail isExpoPushToken filter: no send, no delete', async () => {
    findMany.mockResolvedValueOnce([
      { id: 't-1', token: 'NotARealExpoToken' },
      { id: 't-2', token: 'AlsoBad' },
    ]);
    isExpoPushToken.mockReturnValue(false);

    await sendPushToUser('u-1', NOTIF);

    expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

// ── Successful send flow ───────────────────────────────────────────────────

describe('sendPushToUser — happy path', () => {
  test('builds ExpoPushMessage with title/body/data and sound:default', async () => {
    findMany.mockResolvedValueOnce([
      { id: 't-1', token: 'ExpoToken[abc]' },
    ]);
    sendPushNotificationsAsync.mockResolvedValueOnce([{ status: 'ok', id: 'r-1' }]);

    await sendPushToUser('u-1', NOTIF);

    expect(sendPushNotificationsAsync).toHaveBeenCalledTimes(1);
    const sent = sendPushNotificationsAsync.mock.calls[0][0] as Array<{
      to: string; sound: string; title: string; body: string; data: Record<string, unknown>;
    }>;
    expect(sent).toEqual([
      {
        to: 'ExpoToken[abc]',
        sound: 'default',
        title: 'Hi',
        body: 'Time to train',
        data: { foo: 'bar' },
      },
    ]);
  });

  test('defaults data to {} when caller does not pass it', async () => {
    findMany.mockResolvedValueOnce([{ id: 't-1', token: 'ExpoToken[a]' }]);
    sendPushNotificationsAsync.mockResolvedValueOnce([{ status: 'ok' }]);

    await sendPushToUser('u-1', { title: 'X', body: 'Y' });

    const sent = sendPushNotificationsAsync.mock.calls[0][0] as Array<{ data: unknown }>;
    expect(sent[0].data).toEqual({});
  });

  test('caps token query at 20 (anti-fanout guard)', async () => {
    findMany.mockResolvedValueOnce([]);
    await sendPushToUser('u-1', NOTIF);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u-1' },
        take: 20,
      }),
    );
  });
});

// ── DeviceNotRegistered cleanup ────────────────────────────────────────────

describe('sendPushToUser — invalid token cleanup', () => {
  test('DeviceNotRegistered receipt → token id queued for delete', async () => {
    findMany.mockResolvedValueOnce([
      { id: 't-good', token: 'ExpoToken[good]' },
      { id: 't-bad', token: 'ExpoToken[bad]' },
    ]);
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: 'ok', id: 'r-1' },
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    ]);
    deleteMany.mockResolvedValueOnce({ count: 1 });

    await sendPushToUser('u-1', NOTIF);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['t-bad'] } },
    });
  });

  test('multiple DeviceNotRegistered → all collected into ONE deleteMany', async () => {
    findMany.mockResolvedValueOnce([
      { id: 't-1', token: 'ExpoToken[1]' },
      { id: 't-2', token: 'ExpoToken[2]' },
      { id: 't-3', token: 'ExpoToken[3]' },
    ]);
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);
    deleteMany.mockResolvedValueOnce({ count: 2 });

    await sendPushToUser('u-1', NOTIF);

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['t-1', 't-3'] } },
    });
  });
});

// ── Non-DeviceNotRegistered error surfacing ────────────────────────────────

describe('sendPushToUser — non-DeviceNotRegistered errors are SURFACED via logger.warn', () => {
  test('MessageTooBig is logged with code + does NOT delete the token', async () => {
    findMany.mockResolvedValueOnce([{ id: 't-1', token: 'ExpoToken[a]' }]);
    sendPushNotificationsAsync.mockResolvedValueOnce([
      {
        status: 'error',
        message: 'message body too big',
        details: { error: 'MessageTooBig' },
      },
    ]);

    await sendPushToUser('u-1', NOTIF);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/\[Push\] Receipt error.*code=MessageTooBig.*message=message body too big/),
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  test('MessageRateExceeded is logged but token NOT deleted (transient)', async () => {
    findMany.mockResolvedValueOnce([{ id: 't-1', token: 'ExpoToken[a]' }]);
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
    ]);

    await sendPushToUser('u-1', NOTIF);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/code=MessageRateExceeded/),
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  test('error with NO details.error code logs as code=unknown', async () => {
    findMany.mockResolvedValueOnce([{ id: 't-1', token: 'ExpoToken[a]' }]);
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: 'error', message: 'mystery' /* no details */ },
    ]);

    await sendPushToUser('u-1', NOTIF);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/code=unknown.*message=mystery/),
    );
  });
});

// ── Resilience: outer + per-chunk failures ─────────────────────────────────

describe('sendPushToUser — never throws (best-effort delivery contract)', () => {
  test('chunk send rejects → caught + logged, function still resolves', async () => {
    findMany.mockResolvedValueOnce([{ id: 't-1', token: 'ExpoToken[a]' }]);
    sendPushNotificationsAsync.mockRejectedValueOnce(new Error('upstream 503'));

    await expect(sendPushToUser('u-1', NOTIF)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Push notification chunk failed:',
      expect.any(Error),
    );
  });

  test('prisma.findMany rejects → caught + logged, function still resolves', async () => {
    findMany.mockRejectedValueOnce(new Error('db connection lost'));

    await expect(sendPushToUser('u-1', NOTIF)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'sendPushToUser failed:',
      expect.any(Error),
    );
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
  });
});
