/**
 * HealthKit adapter — iOS implementation of HealthDataProvider.
 * Round-240 Phase C.
 *
 * HealthKit is the OS-level health-data store on iOS. Apple Watch
 * syncs into it natively; many 3rd-party trackers (Polar Beat, Whoop,
 * Strava, Garmin Connect for iOS) also write into HealthKit on a
 * delay. We READ from HealthKit and never write (the user owns their
 * data — write-back is Phase E if ever).
 *
 * Library: `@kingstinct/react-native-healthkit` v14.x. Active and
 * Expo-plugin-supported. Same lazy-import pattern as the HC adapter
 * so jest + Android bundle don't choke on the native module.
 *
 * The adapter does NOT cover every HKQuantityType — only the ones
 * the AI cares about. Bodyweight / measurements live in separate
 * stores and have their own (manual) entry flows.
 */
import { Platform } from 'react-native';
import { addBreadcrumb } from '../../utils/errorReporter';
import type {
  HealthDataProvider, HealthScope, NormalizedHealthPayload,
  NormalizedCardio, NormalizedSleep, NormalizedSample, CardioType,
} from './types';

// R240 audit M8/M9: drop a Sentry breadcrumb when a per-record-type
// HK query fails. Sentry stays opt-in (SENTRY_DSN not set = no-op).
function bc(block: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  addBreadcrumb(`hk.${block}`, { error: msg.slice(0, 200) }, 'warning');
}

// Map app scopes → HealthKit quantity / category type identifiers.
// HKQuantityTypeIdentifier* / HKCategoryTypeIdentifier* values.
const SCOPE_TO_HK: Record<HealthScope, string> = {
  hr: 'HKQuantityTypeIdentifierHeartRate',
  restingHr: 'HKQuantityTypeIdentifierRestingHeartRate',
  hrv: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  spo2: 'HKQuantityTypeIdentifierOxygenSaturation',
  steps: 'HKQuantityTypeIdentifierStepCount',
  distance: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  calories: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
  exercise: 'HKWorkoutTypeIdentifier',
  vo2max: 'HKQuantityTypeIdentifierVO2Max',
  bodyTemp: 'HKQuantityTypeIdentifierBodyTemperature',
};

// HKWorkoutActivityType numeric IDs → our CardioType enum.
// Reference: developer.apple.com/documentation/healthkit/hkworkoutactivitytype
const HK_WORKOUT_TYPE_MAP: Record<number, CardioType> = {
  37: 'running',       // .running
  13: 'cycling',       // .cycling
  46: 'swimming',      // .swimming
  52: 'walking',       // .walking
  21: 'hiit',          // .highIntensityIntervalTraining
  18: 'elliptical',    // .elliptical
  35: 'rowing',        // .rowing
};

// HKCategoryValueSleepAnalysis IDs.
// 0=inBed, 1=asleepUnspecified, 2=awake, 3=asleepCore (light), 4=asleepDeep, 5=asleepREM
const HK_SLEEP_STAGE_MAP: Record<number, 'light' | 'deep' | 'rem' | 'awake' | 'inBed'> = {
  0: 'inBed',
  1: 'light',
  2: 'awake',
  3: 'light',
  4: 'deep',
  5: 'rem',
};

type HKModule = typeof import('@kingstinct/react-native-healthkit');

