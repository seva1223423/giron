import { create } from 'zustand';

interface ConnectionStore {
  /** Immediate online flag — mirrors the last axios response. Flips on every
   *  transient failure (a single Render cold-start timeout, one failed parallel
   *  request). Screens that need real-time state read this. */
  isOnline: boolean;
  /** Debounced offline flag — true only after `isOnline` has stayed false for
   *  >= OFFLINE_GRACE_MS with no successful response in between. The global
   *  banner reads THIS so a short blip (very common on VPN-routed RU users +
   *  Render free-tier dynos) doesn't flash the banner for 1-2 seconds.
   *  (Folds in PR #36.) */
  isOfflineConfirmed: boolean;
  /** Number of axios requests currently flagged as "slow" (in-flight > 8s). */
  slowRequestCount: number;
  setOnline: (v: boolean) => void;
  incrementSlowRequests: () => void;
  decrementSlowRequests: () => void;
}

// Module-scope timer for the offline-confirmation grace window. Kept outside
// the store so setOnline can clear it on recovery without a re-render.
let confirmationTimer: ReturnType<typeof setTimeout> | null = null;
const OFFLINE_GRACE_MS = 3000;

export const useConnectionStore = create<ConnectionStore>()((set, get) => ({
  isOnline: true,
  isOfflineConfirmed: false,
  slowRequestCount: 0,
  setOnline: (isOnline) => {
    if (isOnline) {
      // Recovered (or never lost) — cancel any pending confirmation, clear both.
      if (confirmationTimer) { clearTimeout(confirmationTimer); confirmationTimer = null; }
      set({ isOnline: true, isOfflineConfirmed: false });
      return;
    }
    // Went offline — flip the immediate flag now, but only CONFIRM (show the
    // banner) if it stays offline past the grace window. Don't restart the
    // timer if one is already counting or offline is already confirmed.
    set({ isOnline: false });
    if (!confirmationTimer && !get().isOfflineConfirmed) {
      confirmationTimer = setTimeout(() => {
        confirmationTimer = null;
        // Re-check: a success during the window already cleared isOnline→true.
        if (!get().isOnline) set({ isOfflineConfirmed: true });
      }, OFFLINE_GRACE_MS);
    }
  },
  incrementSlowRequests: () =>
    set((s) => ({ slowRequestCount: s.slowRequestCount + 1 })),
  decrementSlowRequests: () =>
    set((s) => ({ slowRequestCount: Math.max(0, s.slowRequestCount - 1) })),
}));

export function setOnlineStatus(v: boolean) {
  useConnectionStore.getState().setOnline(v);
}

export function markSlowRequest() {
  useConnectionStore.getState().incrementSlowRequests();
}

export function unmarkSlowRequest() {
  useConnectionStore.getState().decrementSlowRequests();
}
