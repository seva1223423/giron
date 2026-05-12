/**
 * Health sync orchestrator — picks the right adapter for the current
 * platform, runs a pull, and POSTs to the server.
 *
 * Sync strategy: "quality first" hybrid (per the round-240 plan).
 *   - pull-on-open: HealthScreen calls `syncNow()` on mount
 *   - manual: HealthScreen sync button
 *   - background: TaskManager wakes us every ~12h (see backgroundTask.ts)
 *
 * Each call pulls "since the last successful sync" — first call uses
 * 14 days as the floor so a freshly-installed app gets meaningful
 * history without overflowing the 2000-item Zod cap.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';
import { healthConnectAdapter } from './healthConnectAdapter';
import { noopAdapter } from './noopAdapter';
import type {
  HealthDataProvider, HealthScope, HealthSummary,
  ConnectedDevice, NormalizedHealthPayload,
} from './types';

const LAST_SYNC_KEY = 'health-last-sync-iso';
const FIRST_SYNC_DAYS = 14;

/** Default scope set requested on first pair. */
export const DEFAULT_HEALTH_SCOPES: HealthScope[] = [
  'hr', 'restingHr', 'hrv', 'spo2',
  'steps', 'distance', 'calories',
  'sleep', 'exercise', 'vo2max',
];

/** Pick the adapter for the current platform. Exported for tests. */
export function getProvider(): HealthDataProvider {
  if (Platform.OS === 'android') return healthConnectAdapter;
  return noopAdapter;
}

async function loadLastSync(): Promise<Date> {
  try {
    const iso = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (iso) return new Date(iso);
  } catch { /* ignore */ }
  return new Date(Date.now() - FIRST_SYNC_DAYS * 86400_000);
}

async function saveLastSync(d: Date): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SYNC_KEY, d.toISOString());
  } catch { /* ignore */ }
}

export interface SyncResult {
  ok: boolean;
  ingested: { cardio: number; sleep: number; samples: number };
  pulled: { cardio: number; sleep: number; samples: number };
  error?: string;
}

export const healthSyncService = {
  getProvider,

  /** Probe the underlying SDK without prompting. */
  async isAvailable(): Promise<boolean> {
    return getProvider().isAvailable();
  },

  /** Show the system permission UI. */
  async requestPermissions(scopes: HealthScope[] = DEFAULT_HEALTH_SCOPES): Promise<Record<HealthScope, boolean>> {
    return getProvider().requestPermissions(scopes);
  },

  /** Current grant state without prompting (for the permission banner). */
  async getGrantedScopes(): Promise<Record<HealthScope, boolean>> {
    return getProvider().getGrantedScopes();
  },

  /**
   * Pull-and-push the delta since the last successful sync. Idempotent
   * by design (server uses `skipDuplicates` on unique indexes) so
   * partial failures are safe to retry.
   */
  async syncNow(): Promise<SyncResult> {
    const provider = getProvider();
    const available = await provider.isAvailable();
    if (!available) {
      return {
        ok: false,
        pulled: { cardio: 0, sleep: 0, samples: 0 },
        ingested: { cardio: 0, sleep: 0, samples: 0 },
        error: Platform.OS === 'android' ? 'Health Connect не установлен' : 'Источник данных недоступен',
      };
    }

    const since = await loadLastSync();
    let payload: NormalizedHealthPayload;
    try {
      payload = await provider.pullSince(since);
    } catch (e: any) {
      return {
        ok: false,
        pulled: { cardio: 0, sleep: 0, samples: 0 },
        ingested: { cardio: 0, sleep: 0, samples: 0 },
        error: e?.message ?? 'Ошибка чтения данных',
      };
    }

    const pulled = {
      cardio: payload.cardio.length,
      sleep: payload.sleep.length,
      samples: payload.samples.length,
    };

    // Nothing pulled? Still bump the lastSync cursor so we don't keep
    // re-fetching the same empty window forever.
    if (pulled.cardio + pulled.sleep + pulled.samples === 0) {
      await saveLastSync(new Date());
      return { ok: true, pulled, ingested: { cardio: 0, sleep: 0, samples: 0 } };
    }

    try {
      const { data } = await api.post('/user/health/sync', payload);
      await saveLastSync(new Date());
      return {
        ok: true,
        pulled,
        ingested: data?.ingested ?? { cardio: 0, sleep: 0, samples: 0 },
      };
    } catch (e: any) {
      return {
        ok: false,
        pulled,
        ingested: { cardio: 0, sleep: 0, samples: 0 },
        error: e?.response?.data?.error ?? e?.message ?? 'Ошибка отправки на сервер',
      };
    }
  },

  /** Fetch the aggregated summary for the HealthScreen cards. */
  async getSummary(days: 1 | 7 | 30 = 7): Promise<HealthSummary | null> {
    try {
      const { data } = await api.get('/user/health/summary', { params: { days } });
      return data as HealthSummary;
    } catch {
      return null;
    }
  },

  async listDevices(): Promise<ConnectedDevice[]> {
    try {
      const { data } = await api.get('/user/devices');
      return data as ConnectedDevice[];
    } catch {
      return [];
    }
  },

  async pairDevice(input: { kind: string; displayName: string; externalId: string; capabilities: string[] }): Promise<ConnectedDevice | null> {
    try {
      const { data } = await api.post('/user/devices', input);
      return data as ConnectedDevice;
    } catch {
      return null;
    }
  },

  async unpairDevice(id: string): Promise<boolean> {
    try {
      await api.delete(`/user/devices/${id}`);
      return true;
    } catch {
      return false;
    }
  },

  async getLastSyncAt(): Promise<Date | null> {
    try {
      const iso = await AsyncStorage.getItem(LAST_SYNC_KEY);
      return iso ? new Date(iso) : null;
    } catch {
      return null;
    }
  },

  /** Test/debug helper: drop the last-sync cursor so the next call re-pulls everything. */
  async clearLastSync(): Promise<void> {
    try {
      await AsyncStorage.removeItem(LAST_SYNC_KEY);
    } catch { /* ignore */ }
  },
};
