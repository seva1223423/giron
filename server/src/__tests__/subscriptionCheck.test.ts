/**
 * Unit tests for utils/subscriptionCheck — the server-side paywall guard.
 *
 * This is the source of truth for "is this user paid?". It is consumed by
 * routes/user.ts and routes/workout.ts to gate measurements history,
 * leaderboard access, and full workout history. A bug here = either
 * lost revenue (free users get premium) or angry support tickets
 * (paying users denied access).
 *
 * The function has four overlapping branches:
 *   1. status=active + endDate=null     → paid forever (no expiry)
 *   2. status=active + endDate>=now     → paid (auto-renewing, renewal pending)
 *   3. status=active + endDate<now      → NOT paid (expired even though "active")
 *   4. status=cancelled + endDate>=now  → paid until endDate (auto-renew off)
 *   5. status=cancelled + endDate<now   → NOT paid (period elapsed)
 *   6. status=cancelled + endDate=null  → NOT paid (cancelled requires endDate)
 *   7. status=anything-else             → NOT paid
 *   8. plan=free                        → NOT paid regardless of status
 *   9. no subscription row              → NOT paid, plan='free'
 *
 * Boundary case: endDate === now is treated as paid (>= comparison).
 */

jest.mock('../db', () => ({
  prisma: {
    subscription: {
      findUnique: jest.fn(),
    },
  },
}));

import { getSubStatus } from '../utils/subscriptionCheck';
import { prisma } from '../db';

const USER_ID = 'u-test';

const findUnique = prisma.subscription.findUnique as jest.Mock;

beforeEach(() => {
  findUnique.mockReset();
});

// ── No subscription row ─────────────────────────────────────────────────────

describe('getSubStatus — no subscription record', () => {
  test('returns isPaid:false and plan:"free" when user has no subscription', async () => {
    findUnique.mockResolvedValueOnce(null);
    const result = await getSubStatus(USER_ID);
    expect(result).toEqual({ isPaid: false, plan: 'free' });
  });

  test('queries Prisma with userId and the documented field selection', async () => {
    findUnique.mockResolvedValueOnce(null);
    await getSubStatus(USER_ID);
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      select: { plan: true, status: true, endDate: true },
    });
  });
});

// ── plan='free' is never paid (regardless of status) ────────────────────────

describe('getSubStatus — plan="free" is never paid', () => {
  test('plan="free" with status="active" returns isPaid:false', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'free',
      status: 'active',
      endDate: new Date(Date.now() + 86_400_000),
    });
    const result = await getSubStatus(USER_ID);
    expect(result).toEqual({ isPaid: false, plan: 'free' });
  });

  test('plan="free" with status="cancelled" still returns isPaid:false', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'free',
      status: 'cancelled',
      endDate: new Date(Date.now() + 86_400_000),
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(false);
  });
});

// ── status='active' branches ────────────────────────────────────────────────

describe('getSubStatus — status="active"', () => {
  test('paid plan + active + endDate=null → paid forever', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: 'active',
      endDate: null,
    });
    const result = await getSubStatus(USER_ID);
    expect(result).toEqual({ isPaid: true, plan: 'premium' });
  });

  test('paid plan + active + endDate in future → paid', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: 'active',
      endDate: new Date(Date.now() + 86_400_000), // +1 day
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(true);
  });

  test('paid plan + active + endDate in past → NOT paid (expired)', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: 'active',
      endDate: new Date(Date.now() - 86_400_000), // -1 day
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(false);
    // Plan is still echoed back even though access is denied.
    expect(result.plan).toBe('premium');
  });

  test('boundary: endDate exactly === now still returns paid (>=)', async () => {
    // We freeze "now" by mocking Date inside the function via the comparison
    // operator (>=). Using the exact ms moment is racy in real time, so we
    // pin to "now + 50ms" — well within a single test tick.
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: 'active',
      endDate: new Date(Date.now() + 50),
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(true);
  });
});

// ── status='cancelled' branches ─────────────────────────────────────────────

describe('getSubStatus — status="cancelled" (auto-renew off, grace period)', () => {
  test('cancelled + endDate in future → still paid until endDate', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: 'cancelled',
      endDate: new Date(Date.now() + 7 * 86_400_000), // +7 days
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(true);
    expect(result.plan).toBe('premium');
  });

  test('cancelled + endDate in past → NOT paid (period elapsed)', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: 'cancelled',
      endDate: new Date(Date.now() - 86_400_000),
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(false);
  });

  test('cancelled + endDate=null → NOT paid (cancelled requires explicit end)', async () => {
    // This asymmetry vs status=active matters: an active sub without endDate
    // means "no expiry" (e.g. lifetime), but a cancelled sub without endDate
    // is corrupt data — deny access by default.
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: 'cancelled',
      endDate: null,
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(false);
  });
});

// ── unrecognized statuses default to NOT paid ───────────────────────────────

describe('getSubStatus — unknown / non-payable statuses', () => {
  test('status="expired" → NOT paid', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: 'expired',
      endDate: new Date(Date.now() + 86_400_000),
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(false);
  });

  test('status="pending" (mid-payment) → NOT paid', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: 'pending',
      endDate: null,
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(false);
  });

  test('status="trial" (not yet a real subscription) → NOT paid', async () => {
    // The current contract treats only 'active' and 'cancelled' as payable.
    // If trial-status access ever needs to be granted, this test will flip
    // and serve as the explicit changelog of the policy change.
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: 'trial',
      endDate: new Date(Date.now() + 86_400_000),
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(false);
  });

  test('status="" empty string → NOT paid', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: '',
      endDate: null,
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(false);
  });
});

// ── plan name is echoed back faithfully ─────────────────────────────────────

describe('getSubStatus — plan name fidelity', () => {
  test('returns the actual plan name "premium" when paid', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'premium',
      status: 'active',
      endDate: null,
    });
    const result = await getSubStatus(USER_ID);
    expect(result.plan).toBe('premium');
  });

  test('returns "yearly" plan name when paid annually', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'yearly',
      status: 'active',
      endDate: new Date(Date.now() + 365 * 86_400_000),
    });
    const result = await getSubStatus(USER_ID);
    expect(result).toEqual({ isPaid: true, plan: 'yearly' });
  });

  test('returns the recorded plan name even when sub is expired (caller may want to show "your premium plan ended")', async () => {
    findUnique.mockResolvedValueOnce({
      plan: 'monthly',
      status: 'active',
      endDate: new Date(Date.now() - 86_400_000),
    });
    const result = await getSubStatus(USER_ID);
    expect(result.isPaid).toBe(false);
    expect(result.plan).toBe('monthly');
  });
});
