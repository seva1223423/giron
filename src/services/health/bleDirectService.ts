/**
 * BLE direct service — scan + pair + capture heart-rate samples from
 * Bluetooth-LE devices that expose the standard Heart Rate Service
 * (GATT 0x180D / characteristic 0x2A37). Phase D of round 240.
 *
 * Targets: Polar H10 chest strap, generic HR straps (Wahoo TICKR,
 * Coros, Garmin HRM-Dual), Mi Band 8/9 in standard-HR mode. Mi Band
 * proprietary auth-encrypted protocols are explicitly out of scope.
 *
 * NOT-INCLUDED (per anti-scope-creep in the plan):
 *  - Live HR streaming inside an active workout (future)
 *  - GATT discovery of non-HR profiles
 *  - Bluetooth Classic (BR/EDR) pairing
 *
 * The user explicitly triggers `captureSession(deviceId, minutes)` from
 * the Health screen. We connect, subscribe to HR-measurement notify,
 * collect samples for the requested duration, then disconnect and
 * return the normalized payload. The orchestrator uploads them as
 * `HealthSample { kind: 'hr', source: 'BLE_DIRECT' }`.
 *
 * Lazy-loads `react-native-ble-plx` so jest + web don't choke when the
 * native module isn't linked.
 */
import { Platform } from 'react-native';
import { api } from '../api';
import type { NormalizedSample, ConnectedDevice } from './types';

const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT_CHAR_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

type BleModule = typeof import('react-native-ble-plx');
type BleManager = InstanceType<BleModule['BleManager']>;

let cachedModule: BleModule | null = null;
let manager: BleManager | null = null;

async function loadModule(): Promise<BleModule | null> {
  if (Platform.OS === 'web') return null;
  if (cachedModule) return cachedModule;
  try {
    cachedModule = (await import('react-native-ble-plx')) as BleModule;
    return cachedModule;
  } catch {
    return null;
  }
}

async function getManager(): Promise<BleManager | null> {
  if (manager) return manager;
  const mod = await loadModule();
  if (!mod) return null;
  try {
    manager = new mod.BleManager();
    return manager;
  } catch {
    return null;
  }
}

export interface BleDiscoveredDevice {
  id: string;            // MAC (Android) / UUID (iOS)
  name: string;
  rssi: number | null;
}

/**
 * Heart-rate measurement characteristic decoder.
 * Reference: bluetooth.com Heart Rate Service spec.
 *
 * Byte 0 flags:
 *   bit 0 = 0 → uint8 HR follows, 1 → uint16 HR follows
 *   bit 1-2 → sensor contact (unused)
 *   bit 3 → energy expended present (skipped)
 *   bit 4 → RR-intervals present (skipped)
 */
function decodeHr(value: Uint8Array | number[]): number | null {
  const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value);
  if (bytes.length < 2) return null;
  const flags = bytes[0];
  const is16 = (flags & 0x01) === 1;
  if (is16) {
    if (bytes.length < 3) return null;
    return bytes[1] | (bytes[2] << 8);
  }
  return bytes[1];
}

function base64ToBytes(b64: string): Uint8Array {
  // Minimal RN-safe base64 → bytes. react-native-ble-plx returns
  // characteristic values as base64 strings.
  const binStr = (globalThis as any).atob ? (globalThis as any).atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) out[i] = binStr.charCodeAt(i);
  return out;
}