let cachedModule: HKModule | null = null;
async function loadModule(): Promise<HKModule | null> {
  if (Platform.OS !== 'ios') return null;
  if (cachedModule) return cachedModule;
  try {
    cachedModule = (await import('@kingstinct/react-native-healthkit')) as HKModule;
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

function mapWorkoutType(typeId: number | undefined): CardioType {
  if (typeId == null) return 'other';
  return HK_WORKOUT_TYPE_MAP[typeId] ?? 'other';
}

export const healthKitAdapter: HealthDataProvider = {
  kind: 'healthkit',

  async isAvailable() {
    if (Platform.OS !== 'ios') return false;
    const mod = await loadModule();
    if (!mod) return false;
    try {
      const fn = (mod as any).isHealthDataAvailable ?? (mod as any).default?.isHealthDataAvailable;
      if (typeof fn !== 'function') return false;
      return await fn();
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
      const readTypes = scopes.map((s) => SCOPE_TO_HK[s]);
      const requestFn =
        (mod as any).requestAuthorization ??
        (mod as any).default?.requestAuthorization;
      if (typeof requestFn !== 'function') {
        for (const s of scopes) result[s] = false;
        return result;
      }
      await requestFn(readTypes, []);
      // HealthKit deliberately doesn't tell you which read scopes were
      // granted (privacy: don't leak whether the user denied a specific
      // type). We probe per-type by attempting a tiny sample query.
      for (const s of scopes) {
        try {
          const probe =
            (mod as any).queryStatisticsForQuantity ??
            (mod as any).default?.queryStatisticsForQuantity;
          result[s] = typeof probe === 'function';
        } catch {
          result[s] = false;
        }
      }
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
      for (const s of Object.keys(SCOPE_TO_HK) as HealthScope[]) result[s] = false;
      return result;
    }
    // Same privacy caveat as above — HK doesn't expose granted scopes
    // directly. We optimistically return true for every type when the
    // SDK is available and the app has *any* authorization, then let
    // queries fail-silent if the user denied a specific type.
    for (const s of Object.keys(SCOPE_TO_HK) as HealthScope[]) result[s] = true;
    return result;
  },

  async pullSince(since) {
    const payload: NormalizedHealthPayload = { cardio: [], sleep: [], samples: [] };
    const mod = await loadModule();
    if (!mod) return payload;
    const now = new Date();

    // ── Workouts → cardio ───────────────────────────────────────────
    try {
      const queryWorkouts =
        (mod as any).queryWorkouts ?? (mod as any).default?.queryWorkouts;
      if (typeof queryWorkouts === 'function') {
        const workouts: any[] = await queryWorkouts({ from: since, to: now }) ?? [];
        for (const w of workouts) {
          const start = new Date(w.startDate ?? w.start ?? Date.now());
          const end = new Date(w.endDate ?? w.end ?? Date.now());
          const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
          const cardio: NormalizedCardio = {
            type: mapWorkoutType(w.workoutActivityType ?? w.activityType),
            date: toYmd(start),
            durationMinutes,
            distanceKm: typeof w.totalDistance === 'number' ? w.totalDistance / 1000 : null,
            caloriesBurned: typeof w.totalEnergyBurned === 'number' ? Math.round(w.totalEnergyBurned) : null,
            avgHeartRate: typeof w.averageHeartRate === 'number' ? Math.round(w.averageHeartRate) : null,
            maxHeartRate: typeof w.maxHeartRate === 'number' ? Math.round(w.maxHeartRate) : null,
            minHeartRate: typeof w.minHeartRate === 'number' ? Math.round(w.minHeartRate) : null,
            hrZones: null,
            gpsTrack: null, // HKWorkoutRoute is a separate query — deferred
            vo2Max: null,
            notes: w.metadata?.HKWorkoutBrandName ?? null,
            deviceSource: 'HEALTHKIT',
            externalId: `HK-workout-${w.uuid ?? w.id ?? `${start.getTime()}-${end.getTime()}`}`,
          };
          payload.cardio.push(cardio);
        }
      }
    } catch (e) { bc('workouts-read', e); }

    // ── Sleep ────────────────────────────────────────────────────────
    // HKCategoryTypeIdentifierSleepAnalysis returns segments with stage
    // values. We group consecutive segments by their "session"
    // (gap ≤ 30 min) and emit one NormalizedSleep per session.
    try {
      const queryCategory =
        (mod as any).queryCategorySamples ?? (mod as any).default?.queryCategorySamples;
      if (typeof queryCategory === 'function') {
        const segments: any[] = await queryCategory(
          'HKCategoryTypeIdentifierSleepAnalysis',
          { from: since, to: now },
        ) ?? [];
        // Sort by start ascending
        segments.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        let currentSession: any[] = [];
        const sessions: any[][] = [];
        for (const seg of segments) {
          if (currentSession.length === 0) {
            currentSession.push(seg);
            continue;
          }
          const prevEnd = new Date(currentSession[currentSession.length - 1].endDate).getTime();
          const segStart = new Date(seg.startDate).getTime();
          if (segStart - prevEnd > 30 * 60_000) {
            sessions.push(currentSession);
            currentSession = [seg];
          } else {
            currentSession.push(seg);
          }
        }
        if (currentSession.length > 0) sessions.push(currentSession);

        for (const session of sessions) {
          const bed = new Date(session[0].startDate);
          const wake = new Date(session[session.length - 1].endDate);
          const stageMins = { rem: 0, deep: 0, light: 0, awake: 0 };
          for (const seg of session) {
            const dur = (new Date(seg.endDate).getTime() - new Date(seg.startDate).getTime()) / 60_000;
            const stage = HK_SLEEP_STAGE_MAP[seg.value ?? seg.categoryValue];
            if (stage === 'rem') stageMins.rem += dur;
            else if (stage === 'deep') stageMins.deep += dur;
            else if (stage === 'light') stageMins.light += dur;
            else if (stage === 'awake') stageMins.awake += dur;
          }
          const asleep = stageMins.rem + stageMins.deep + stageMins.light;
          const durationHours = asleep > 0
            ? asleep / 60
            : Math.max(0, (wake.getTime() - bed.getTime()) / 3_600_000);
          if (durationHours <= 0) continue;
          const hasStages = stageMins.rem + stageMins.deep + stageMins.light + stageMins.awake > 0;
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
            spo2Avg: null,
            spo2Min: null,
            awakenings: null,
            hrvAvg: null,
            deviceSource: 'HEALTHKIT',
            externalId: `HK-sleep-${bed.getTime()}-${wake.getTime()}`,
          };
          payload.sleep.push(sleep);
        }
      }
    } catch (e) { bc('sleep-read', e); }

    // ── Raw quantity samples ────────────────────────────────────────
    const sampleSpecs: Array<{ hkType: string; kind: NormalizedSample['kind']; unit: string }> = [
      { hkType: 'HKQuantityTypeIdentifierRestingHeartRate', kind: 'restingHr', unit: 'bpm' },
      { hkType: 'HKQuantityTypeIdentifierOxygenSaturation', kind: 'spo2', unit: '%' },
      { hkType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', kind: 'hrv', unit: 'ms' },
      { hkType: 'HKQuantityTypeIdentifierVO2Max', kind: 'vo2max', unit: 'ml/kg/min' },
      { hkType: 'HKQuantityTypeIdentifierBodyTemperature', kind: 'bodyTemp', unit: '°C' },
      { hkType: 'HKQuantityTypeIdentifierStepCount', kind: 'steps', unit: 'count' },
    ];
    for (const spec of sampleSpecs) {
      try {
        const queryQty =
          (mod as any).queryQuantitySamples ?? (mod as any).default?.queryQuantitySamples;
        if (typeof queryQty !== 'function') continue;
        const samples: any[] = await queryQty(spec.hkType, { from: since, to: now }) ?? [];
        for (const r of samples) {
          // R240 audit M11: `@kingstinct/react-native-healthkit` v13→v14
          // changed the sample shape — newer versions return a plain
          // number for `quantity`, older builds (or iOS 16 path) return
          // `{ doubleValue, unit }`. We defensively check both, plus
          // `value` as a third fallback, before treating the sample as
          // missing.
          let value: number = NaN;
          if (typeof r.quantity === 'number') value = r.quantity;
          else if (typeof r?.quantity?.doubleValue === 'number') value = r.quantity.doubleValue;
          else if (typeof r.value === 'number') value = r.value;
          if (!Number.isFinite(value)) continue;
          const startAt = r.startDate ?? r.start;
          if (!startAt) continue;
          // SpO2 from HK is fractional (0..1); we normalize to percent
          const finalValue = spec.kind === 'spo2' && value <= 1 ? value * 100 : value;
          payload.samples.push({
            kind: spec.kind,
            value: finalValue,
            unit: spec.unit,
            startAt: new Date(startAt).toISOString(),
            endAt: r.endDate ? new Date(r.endDate).toISOString() : null,
            source: 'HEALTHKIT',
            externalId: `HK-${spec.hkType}-${r.uuid ?? startAt}`,
          });
        }
      } catch (e) { bc(`sample-${spec.kind}`, e); }
    }

    return payload;
  },
};
