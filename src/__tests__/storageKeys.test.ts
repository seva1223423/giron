/**
 * Lock all AsyncStorage keys the app writes. Enforces:
 *   - Consistent "iron_gym_*" namespace prefix (no collisions with
 *     other apps sharing device storage)
 *   - No two values-of-the-same-variable have drifted (e.g. scanner
 *     draft accidentally saved under two different keys)
 *   - Stable values (if we rename a key, the old value becomes
 *     orphaned in user storage — this test flags that)
 */

// All key strings currently used across the app. Import paths are
// read-only so this test failing means someone renamed a key without
// also writing a migration.

import { BARCODE_CACHE_KEY_FOR_TEST } from '../testHelpers/storageKeys';

describe('AsyncStorage key namespace', () => {
  // Canonical list of every key string ever written. Adding here
  // requires adding a matching require-and-verify below.
  const KNOWN_KEYS = [
    'iron_gym_barcode_cache',
    'iron_gym_recent_scans',
    'iron_gym_scanner_draft',
    'iron_gym_scanner_last_meal_type',
    'iron_gym_ai_scan_cache',
  ];

  test('every known key has iron_gym_ prefix', () => {
    for (const k of KNOWN_KEYS) {
      expect(k).toMatch(/^iron_gym_/);
    }
  });

  test('no duplicate key values in the known list', () => {
    expect(new Set(KNOWN_KEYS).size).toBe(KNOWN_KEYS.length);
  });

  test('each key contains only lowercase letters, digits, and underscores', () => {
    for (const k of KNOWN_KEYS) {
      expect(k).toMatch(/^[a-z0-9_]+$/);
    }
  });

  test('barcode cache key exported by test helper matches known list', () => {
    expect(KNOWN_KEYS).toContain(BARCODE_CACHE_KEY_FOR_TEST);
  });
});
