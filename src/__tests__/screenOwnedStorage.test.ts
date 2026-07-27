/**
 * STATIC SOURCE-CODE SCAN: screen-owned AsyncStorage keys
 * ───────────────────────────────────────────────────────
 * Logout wipes every Zustand store, but a few screens write straight to
 * AsyncStorage under keys nothing ever cleaned. Logging out and signing in as
 * someone else on the same phone left the previous account's progress photos,
 * body measurements and food scans on the device (audit R33).
 *
 * `clearScreenOwnedStorage()` now removes them — but only the keys it knows
 * about. This scan walks the screen sources and fails when a key appears that
 * is in neither list, so a future screen cannot silently re-open the leak.
 *
 * To fix a failure: add the key to SCREEN_OWNED_PRIVATE_KEYS if it holds
 * anything about the user, or to SCREEN_OWNED_KEPT_KEYS (with a reason) if it
 * genuinely does not.
 */

import fs from 'fs';
import path from 'path';

// The module under test imports AsyncStorage, a native module with no
// implementation under jest. Only the key lists matter here.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    multiRemove: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

// eslint-disable-next-line import/first
import {
  SCREEN_OWNED_PRIVATE_KEYS,
  SCREEN_OWNED_KEPT_KEYS,
  clearScreenOwnedStorage,
} from '../utils/screenOwnedStorage';

const SCREENS_DIR = path.resolve(__dirname, '..', 'screens');

/** Zustand persist names — owned by stores, cleared via clearUserData(). */
const STORE_OWNED = new Set(['giron-nutrition', 'giron-settings', 'giron-workouts']);

/** Any string literal that looks like one of our storage keys. */
const KEY_LITERAL = /'((?:giron[_/]|iron_gym|@admin)[^']*)'/g;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe('screen-owned storage keys are all classified', () => {
  const known = new Set<string>([
    ...SCREEN_OWNED_PRIVATE_KEYS,
    ...SCREEN_OWNED_KEPT_KEYS,
    ...STORE_OWNED,
  ]);

  const files = walk(SCREENS_DIR).filter((f) => fs.readFileSync(f, 'utf8').includes('AsyncStorage'));

  test('scan actually found the screens that use AsyncStorage', () => {
    // Guards against the scan silently passing because the glob broke.
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  test('every storage key in a screen is either cleared on logout or explicitly kept', () => {
    const unclassified: string[] = [];

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const match of src.matchAll(KEY_LITERAL)) {
        const key = match[1];
        if (!known.has(key)) {
          unclassified.push(`${path.relative(SCREENS_DIR, file)}: '${key}'`);
        }
      }
    }

    expect(unclassified).toEqual([]);
  });

  test('the private list actually names the body-photo key (the worst leak)', () => {
    expect(SCREEN_OWNED_PRIVATE_KEYS).toContain('giron_progress_photos');
    expect(SCREEN_OWNED_PRIVATE_KEYS).toContain('giron_body_measurements');
  });

  test('no key is both cleared and kept', () => {
    const overlap = SCREEN_OWNED_PRIVATE_KEYS.filter((k) =>
      (SCREEN_OWNED_KEPT_KEYS as readonly string[]).includes(k),
    );
    expect(overlap).toEqual([]);
  });

  test('clearScreenOwnedStorage removes exactly the private keys', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.multiRemove.mockClear();

    await clearScreenOwnedStorage();

    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([...SCREEN_OWNED_PRIVATE_KEYS]);
    // Nothing from the keep-list may be swept up by accident.
    const removed: string[] = AsyncStorage.multiRemove.mock.calls[0][0];
    for (const kept of SCREEN_OWNED_KEPT_KEYS) {
      expect(removed).not.toContain(kept);
    }
  });
});
