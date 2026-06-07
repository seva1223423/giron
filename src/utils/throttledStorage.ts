/**
 * throttledStorage — wraps any Zustand StateStorage to coalesce rapid
 * setItem calls into one write every N milliseconds.
 *
 * Why this exists (audit R-2026-05-22 finding M3):
 * Zustand `persist` writes the whole partialized state on every `set()`.
 * For workoutStore that means encrypting + AES-GCM + AsyncStorage on
 * EVERY ✓ tap during an active workout — up to ~3 MB per write, multiple
 * times per minute. The JS thread stalls; haptic feedback drifts.
 *
 * This wrapper debounces setItem with "last write wins" semantics: a
 * burst of N setItem calls within the throttle window collapses to a
 * single write of the final value. Throws nothing extra — same shape as
 * the inner storage.
 *
 * Crash safety: a pending write held in memory is lost if the app is
 * force-killed inside the window. For workoutStore that means ≤2s of
 * mutations (typically 0-1 sets). The trade-off is acceptable — fewer
 * disk writes vs. losing one set on a crash, which the user can easily
 * re-enter. Background/inactive transitions trigger a synchronous flush
 * so a normal app-switch always persists.
 *
 * Usage:
 *   import { createThrottledStorage } from '../utils/throttledStorage';
 *   import { createEncryptedAsyncStorage } from '../utils/encryptedStorage';
 *   persist(creator, {
 *     storage: createJSONStorage(() =>
 *       createThrottledStorage(createEncryptedAsyncStorage(), 2000)
 *     ),
 *     ...
 *   });
 */

import { AppState, type AppStateStatus } from 'react-native';

interface SyncOrAsyncStorage {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

interface PendingWrite {
  value: string;
  timer: ReturnType<typeof setTimeout>;
}

export interface ThrottledStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  /** Force-flush all pending writes immediately. Called automatically
   *  on AppState background/inactive transitions. */
  flushPending: () => Promise<void>;
}

/** Module-level set of every active wrapper so the single AppState
 *  listener below can flush them all without each wrapper duplicating
 *  the listener registration (each new useStore() during HMR would
 *  otherwise stack listeners). */
const activeWrappers = new Set<ThrottledStorage>();
let appStateListenerInstalled = false;

function ensureAppStateListener(): void {
  if (appStateListenerInstalled) return;
  appStateListenerInstalled = true;
  AppState.addEventListener('change', (next: AppStateStatus) => {
    // Background or inactive = app is being suspended → flush now or lose
    // pending writes when the OS swaps us out.
    if (next === 'background' || next === 'inactive') {
      for (const wrapper of activeWrappers) {
        // Fire-and-forget — RN gives us a window before suspend, the
        // writes are small (KB-MB range), and there's no caller to await.
        void wrapper.flushPending();
      }
    }
  });
}

export function createThrottledStorage(
  inner: SyncOrAsyncStorage,
  throttleMs: number = 2000,
): ThrottledStorage {
  const pending = new Map<string, PendingWrite>();

  const flushOne = async (key: string): Promise<void> => {
    const entry = pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(key);
    await inner.setItem(key, entry.value);
  };

  const wrapper: ThrottledStorage = {
    async getItem(key: string): Promise<string | null> {
      // Read-your-writes: if a pending value is in memory, hand it back
      // immediately instead of returning the stale disk value. Without
      // this, a Zustand store that calls setItem then immediately reads
      // (rare but possible during rehydration tests) would see the old
      // value.
      const pendingEntry = pending.get(key);
      if (pendingEntry) return pendingEntry.value;
      const result = await Promise.resolve(inner.getItem(key));
      return result;
    },

    async setItem(key: string, value: string): Promise<void> {
      // Replace any existing pending write for this key — last write wins.
      const existing = pending.get(key);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        void flushOne(key);
      }, throttleMs);
      pending.set(key, { value, timer });
    },

    async removeItem(key: string): Promise<void> {
      // Cancel any pending write for the key — no point writing what
      // we're about to delete.
      const existing = pending.get(key);
      if (existing) clearTimeout(existing.timer);
      pending.delete(key);
      await Promise.resolve(inner.removeItem(key));
    },

    async flushPending(): Promise<void> {
      const keys = [...pending.keys()];
      // Sequential flush — AsyncStorage handles parallel writes fine but
      // a sequential loop keeps the call-site simpler and the keys are
      // few (one per persisted store at most).
      for (const key of keys) {
        await flushOne(key);
      }
    },
  };

  activeWrappers.add(wrapper);
  ensureAppStateListener();
  return wrapper;
}

/** Flush every active throttled wrapper's pending writes immediately.
 *  Called on logout (audit 2026-05-29 H7): clearUserData() queues an empty
 *  store snapshot through the 2s throttle, so without an explicit flush a kill
 *  right after logout leaves the previous account's data on disk to rehydrate
 *  under the next account. Flushing writes the cleared snapshot now. */
export async function flushAllThrottledStorage(): Promise<void> {
  await Promise.all([...activeWrappers].map((w) => w.flushPending()));
}

/** Test-only: drop all wrappers + reset listener flag. The AppState
 *  listener itself can't be removed reliably without storing the
 *  subscription; in tests we just orphan it (jest jsdom AppState is a
 *  no-op). */
export function _resetForTest(): void {
  activeWrappers.clear();
  appStateListenerInstalled = false;
}