export const bleDirectService = {
  /** Is the BLE manager + permissions available on this device. */
  async isAvailable(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    const mgr = await getManager();
    if (!mgr) return false;
    try {
      const state = await mgr.state();
      return state === 'PoweredOn';
    } catch {
      return false;
    }
  },

  /**
   * Scan for nearby BLE devices advertising the Heart Rate Service.
   * Returns after `timeoutSeconds` (default 10s) with the unique
   * devices observed during the scan window.
   */
  async scanForHrDevices(timeoutSeconds = 10): Promise<BleDiscoveredDevice[]> {
    const mgr = await getManager();
    if (!mgr) return [];
    const found = new Map<string, BleDiscoveredDevice>();
    return new Promise((resolve) => {
      try {
        mgr.startDeviceScan([HR_SERVICE_UUID], null, (err, device) => {
          if (err || !device) return;
          if (!found.has(device.id)) {
            found.set(device.id, {
              id: device.id,
              name: device.name ?? device.localName ?? 'Безымянное BLE-устройство',
              rssi: device.rssi ?? null,
            });
          }
        });
        setTimeout(() => {
          try { mgr.stopDeviceScan(); } catch { /* ignore */ }
          resolve(Array.from(found.values()).sort((a, b) => (b.rssi ?? -200) - (a.rssi ?? -200)));
        }, timeoutSeconds * 1000);
      } catch {
        try { mgr.stopDeviceScan(); } catch { /* ignore */ }
        resolve([]);
      }
    });
  },

  /**
   * Pair a discovered BLE device with the server's ConnectedDevice
   * registry. Idempotent on (kind, externalId).
   */
  async pairWithServer(device: BleDiscoveredDevice): Promise<ConnectedDevice | null> {
    try {
      // Infer kind from name heuristically. Falls back to 'generic_ble'.
      const lc = device.name.toLowerCase();
      const kind = lc.includes('polar h10') ? 'polar_h10'
        : lc.includes('mi band') || lc.includes('xiaomi smart band') ? 'mi_band'
          : lc.includes('wahoo') ? 'wahoo_tickr'
            : lc.includes('garmin') ? 'garmin_hrm'
              : 'generic_ble';
      const { data } = await api.post('/user/devices', {
        kind,
        displayName: device.name,
        externalId: device.id,
        capabilities: ['hr'],
      });
      return data as ConnectedDevice;
    } catch {
      return null;
    }
  },

  /**
   * Connect to a paired BLE device, subscribe to HR-measurement notify,
   * collect samples for `durationSeconds`, then disconnect.
   *
   * Samples are pushed to the server in batches via /user/health/sync
   * with kind='hr', source='BLE_DIRECT'. Returns the count of samples
   * captured.
   */
  async captureSession(deviceId: string, durationSeconds: number = 60): Promise<number> {
    const mgr = await getManager();
    if (!mgr) return 0;
    const collected: NormalizedSample[] = [];
    let connection: any = null;
    let monitorSub: any = null;
    try {
      connection = await mgr.connectToDevice(deviceId);
      await connection.discoverAllServicesAndCharacteristics();

      const start = Date.now();
      const stopAt = start + durationSeconds * 1000;

      await new Promise<void>((resolve) => {
        monitorSub = connection.monitorCharacteristicForService(
          HR_SERVICE_UUID,
          HR_MEASUREMENT_CHAR_UUID,
          (err: any, char: any) => {
            if (err || !char?.value) {
              if (Date.now() >= stopAt) resolve();
              return;
            }
            const bytes = base64ToBytes(char.value);
            const hr = decodeHr(bytes);
            if (hr != null && hr >= 30 && hr <= 250) {
              collected.push({
                kind: 'hr',
                value: hr,
                unit: 'bpm',
                startAt: new Date().toISOString(),
                source: 'BLE_DIRECT',
                externalId: `BLE-${deviceId}-${Date.now()}`,
              });
            }
            if (Date.now() >= stopAt) resolve();
          },
        );
        setTimeout(resolve, durationSeconds * 1000 + 500);
      });
    } catch {
      // connection / discovery failed — fall through to cleanup
    } finally {
      try { monitorSub?.remove?.(); } catch { /* ignore */ }
      try { await connection?.cancelConnection?.(); } catch { /* ignore */ }
    }

    if (collected.length === 0) return 0;
    try {
      await api.post('/user/health/sync', { samples: collected });
    } catch {
      // upload failed — samples are lost, the user can retry. We
      // deliberately don't store on disk: BLE captures are short and
      // re-runnable, and persisting un-ack'd samples adds complexity.
    }
    return collected.length;
  },
};
