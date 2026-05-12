/**
 * Unified DTO shapes for the health/smartwatch integration. The adapter
 * layer normalizes provider-specific payloads (HealthKit, Health
 * Connect, BLE) into these types, and `healthSyncService` POSTs them
 * to /api/user/health/sync.
 *
 * Field names mirror the Zod schemas in server/src/routes/health.ts —
 * the server is the source of truth for validation bounds; this file
 * only describes the shape.
 */

export type DeviceSource = 'MANUAL' | 'HEALTHKIT' | 'HEALTH_CONNECT' | 'BLE_DIRECT';

export type HealthScope =
  | 'hr'
  | 'restingHr'
  | 'hrv'
  | 'spo2'
  | 'steps'
  | 'distance'
  | 'calories'
  | 'sleep'
  | 'exercise'
  | 'vo2max'
  | 'bodyTemp';

export type CardioType =
  | 'running' | 'cycling' | 'swimming' | 'walking'
  | 'hiit' | 'elliptical' | 'rowing' | 'other';

export interface GpsPoint {
  lat: number;
  lng: number;
  /** epoch-ms or offset-ms from session start */
  t: number;
  /** elevation in meters */
  ele?: number;
}

export interface HrZones {
  z1?: number; z2?: number; z3?: number; z4?: number; z5?: number;
}

export interface SleepStages {
  rem?: number; deep?: number; light?: number; awake?: number;
}

export interface NormalizedCardio {
  type: CardioType;
  /** YYYY-MM-DD */
  date: string;
  durationMinutes: number;
  distanceKm?: number | null;
  caloriesBurned?: number | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  minHeartRate?: number | null;
  hrZones?: HrZones | null;
  gpsTrack?: GpsPoint[] | null;
  vo2Max?: number | null;
  notes?: string | null;
  deviceSource: DeviceSource;
  /** Provider-side stable id — enables idempotent re-sync. */
  externalId?: string | null;
}

export interface NormalizedSleep {
  /** YYYY-MM-DD — the morning of wake-up */
  date: string;
  /** HH:MM (local) */
  bedtime: string;
  /** HH:MM (local) */
  wakeTime: string;
  durationHours: number;
  quality?: number | null;
  stages?: SleepStages | null;
  spo2Avg?: number | null;
  spo2Min?: number | null;
  awakenings?: number | null;
  hrvAvg?: number | null;
  deviceSource: DeviceSource;
  externalId?: string | null;
}

export interface NormalizedSample {
  kind: 'hr' | 'spo2' | 'hrv' | 'stress' | 'bodyTemp' | 'cycleEvent' | 'vo2max' | 'restingHr' | 'steps';
  value: number;
  unit: string;
  /** ISO-8601 */
  startAt: string;
  endAt?: string | null;
  source: DeviceSource;
  externalId?: string | null;
}

export interface NormalizedHealthPayload {
  cardio: NormalizedCardio[];
  sleep: NormalizedSleep[];
  samples: NormalizedSample[];
}

/**
 * Adapter contract — each provider (HealthKit, Health Connect, BLE)
 * implements this. The orchestrator (`healthSyncService`) picks one by
 * `Platform.OS` and chains the BLE adapter for paired direct devices.
 */
export interface HealthDataProvider {
  readonly kind: 'healthkit' | 'healthconnect' | 'ble';
  /** SDK present on this device + OS supports the integration. */
  isAvailable(): Promise<boolean>;
  /**
   * Request the listed scopes. Returns map of scope → granted (true)
   * or denied (false). Caller decides whether partial grants are
   * acceptable.
   */
  requestPermissions(scopes: HealthScope[]): Promise<Record<HealthScope, boolean>>;
  /** Read current permission state without prompting. */
  getGrantedScopes(): Promise<Record<HealthScope, boolean>>;
  /**
   * Pull all data points with timestamp >= `since`. Returns the
   * normalized payload ready to POST to /health/sync.
   */
  pullSince(since: Date): Promise<NormalizedHealthPayload>;
  /** Best-effort device-list (for the paired-devices UI). */
  listDevices?(): Promise<Array<{ kind: string; displayName: string; externalId: string; capabilities: HealthScope[] }>>;
}

export interface HealthSummary {
  days: number;
  today: {
    date: string;
    activeMin: number;
    caloriesFromCardio: number;
  };
  restingHr: number | null;
  latestVo2Max: number | null;
  latestSpo2: number | null;
  lastSleep: {
    date: string;
    durationHours: number;
    quality: number | null;
    stages: SleepStages | null;
    spo2Avg: number | null;
    hrvAvg: number | null;
    awakenings: number | null;
  } | null;
  sleepHistory: Array<{
    date: string;
    durationHours: number;
    quality: number | null;
    stages: SleepStages | null;
    spo2Avg: number | null;
    hrvAvg: number | null;
    awakenings: number | null;
  }>;
  cardioSessions: number;
}

export interface ConnectedDevice {
  id: string;
  userId: string;
  kind: string;
  displayName: string;
  externalId: string;
  capabilities: string[];
  lastSyncAt: string | null;
  createdAt: string;
}
