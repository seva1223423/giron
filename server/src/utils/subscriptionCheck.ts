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
 * Checks: status=active OR cancelled (cancelled = auto-renewal off, access until endDate),
 * plan!=free, and endDate not expired.
 *
 * NOTE: 'cancelled' grants access until endDate — consistent with the /subscription/cancel
 * endpoint which returns isPremium:true and "доступ сохранится до окончания оплаченного периода".
 */
/** The shape every caller has already fetched — no extra query needed. */
export interface SubLike {
  plan: string;
  status: string;
  endDate?: Date | null;
}

/**
 * The single definition of "this subscription grants paid access".
 *
 * It was written out by hand in four more places inside ai.ts, and the copies
 * had drifted apart in two ways that both mattered:
 *
 *   - Three said `plan !== 'free'`, one listed `['pro','trainer','club']`.
 *     The schema documents a `lifetime` plan and retentionService already
 *     treats it as paid, so whoever added it would have found voice input
 *     telling their best-paying customer to buy Pro.
 *
 *   - All four granted access to a `cancelled` subscription with no endDate.
 *     Admin can grant `active` without one (endDate is optional in the PATCH,
 *     and the admin screen does not send it); cancelling that leaves
 *     `cancelled` + null, which the inline rule read as "no expiry" — free
 *     access forever.
 *
 * Cancelled means auto-renewal is off and access runs to the paid-through
 * date. Without such a date there is nothing to run to, so it grants nothing.
 */
export function isPaidSubscription(sub: SubLike | null | undefined, now = new Date()): boolean {
  if (!sub || sub.plan === 'free') return false;
  // Active (auto-renewing): no endDate means no expiry; with one, it must not have elapsed.
  if (sub.status === 'active') return !sub.endDate || sub.endDate >= now;
  // Cancelled: access only until the explicit paid-through date.
  if (sub.status === 'cancelled') return !!sub.endDate && sub.endDate >= now;
  return false;
}

export async function getSubStatus(userId: string): Promise<SubStatus> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true, endDate: true },
  });
  return { isPaid: isPaidSubscription(sub), plan: sub?.plan ?? 'free' };
}
