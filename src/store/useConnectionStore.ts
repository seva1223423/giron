import { create } from 'zustand';

/**
 * Connection store with two-tier offline detection (round 291).
 *
 *   isOnline           — immediate. Mirrors the last axios response.
 *                        Flips on every transient failure (e.g. a
 *                        single Render cold-start timeout). Used by
 *                        screens that need real-time state.
 *
 *   isOfflineConfirmed — debounced. True only after `isOnline` has
 *                        stayed `false` for >= OFFLINE_GRACE_MS without
 *                        any successful response in between. Used by
 *                        the global "Нет соединения" banner so a single
 *                        transient blip (very common on VPN-routed
 *                        Russian users + Render free-tier dynos) doesn't
 *                        flash the banner for 1-2 seconds.
 *
 *   When a success arrives, both flip back to online and the pending
 *   confirmation timer is cancelled — banner never shows for short
 *   blips, but it DOES show for sustained outages.
 */

const OFFLINE_GRACE_MS = 3000;

interface ConnectionStore {
  isOnline: boolean;
  isOfflineConfirmed: boolean;
  setOnline: (v: boolean) => void;
}

let confirmationTimer: ReturnType<typeof setTimeout> | null = null;

export const useConnectionStore = create<ConnectionStore>()((set) => ({
  isOnline: true,
  isOfflineConfirmed: false,
  setOnline: (isOnline) => {
    if (isOnline) {
      if (confirmationTimer) {
        clearTimeout(confirmationTimer);
        confirmationTimer = null;
      }
      set({ isOnline: true, isOfflineConfirmed: false });
      return;
    }
    set({ isOnline: false });
    if (!confirmationTimer) {
      confirmationTimer = setTimeout(() => {
        confirmationTimer = null;
        // Re-check inside the timer in case a success has already
        // flipped isOnline back to true in the meantime.
        useConnectionStore.setState((s) => (s.isOnline ? s : { isOfflineConfirmed: true }));
      }, OFFLINE_GRACE_MS);
    }
  },
}));

export function setOnlineStatus(v: boolean) {
  useConnectionStore.getState().setOnline(v);
}
