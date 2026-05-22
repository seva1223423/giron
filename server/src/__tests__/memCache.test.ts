/**
 * Unit tests for utils/memCache — verifies TTL eviction, capacity
 * eviction, the LRU re-set fix (delete+set so updates move entry to
 * the back of iteration order), and singleton cache configuration.
 */

import { MemCache, adminStatsCache, newsCache, foodVisionCache, aiUserContextCache, AI_USER_CONTEXT_TTL_MS } from '../utils/memCache';

describe('MemCache TTL', () => {
  test('returns undefined for missing key', () => {
    const cache = new MemCache<string>();
    expect(cache.get('missing')).toBeUndefined();
  });

  test('returns value before TTL expires', () => {
    const cache = new MemCache<string>();
    cache.set('k', 'v', 1000);
    expect(cache.get('k')).toBe('v');
  });

  test('returns undefined after TTL expires', async () => {
    const cache = new MemCache<string>();
    cache.set('k', 'v', 5);
    await new Promise((r) => setTimeout(r, 15));
    expect(cache.get('k')).toBeUndefined();
  });

  test('expired-on-read deletes the entry from the store', async () => {
    const cache = new MemCache<string>();
    cache.set('k', 'v', 5);
    await new Promise((r) => setTimeout(r, 15));
    expect(cache.get('k')).toBeUndefined();
    // Internally the entry should now be gone — size === 0
    expect(cache.size).toBe(0);
  });
});

describe('MemCache capacity eviction', () => {
  test('evicts oldest entry when capacity exceeded', () => {
    const cache = new MemCache<number>(3);
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.set('c', 3, 60_000);
    cache.set('d', 4, 60_000); // should evict 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  test('does NOT evict when re-setting an existing key (size stays same)', () => {
    const cache = new MemCache<number>(3);
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.set('c', 3, 60_000);
    cache.set('a', 99, 60_000); // re-set 'a', not a new key — no eviction
    expect(cache.get('a')).toBe(99);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});

describe('MemCache LRU re-set ordering', () => {
  test('re-setting an existing key promotes it to back of iteration', () => {
    // The delete+set trick keeps frequently-accessed keys alive longer
    // when capacity eviction kicks in. Without it, the original
    // insertion order is preserved on `set` (Map semantics) and the
    // hot key would be wrongfully evicted as "oldest".
    const cache = new MemCache<number>(3);
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.set('c', 3, 60_000);
    // Re-set 'a' — should move it to the back. Now 'b' is the oldest.
    cache.set('a', 99, 60_000);
    cache.set('d', 4, 60_000); // should evict 'b' (now oldest), NOT 'a'
    expect(cache.get('a')).toBe(99); // hot key survived
    expect(cache.get('b')).toBeUndefined(); // evicted
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });
});

describe('MemCache delete + clear', () => {
  test('delete removes a single key', () => {
    const cache = new MemCache<string>();
    cache.set('k', 'v', 60_000);
    cache.delete('k');
    expect(cache.get('k')).toBeUndefined();
  });

  test('clear empties the store', () => {
    const cache = new MemCache<number>();
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  test('prune removes only expired entries', async () => {
    const cache = new MemCache<number>();
    cache.set('short', 1, 5);
    cache.set('long', 2, 60_000);
    await new Promise((r) => setTimeout(r, 15));
    cache.prune();
    expect(cache.get('short')).toBeUndefined();
    expect(cache.get('long')).toBe(2);
  });

  test('deletePrefix removes only entries whose keys start with the given prefix', () => {
    const cache = new MemCache<number>();
    cache.set('u1:abc', 1, 60_000);
    cache.set('u1:text:def', 2, 60_000);
    cache.set('u2:xyz', 3, 60_000);
    cache.set('preview:counts', 4, 60_000);

    const removed = cache.deletePrefix('u1:');

    expect(removed).toBe(2);
    expect(cache.get('u1:abc')).toBeUndefined();
    expect(cache.get('u1:text:def')).toBeUndefined();
    expect(cache.get('u2:xyz')).toBe(3);          // different prefix — kept
    expect(cache.get('preview:counts')).toBe(4);  // different prefix — kept
  });

  test('deletePrefix returns 0 and is a no-op when no key matches', () => {
    const cache = new MemCache<number>();
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);

    const removed = cache.deletePrefix('zzz:');

    expect(removed).toBe(0);
    expect(cache.size).toBe(2);
  });
});

describe('Singleton caches', () => {
  test('all four singletons are MemCache instances and respond to size', () => {
    expect(typeof adminStatsCache.size).toBe('number');
    expect(typeof newsCache.size).toBe('number');
    expect(typeof foodVisionCache.size).toBe('number');
    expect(typeof aiUserContextCache.size).toBe('number');
  });

  test('AI_USER_CONTEXT_TTL_MS is 60s (matches authUserCache window)', () => {
    // Pin the TTL so a future change forces an explicit test update.
    // 60s is the design contract — short enough that profile edits
    // propagate within a minute, long enough that a hot user benefits
    // from cache reuse across consecutive AI messages.
    expect(AI_USER_CONTEXT_TTL_MS).toBe(60_000);
  });

  test('aiUserContextCache get/set/delete cycle works for opaque payloads', () => {
    // The cache is typed `any` in memCache.ts (the typed shape lives at
    // the AI-route use site to avoid pulling Prisma types into this
    // shared util). Test the public API still round-trips.
    const userId = 'test-user-' + Date.now();
    const payload = {
      id: userId,
      firstName: 'Test',
      healthRestrictions: [{ id: 'r1', bodyPart: 'knee', description: 'pain', severity: 'mild' }],
    };
    expect(aiUserContextCache.get(userId)).toBeUndefined();
    aiUserContextCache.set(userId, payload, 60_000);
    const cached = aiUserContextCache.get(userId) as typeof payload;
    expect(cached).toEqual(payload);
    expect(cached.healthRestrictions[0].bodyPart).toBe('knee');
    aiUserContextCache.delete(userId);
    expect(aiUserContextCache.get(userId)).toBeUndefined();
  });
});
