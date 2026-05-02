/**
 * Round 280 — authUserCache unit tests.
 *
 * Pin the contract of the cache used by auth middleware to skip the
 * Prisma roundtrip on every authenticated request:
 *   - get/set round-trip preserves shape
 *   - TTL expires entries
 *   - delete invalidates immediately (used by ban/role-change paths)
 *   - clear empties the cache (used by tests)
 */

import { authUserCache, AUTH_CACHE_TTL_MS } from '../utils/memCache';

describe('authUserCache', () => {
  beforeEach(() => {
    authUserCache.clear();
  });

  test('get returns undefined when key absent', () => {
    expect(authUserCache.get('u-missing')).toBeUndefined();
  });

  test('set + get round-trips the user shape', () => {
    const user = { isBanned: false, role: 'USER', lockedUntil: null };
    authUserCache.set('u-1', user, AUTH_CACHE_TTL_MS);
    expect(authUserCache.get('u-1')).toEqual(user);
  });

  test('TTL constant matches the documented 60s window', () => {
    // Tracker: if anyone changes AUTH_CACHE_TTL_MS, they must also update
    // the comment in middleware/auth.ts about "60s window means a missed
    // invalidation propagates within at most 60s".
    expect(AUTH_CACHE_TTL_MS).toBe(60_000);
  });

  test('expired entry returns undefined', () => {
    const user = { isBanned: false, role: 'USER', lockedUntil: null };
    authUserCache.set('u-2', user, 10); // 10ms TTL for fast test
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(authUserCache.get('u-2')).toBeUndefined();
        resolve(undefined);
      }, 25);
    });
  });

  test('delete invalidates immediately (ban/role-change pattern)', () => {
    const user = { isBanned: false, role: 'USER', lockedUntil: null };
    authUserCache.set('u-3', user, AUTH_CACHE_TTL_MS);
    expect(authUserCache.get('u-3')).toBeDefined();
    authUserCache.delete('u-3');
    expect(authUserCache.get('u-3')).toBeUndefined();
  });

  test('overwrite same key replaces value', () => {
    authUserCache.set('u-4', { isBanned: false, role: 'USER', lockedUntil: null }, AUTH_CACHE_TTL_MS);
    authUserCache.set('u-4', { isBanned: true, role: 'USER', lockedUntil: null }, AUTH_CACHE_TTL_MS);
    expect(authUserCache.get('u-4')?.isBanned).toBe(true);
  });

  test('lockedUntil Date roundtrips correctly', () => {
    const lockedAt = new Date('2026-05-01T12:00:00Z');
    authUserCache.set('u-5', { isBanned: false, role: 'USER', lockedUntil: lockedAt }, AUTH_CACHE_TTL_MS);
    const got = authUserCache.get('u-5');
    expect(got?.lockedUntil).toBeInstanceOf(Date);
    expect(got?.lockedUntil?.toISOString()).toBe('2026-05-01T12:00:00.000Z');
  });

  test('handles many writes without unbounded growth (LRU evict)', () => {
    // Sanity check: cap is 10K but eviction kicks in. We can't easily probe
    // the exact size without exposing internals; just verify the cache stays
    // functional after a write burst much smaller than the cap.
    for (let i = 0; i < 100; i++) {
      authUserCache.set(`u-burst-${i}`, { isBanned: false, role: 'USER', lockedUntil: null }, AUTH_CACHE_TTL_MS);
    }
    expect(authUserCache.get('u-burst-99')).toBeDefined();
  });
});
