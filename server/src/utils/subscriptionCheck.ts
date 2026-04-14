/**
 * Server-side subscription check utility.
 * Used to enforce paid-plan gates at the API layer, preventing paywall bypass
 * via direct API calls (the client-side gate alone is insufficient).
 */
import { prisma } from '../db';

export interface SubStatus {
  isPaid: boolean;
  plan: string;
}

/**
 * Returns whether the user has an active paid subscription (any plan except 'free').
 * Checks: status=active, plan!=free, and endDate not expired.
 */
export async function getSubStatus(userId: string): Promise<SubStatus> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true, endDate: true },
  });
  const isPaid =
    !!sub &&
    sub.status === 'active' &&
    sub.plan !== 'free' &&
    (!sub.endDate || sub.endDate >= new Date());
  return { isPaid, plan: sub?.plan ?? 'free' };
}
