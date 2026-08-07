/**
 * "Does this subscription grant paid access" must have exactly one answer.
 *
 * The rule was written out by hand in four places inside ai.ts alongside the
 * canonical helper in utils/subscriptionCheck.ts, and the copies had drifted
 * apart in two ways:
 *
 *   Three said `plan !== 'free'`; the fourth listed ['pro','trainer','club'].
 *   The schema documents a `lifetime` plan and retentionService already counts
 *   it as paid, so whoever introduced one would have found voice input telling
 *   their best-paying customer to go buy Pro.
 *
 *   All four granted access to a cancelled subscription with no endDate.
 *   Admin can create that state — endDate is optional in the PATCH and the
 *   admin screen does not send it — and cancelling it leaves `cancelled` plus
 *   null, which the inline rule read as "never expires".
 *
 * Neither could fire today: no route issues `lifetime`, and the subscription
 * table is empty. They were traps for the next person, which is exactly when a
 * paywall bug is cheapest to remove.
 */

import { isPaidSubscription } from '../utils/subscriptionCheck';

const NOW = new Date('2026-08-07T12:00:00Z');
const past = new Date('2026-08-01T12:00:00Z');
const future = new Date('2026-09-01T12:00:00Z');

describe('isPaidSubscription', () => {
  test('no subscription is not paid', () => {
    expect(isPaidSubscription(null, NOW)).toBe(false);
    expect(isPaidSubscription(undefined, NOW)).toBe(false);
  });

  test('the free plan is never paid, whatever its status', () => {
    for (const status of ['active', 'cancelled', 'expired']) {
      expect(isPaidSubscription({ plan: 'free', status, endDate: future }, NOW)).toBe(false);
    }
  });

  test('an active plan with a future end date is paid', () => {
    expect(isPaidSubscription({ plan: 'pro', status: 'active', endDate: future }, NOW)).toBe(true);
  });

  test('an active plan with no end date is paid — it auto-renews', () => {
    expect(isPaidSubscription({ plan: 'pro', status: 'active', endDate: null }, NOW)).toBe(true);
  });

  test('an active plan whose end date has passed is not paid', () => {
    expect(isPaidSubscription({ plan: 'pro', status: 'active', endDate: past }, NOW)).toBe(false);
  });

  test('a cancelled plan runs to its paid-through date', () => {
    expect(isPaidSubscription({ plan: 'pro', status: 'cancelled', endDate: future }, NOW)).toBe(true);
    expect(isPaidSubscription({ plan: 'pro', status: 'cancelled', endDate: past }, NOW)).toBe(false);
  });

  test('a cancelled plan with NO end date grants nothing', () => {
    // The bug the inline copies carried: cancelled + null read as "no expiry",
    // so cancelling an admin-granted subscription bought free access forever.
    expect(isPaidSubscription({ plan: 'pro', status: 'cancelled', endDate: null }, NOW)).toBe(false);
    expect(isPaidSubscription({ plan: 'pro', status: 'cancelled' }, NOW)).toBe(false);
  });

  test('an expired status is never paid, even with a future date', () => {
    expect(isPaidSubscription({ plan: 'pro', status: 'expired', endDate: future }, NOW)).toBe(false);
  });

  test('every non-free plan in the schema is treated the same way', () => {
    // free, pro, trainer, club, lifetime — the fourth copy silently excluded
    // lifetime and would have gated voice input on it.
    for (const plan of ['pro', 'trainer', 'club', 'lifetime']) {
      expect(isPaidSubscription({ plan, status: 'active', endDate: future }, NOW)).toBe(true);
    }
  });

  test('the boundary instant still counts as paid', () => {
    expect(isPaidSubscription({ plan: 'pro', status: 'active', endDate: NOW }, NOW)).toBe(true);
  });
});

describe('the rule lives in one place', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const ai = fs.readFileSync(path.join(__dirname, '../routes/ai.ts'), 'utf8');

  test('ai.ts no longer spells the rule out by hand', () => {
    // Any new hand-written variant is how the copies drifted last time.
    expect(ai).not.toMatch(/status === 'active' \|\| \w+\.status === 'cancelled'/);
    expect(ai).not.toMatch(/\['pro', ?'trainer', ?'club'\]\.includes/);
  });

  test('every paid gate in ai.ts goes through the helper', () => {
    const gates = ai.match(/const isPaid(Sub)? = /g) ?? [];
    const viaHelper = ai.match(/const isPaid(Sub)? = isPaidSubscription\(/g) ?? [];
    expect(gates.length).toBe(viaHelper.length);
    expect(gates.length).toBeGreaterThanOrEqual(4);
  });
});
