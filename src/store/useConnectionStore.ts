import { create } from 'zustand';

interface ConnectionStore {
  isOnline: boolean;
  /** Number of axios requests currently flagged as "slow" (in-flight > 8s). */
  slowRequestCount: number;
  setOnline: (v: boolean) => void;
  incrementSlowRequests: () => void;
  decrementSlowRequests: () => void;
}

export const useConnectionStore = create<ConnectionStore>()((set) => ({
  isOnline: true,
  slowRequestCount: 0,
  setOnline: (isOnline) => set({ isOnline }),
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
