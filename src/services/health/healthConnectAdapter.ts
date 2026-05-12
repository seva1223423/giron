/**
 * Health Connect adapter — Android implementation of HealthDataProvider.
 *
 * Health Connect (com.google.android.apps.healthdata) is the standard
 * Android health-data hub since 2024. Vendors (Mi Fitness, Galaxy
 * Health, Garmin Connect, Fitbit) sync into HC, and we read from HC —
 * no per-vendor BLE handshakes required for the common case.
 *
 * Library: `react-native-health-connect` (matinzd) v3.x. The API
 * surface is `initialize() → requestPermission() → readRecords()` per
 * record type. Each record type has its own permission scope.
 *
 * This adapter is lazy: it dynamic-imports the native module only when
 * `isAvailable()` succeeds. On iOS or web the import is skipped
 * entirely so jest can run without polyfilling the native module.
 */
import { Platform } from 'react-native';
import type {
  HealthDataProvider, HealthScope, NormalizedHealthPayload,
  NormalizedCardio, NormalizedSleep, NormalizedSample, CardioType,
} from './types';

// Maps app-level scopes → Health Connect record type names. Kept tight:
// each entry is a record type we actually read in `pullSince`.
const SCOPE_TO_HC_TYPE: Record<HealthScope, string> = {
  hr: 'HeartRate',
  restingHr: 'RestingHeartRate',
  hrv: 'HeartRateVariabilityRmssd',
  spo2: 'OxygenSaturation',
  steps: 'Steps',
  distance: 'Distance',
  calories: 'TotalCaloriesBurned',
  sleep: 'SleepSession',
  exercise: 'ExerciseSession',
  vo2max: 'Vo2Max',
  bodyTemp: 'BodyTemperature',
};

// Health Connect exercise type IDs → our CardioType. HC ships ~80
// exercise types; we map the ones a cardio session is likely to be
// and route everything else to 'other'.
const HC_EXERCISE_TYPE_MAP: Record<number, CardioType> = {
  56: 'running',          // EXERCISE_TYPE_RUNNING
  57: 'running',          // EXERCISE_TYPE_RUNNING_TREADMILL
  8: 'cycling',           // EXERCISE_TYPE_BIKING
  9: 'cycling',           // EXERCISE_TYPE_BIKING_STATIONARY
  74: 'swimming',         // EXERCISE_TYPE_SWIMMING_POOL
  75: 'swimming',         // EXERCISE_TYPE_SWIMMING_OPEN_WATER
  79: 'walking',          // EXERCISE_TYPE_WALKING
  35: 'hiit',             // EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING
  25: 'elliptical',       // EXERCISE_TYPE_ELLIPTICAL
  55: 'rowing',           // EXERCISE_TYPE_ROWING (machine)
};

type HCModule = typeof import('react-native-health-connect');

