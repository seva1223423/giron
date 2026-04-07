import { create } from 'zustand';

interface ConnectionStore {
  isOnline: boolean;
  setOnline: (v: boolean) => void;
}

export const useConnectionStore = create<ConnectionStore>()((set) => ({
  isOnline: true,
  setOnline: (isOnline) => set({ isOnline }),
}));

export function setOnlineStatus(v: boolean) {
  useConnectionStore.getState().setOnline(v);
}
