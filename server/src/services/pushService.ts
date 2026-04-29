import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const expo = new Expo();

/**
 * Send a push notification to all registered devices of a user.
 * Silently removes invalid tokens from the database.
 */
export async function sendPushToUser(
  userId: string,
  notification: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  try {
    const tokenRecords = await prisma.pushToken.findMany({
      where: { userId },
      select: { id: true, token: true },
      take: 20,
    });

    if (tokenRecords.length === 0) return;

    const messages: ExpoPushMessage[] = tokenRecords
      .filter((r) => Expo.isExpoPushToken(r.token))
      .map((r) => ({
        to: r.token,
        sound: 'default' as const,
        title: notification.title,
        body: notification.body,
        data: notification.data ?? {},
      }));

    if (messages.length === 0) return;

    const chunks = expo.chunkPushNotifications(messages);
    const invalidTokenIds: string[] = [];

    for (const chunk of chunks) {
      try {
        const receipts = await expo.sendPushNotificationsAsync(chunk);
        receipts.forEach((receipt, i) => {
          if (receipt.status === 'error') {
            const errCode = receipt.details?.error;
            if (errCode === 'DeviceNotRegistered') {
              const badToken = (chunk[i] as ExpoPushMessage | undefined)?.to as string;
              const record = tokenRecords.find((r) => r.token === badToken);
              if (record) invalidTokenIds.push(record.id);
            } else {
              // Surface non-DeviceNotRegistered errors so MessageTooBig
              // (over 4kb), MessageRateExceeded, InvalidCredentials, and
              // mismatched-sender failures aren't silently swallowed.
              // Tokens stay in the DB — these are transient/config issues,
              // not "device unregistered".
              const r = receipt as { message?: string };
              logger.warn(
                `[Push] Receipt error for user ${userId}: code=${errCode ?? 'unknown'} message=${r.message ?? '(none)'}`,
              );
            }
          }
        });
      } catch (e) {
        logger.warn('Push notification chunk failed:', e);
      }
    }

    // Clean up invalid tokens
    if (invalidTokenIds.length > 0) {
      await prisma.pushToken.deleteMany({ where: { id: { in: invalidTokenIds } } });
    }
  } catch (e) {
    logger.warn('sendPushToUser failed:', e);
  }
}