let cachedModule: HCModule | null = null;
async function loadModule(): Promise<HCModule | null> {
  if (Platform.OS !== 'android') return null;
  if (cachedModule) return cachedModule;
  try {
    // Dynamic import: bundle still works on iOS / web (jest) where the
    // native module isn't linked. Only invoked when Platform.OS ===
    // 'android' so the import path is never traversed elsewhere.
    cachedModule = (await import('react-native-health-connect')) as HCModule;
    return cachedModule;
  } catch {
    return null;
  }
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toHm(d: Date): string {
  return d.toTimeString().slice(0, 5);
}

function mapExerciseType(typeId: number | undefined): CardioType {
  if (typeId == null) return 'other';
  return HC_EXERCISE_TYPE_MAP[typeId] ?? 'other';
}

export const healthConnectAdapter: HealthDataProvider = {
  kind: 'healthconnect',

  async isAvailable() {
    if (Platform.OS !== 'android') return false;
    const mod = await loadModule();
    if (!mod) return false;
    try {
      // initialize() throws if Health Connect isn't installed on the
      // device. The matinzd lib also exposes getSdkStatus() — when
      // status !== 'SDK_AVAILABLE' the user needs to install HC from
      // Play Store. We treat both as "unavailable" for now; the screen
      // shows a "install Health Connect" CTA when isAvailable=false.
      const ok = await mod.initialize();
      if (!ok) return false;
      const status = await mod.getSdkStatus();
      return status === mod.SdkAvailabilityStatus.SDK_AVAILABLE;
    } catch {
      return false;
    }
  },

  async requestPermissions(scopes) {
    const mod = await loadModule();
    const result: Record<HealthScope, boolean> = {} as any;
    if (!mod) {
      for (const s of scopes) result[s] = false;
      return result;
    }
    try {
      const granted = await mod.requestPermission(
        scopes.map((s) => ({
          accessType: 'read' as const,
          recordType: SCOPE_TO_HC_TYPE[s] as any,
        })),
      );
      const grantedSet = new Set(granted.map((g: any) => g.recordType));
      for (const s of scopes) result[s] = grantedSet.has(SCOPE_TO_HC_TYPE[s]);
      return result;
    } catch {
      for (const s of scopes) result[s] = false;
      return result;
    }
  },

  async getGrantedScopes() {
    const mod = await loadModule();
    const result: Record<HealthScope, boolean> = {} as any;
    if (!mod) {
      for (const s of Object.keys(SCOPE_TO_HC_TYPE) as HealthScope[]) result[s] = false;
      return result;
    }
    try {
      const granted = await mod.getGrantedPermissions();
      const grantedSet = new Set(granted.map((g: any) => g.recordType));
      for (const s of Object.keys(SCOPE_TO_HC_TYPE) as HealthScope[]) {
        result[s] = grantedSet.has(SCOPE_TO_HC_TYPE[s]);
      }
      return result;
    } catch {
      for (const s of Object.keys(SCOPE_TO_HC_TYPE) as HealthScope[]) result[s] = false;
      return result;
    }
  },

  async pullSince(since) {
    const payload: NormalizedHealthPayload = { cardio: [], sleep: [], samples: [] };
    const mod = await loadModule();
    if (!mod) return payload;
    const now = new Date();
    const timeRange = {
      operator: 'between' as const,
      startTime: since.toISOString(),
      endTime: now.toISOString(),
    };

    // ── Cardio (ExerciseSession) ────────────────────────────────────
    try {
      const { records: sessions } = await mod.readRecords('ExerciseSession', { timeRangeFilter: timeRange });
      for (const s of (sessions as any[])) {
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);
        const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
        const cardioType = mapExerciseType(s.exerciseType);

        // Heart-rate aggregates over the session window
        let avgHr: number | undefined, maxHr: number | undefined, minHr: number | undefined;
        try {
          const { records: hrSeries } = await mod.readRecords('HeartRate', { timeRangeFilter: { operator: 'between', startTime: s.startTime, endTime: s.endTime } });
          const samples: number[] = (hrSeries as any[]).flatMap((r) =>
            (r.samples ?? []).map((p: any) => p.beatsPerMinute).filter((v: any) => typeof v === 'number'),
          );
          if (samples.length > 0) {
            avgHr = Math.round(samples.reduce((sum, v) => sum + v, 0) / samples.length);
            maxHr = Math.max(...samples);
            minHr = Math.min(...samples);
          }
        } catch { /* hr series optional */ }

        // Distance + calories: separate record types in HC, scoped to the session window
        let distanceKm: number | undefined, calories: number | undefined;
        try {
          const { records: dist } = await mod.readRecords('Distance', { timeRangeFilter: { operator: 'between', startTime: s.startTime, endTime: s.endTime } });
          const total = (dist as any[]).reduce((sum, r) => sum + (r.distance?.inMeters ?? 0), 0);
          if (total > 0) distanceKm = total / 1000;
        } catch { /* optional */ }
        try {
          const { records: cal } = await mod.readRecords('TotalCaloriesBurned', { timeRangeFilter: { operator: 'between', startTime: s.startTime, endTime: s.endTime } });
          const total = (cal as any[]).reduce((sum, r) => sum + (r.energy?.inKilocalories ?? 0), 0);
          if (total > 0) calories = Math.round(total);
        } catch { /* optional */ }

        const cardio: NormalizedCardio = {
          type: cardioType,
          date: toYmd(start),
          durationMinutes,
          distanceKm: distanceKm ?? null,
          caloriesBurned: calories ?? null,
          avgHeartRate: avgHr ?? null,
          maxHeartRate: maxHr ?? null,
          minHeartRate: minHr ?? null,
          hrZones: null,
          gpsTrack: null, // HC route data is a separate Route record type — punted to Phase D
          vo2Max: null,
          notes: s.title ?? s.notes ?? null,
          deviceSource: 'HEALTH_CONNECT',
          externalId: `HC-exercise-${s.metadata?.id ?? `${start.getTime()}-${end.getTime()}`}`,
        };
        payload.cardio.push(cardio);
      }
    } catch { /* exercise read failed — skip cardio */ }

    // ── Sleep (SleepSession) ────────────────────────────────────────
    try {
      const { records: sleeps } = await mod.readRecords('SleepSession', { timeRangeFilter: timeRange });
      for (const s of (sleeps as any[])) {
        const bed = new Date(s.startTime);
        const wake = new Date(s.endTime);
        const durationHours = Math.max(0, (wake.getTime() - bed.getTime()) / 3_600_000);
        // Stages: HC SleepSession.stages = Array<{ stage: number, startTime, endTime }>.
        // Stage IDs (per matinzd lib): 1=AWAKE, 2=SLEEPING, 3=OUT_OF_BED,
        // 4=LIGHT, 5=DEEP, 6=REM. We aggregate minutes per category.
        const stageMins = { rem: 0, deep: 0, light: 0, awake: 0 };
        for (const seg of (s.stages ?? [])) {
          const dur = (new Date(seg.endTime).getTime() - new Date(seg.startTime).getTime()) / 60_000;
          if (seg.stage === 6) stageMins.rem += dur;
          else if (seg.stage === 5) stageMins.deep += dur;
          else if (seg.stage === 4 || seg.stage === 2) stageMins.light += dur;
          else if (seg.stage === 1) stageMins.awake += dur;
        }
        const hasStages = stageMins.rem + stageMins.deep + stageMins.light + stageMins.awake > 0;

        // SpO₂ / HRV during the sleep window — averaged
        let spo2Avg: number | undefined, hrvAvg: number | undefined;
        try {
          const { records: spo2 } = await mod.readRecords('OxygenSaturation', { timeRangeFilter: { operator: 'between', startTime: s.startTime, endTime: s.endTime } });
          const vals = (spo2 as any[]).map((r) => r.percentage).filter((v) => typeof v === 'number');
          if (vals.length > 0) spo2Avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        } catch { /* optional */ }
        try {
          const { records: hrv } = await mod.readRecords('HeartRateVariabilityRmssd', { timeRangeFilter: { operator: 'between', startTime: s.startTime, endTime: s.endTime } });
          const vals = (hrv as any[]).map((r) => r.heartRateVariabilityMillis).filter((v) => typeof v === 'number');
          if (vals.length > 0) hrvAvg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        } catch { /* optional */ }

        const sleep: NormalizedSleep = {
          date: toYmd(wake),
          bedtime: toHm(bed),
          wakeTime: toHm(wake),
          durationHours: Math.round(durationHours * 10) / 10,
          quality: null,
          stages: hasStages ? {
            rem: Math.round(stageMins.rem),
            deep: Math.round(stageMins.deep),
            light: Math.round(stageMins.light),
            awake: Math.round(stageMins.awake),
          } : null,
          spo2Avg: spo2Avg ?? null,
          spo2Min: null,
          awakenings: null,
          hrvAvg: hrvAvg ?? null,
          deviceSource: 'HEALTH_CONNECT',
          externalId: `HC-sleep-${s.metadata?.id ?? `${bed.getTime()}-${wake.getTime()}`}`,
        };
        payload.sleep.push(sleep);
      }
    } catch { /* sleep read failed */ }

    // ── Raw samples (resting HR, HRV, SpO₂, VO₂max, steps) ──────────
    const sampleSpecs: Array<{ hcType: string; kind: NormalizedSample['kind']; unit: string; extract: (r: any) => number | undefined }> = [
      { hcType: 'RestingHeartRate', kind: 'restingHr', unit: 'bpm', extract: (r) => r.beatsPerMinute },
      { hcType: 'OxygenSaturation', kind: 'spo2', unit: '%', extract: (r) => r.percentage },
      { hcType: 'HeartRateVariabilityRmssd', kind: 'hrv', unit: 'ms', extract: (r) => r.heartRateVariabilityMillis },
      { hcType: 'Vo2Max', kind: 'vo2max', unit: 'ml/kg/min', extract: (r) => r.vo2MillilitersPerMinuteKilogram },
      { hcType: 'BodyTemperature', kind: 'bodyTemp', unit: '°C', extract: (r) => r.temperature?.inCelsius },
      { hcType: 'Steps', kind: 'steps', unit: 'count', extract: (r) => r.count },
    ];
    for (const spec of sampleSpecs) {
      try {
        const { records } = await mod.readRecords(spec.hcType as any, { timeRangeFilter: timeRange });
        for (const r of (records as any[])) {
          const value = spec.extract(r);
          if (typeof value !== 'number' || !Number.isFinite(value)) continue;
          const startAt = r.time ?? r.startTime;
          if (!startAt) continue;
          payload.samples.push({
            kind: spec.kind,
            value,
            unit: spec.unit,
            startAt: new Date(startAt).toISOString(),
            endAt: r.endTime ? new Date(r.endTime).toISOString() : null,
            source: 'HEALTH_CONNECT',
            externalId: `HC-${spec.hcType}-${r.metadata?.id ?? startAt}`,
          });
        }
      } catch { /* individual sample type failed — skip */ }
    }

    return payload;
  },
};
