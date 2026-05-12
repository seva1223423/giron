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
import { useAuthStore } from '../../store/useAuthStore';
import { healthConnectAdapter } from './healthConnectAdapter';
import { healthKitAdapter } from './healthKitAdapter';
import { noopAdapter } from './noopAdapter';
import type {
  HealthDataProvider, HealthScope, HealthSummary,
  ConnectedDevice, NormalizedHealthPayload,
} from './types';

const LAST_SYNC_KEY_PREFIX = 'health-last-sync-iso';
const FIRST_SYNC_DAYS = 14;

/**
 * R240 audit H4: scope the last-sync cursor by userId. Without this,
 * if user A logs out and user B logs in on the same APK install
 * (testing/support flow), B's first sync would skip everything older
 * than A's cursor — silently truncating history.
 */
function lastSyncKey(): string {
  const userId = useAuthStore.getState().user?.id;
  return userId ? `${LAST_SYNC_KEY_PREFIX}:${userId}` : LAST_SYNC_KEY_PREFIX;
}

/** Default scope set requested on first pair. */
export const DEFAULT_HEALTH_SCOPES: HealthScope[] = [
  'hr', 'restingHr', 'hrv', 'spo2',
  'steps', 'distance', 'calories',
  'sleep', 'exercise', 'vo2max',
];

/** Pick the adapter for the current platform. Exported for tests. */
export function getProvider(): HealthDataProvider {
  if (Platform.OS === 'android') return healthConnectAdapter;
  if (Platform.OS === 'ios') return healthKitAdapter;
  return noopAdapter;
}

async function loadLastSync(): Promise<Date> {
  try {
    const iso = await AsyncStorage.getItem(lastSyncKey());
    if (iso) return new Date(iso);
  } catch { /* ignore */ }
  return new Date(Date.now() - FIRST_SYNC_DAYS * 86400_000);
}

async function saveLastSync(d: Date): Promise<void> {
  try {
    await AsyncStorage.setItem(lastSyncKey(), d.toISOString());
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

  /**
   * Daily step totals from watch-synced HealthSample(kind=steps).
   * Returned as { date, steps, sources } ascending. Empty array on
   * error / unauthenticated — caller falls back to phone pedometer.
   *
   * R240 audit H2: passes the device's timezone offset so the server
   * buckets on the LOCAL day boundary instead of UTC. Without this,
   * 23:30 МСК and 02:30 МСК (next local day) would collapse into one
   * UTC day on the server, misaligning with the local-day pedometer.
   */
  async getDailySteps(days: number = 30): Promise<Array<{ date: string; steps: number; sources: string[] }>> {
    try {
      const tzOffsetMin = new Date().getTimezoneOffset();
      const { data } = await api.get('/user/health/steps', { params: { days, tzOffsetMin } });
      return Array.isArray(data?.series) ? data.series : [];
    } catch {
      return [];
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
      const iso = await AsyncStorage.getItem(lastSyncKey());
      return iso ? new Date(iso) : null;
    } catch {
      return null;
    }
  },

  /** Test/debug helper: drop the last-sync cursor so the next call re-pulls everything. */
  async clearLastSync(): Promise<void> {
    try {
      await AsyncStorage.removeItem(lastSyncKey());
    } catch { /* ignore */ }
  },
};
