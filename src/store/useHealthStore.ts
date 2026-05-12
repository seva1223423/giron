/**
 * Health store — watch-data state for the Phase B Health screen.
 *
 * Holds the cached summary, paired devices, sync status, and the
 * permission snapshot. Persisted through encryptedStorage because
 * health data is спец-категория under 152-ФЗ.
 *
 * NOTE: this store does NOT duplicate per-record health data (cardio
 * sessions live in useCardioStore, sleep in useSleepStore). It only
 * owns the *summary* fetched from /user/health/summary plus the
 * device-list + sync orchestration state.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEncryptedAsyncStorage } from '../utils/encryptedStorage';
import {
  healthSyncService, DEFAULT_HEALTH_SCOPES,
  type HealthSummary, type ConnectedDevice, type HealthScope,
} from '../services/health';

interface HealthStore {
  summary: HealthSummary | null;
  devices: ConnectedDevice[];
  /** Granted scopes from the latest provider probe. */
  grantedScopes: Partial<Record<HealthScope, boolean>>;
  lastSyncAt: string | null;
  /** A sync is currently running. */
  isSyncing: boolean;
  /** Latest sync error message (cleared when next sync starts). */
  error: string | null;

  // Actions
  refreshGrantedScopes: () => Promise<void>;
  requestPermissions: () => Promise<boolean>;
  syncNow: () => Promise<{ ok: boolean; ingestedTotal: number }>;
  loadSummary: (days?: 1 | 7 | 30) => Promise<void>;
  loadDevices: () => Promise<void>;
  unpairDevice: (id: string) => Promise<void>;

  clearUserData: () => void;
}

export const useHealthStore = create<HealthStore>()(
  persist(
    (set, get) => ({
      summary: null,
      devices: [],
      grantedScopes: {},
      lastSyncAt: null,
      isSyncing: false,
      error: null,

      refreshGrantedScopes: async () => {
        const granted = await healthSyncService.getGrantedScopes();
        set({ grantedScopes: granted });
      },

      requestPermissions: async () => {
        const granted = await healthSyncService.requestPermissions(DEFAULT_HEALTH_SCOPES);
        set({ grantedScopes: granted });
        // "Got at least one read scope" = success enough to start syncing.
        return Object.values(granted).some(Boolean);
      },

      syncNow: async () => {
        if (get().isSyncing) return { ok: false, ingestedTotal: 0 };
        set({ isSyncing: true, error: null });
        const result = await healthSyncService.syncNow();
        const ingestedTotal = result.ingested.cardio + result.ingested.sleep + result.ingested.samples;
        set({
          isSyncing: false,
          error: result.ok ? null : result.error ?? 'Ошибка синхронизации',
          lastSyncAt: result.ok ? new Date().toISOString() : get().lastSyncAt,
        });
        // Refresh summary if anything new arrived
        if (result.ok && ingestedTotal > 0) {
          await get().loadSummary();
        }
        return { ok: result.ok, ingestedTotal };
      },

      loadSummary: async (days = 7) => {
        const summary = await healthSyncService.getSummary(days);
        if (summary) set({ summary });
      },

      loadDevices: async () => {
        const devices = await healthSyncService.listDevices();
        set({ devices });
      },

      unpairDevice: async (id) => {
        const ok = await healthSyncService.unpairDevice(id);
        if (ok) {
          set((s) => ({ devices: s.devices.filter((d) => d.id !== id) }));
        }
      },

      clearUserData: () => set({
        summary: null,
        devices: [],
        grantedScopes: {},
        lastSyncAt: null,
        isSyncing: false,
        error: null,
      }),
    }),
    {
      name: 'health-store',
      storage: createJSONStorage(() => createEncryptedAsyncStorage()),
      version: 1,
      // Don't persist transient runtime state
      partialize: (state) => ({
        summary: state.summary,
        devices: state.devices,
        grantedScopes: state.grantedScopes,
        lastSyncAt: state.lastSyncAt,
      }),
    },
  ),
);
