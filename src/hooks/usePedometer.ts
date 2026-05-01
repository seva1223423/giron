import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';

/**
 * Live + historical pedometer data with explicit permission flow.
 *
 * Round 88: expanded from 7-day window to a configurable lookback so the
 * Steps screen can show 30-day stats without forking the hook. The API
 * stays backward-compatible — `weekSteps` / `weekDayLabels` still hold
 * the LAST 7 days of `historySteps` / `historyDayLabels`, so the existing
 * Home StepsCard keeps working unchanged.
 *
 * Round 185: split hardware availability from permission state. The old
 * single `isAvailable` flag conflated "device has the sensor" with
 * "user has granted access" — the StepsScreen could only show a static
 * "недоступен" message and tell the user to fix it themselves. Now:
 *
 *  - `hasHardware` — does the device expose a step sensor at all?
 *  - `permission` — granted / denied / unknown / unavailable
 *  - `canAskAgain` — false on Android once the user picks "Don't ask
 *    again"; on iOS, false after the first denial. When false, the OS
 *    prompt is a no-op and the app must direct the user to system
 *    settings (the consumer should call `Linking.openSettings()`).
 *  - `requestPermission()` — explicitly trigger the OS prompt.
 *  - `autoRequest` option — when true, the hook fires the OS prompt on
 *    mount IF the status is undetermined. Use on screens where the user
 *    explicitly opted into pedometer features (StepsScreen). Leave at the
 *    default `false` for ambient surfaces like the home StepsCard, where
 *    a surprise prompt would be hostile.
 *
 * Live updates: a 60s interval refreshes `todaySteps` only (cheaper than
 * re-querying the whole window). The interval only runs while permission
 * is granted, so no wasted polls in the denied state. AppState change to
 * 'active' triggers a permission re-check — covers the flow where the
 * user opens system settings, toggles the permission, and returns; the
 * screen updates without needing a manual pull-to-refresh.
 *
 * `isAvailable` is preserved as a backward-compatible alias: it's true
 * iff hardware exists AND permission is granted, which matches the
 * historical "ready to display steps" semantics the home card depends on.
 */
export type PedometerPermission = 'unknown' | 'granted' | 'denied' | 'unavailable';

export interface PedometerOptions {
  /**
   * When true, fire the OS permission prompt on mount if the current
   * status is `undetermined`. Defaults to `false` so ambient consumers
   * (home card) don't surprise users with an unsolicited dialog. The
   * dedicated StepsScreen passes `true`.
   */
  autoRequest?: boolean;
}

export interface PedometerData {
  todaySteps: number;
  /** Last N days of step counts (oldest first), N = `historyDays` arg. */
  historySteps: number[];
  /** ru-RU day-of-week short labels aligned with historySteps. */
  historyDayLabels: string[];
  /** Backward-compatible alias — last 7 entries of historySteps. */
  weekSteps: number[];
  /** Backward-compatible alias — last 7 entries of historyDayLabels. */
  weekDayLabels: string[];
  /** Backward-compatible alias — true iff hardware exists AND permission granted. */
  isAvailable: boolean;
  /** Hardware-only availability — does the device expose a step sensor? */
  hasHardware: boolean;
  /** Current permission state. `unavailable` means no hardware. */
  permission: PedometerPermission;
  /**
   * Android: false after the user picks "Don't ask again". iOS: false
   * after the first denial. When false, the OS prompt is a no-op and the
   * app must redirect the user to system settings.
   */
  canAskAgain: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  /**
   * Trigger the OS permission prompt. Resolves with the post-prompt
   * permission so the caller can branch UI without waiting on a render.
   * On `canAskAgain === false`, this resolves to the cached state without
   * prompting — the caller should switch to `Linking.openSettings()`.
   */
  requestPermission: () => Promise<PedometerPermission>;
}

const DAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

/**
 * iOS HealthKit retains pedometer history for 7 days only; CMPedometer
 * returns 0 for any range whose start is older than that. Skipping the
 * native trip up front saves 22 zero-yield calls on a 30-day refresh
 * and 82 on a 90-day refresh, with no observable change to the UI
 * (those slots already came back as 0). Android has no documented
 * universal limit — Health Connect can return data for years and the
 * legacy fallback is device-specific — so we don't clamp there.
 */
const IOS_PEDOMETER_HISTORY_DAYS = 7;

async function fetchStepsForDay(date: Date): Promise<number> {
  if (Platform.OS === 'ios') {
    const ageDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (ageDays >= IOS_PEDOMETER_HISTORY_DAYS) return 0;
  }
  try {
    const result = await Pedometer.getStepCountAsync(startOfDay(date), endOfDay(date));
    return result.steps;
  } catch {
    return 0;
  }
}

/**
 * Cross-instance permission broadcast. The hook is mounted independently
 * by StepsCard (home), StepsSection (progress), and StepsScreen — each
 * with its own React state. Without a broadcast bus, granting permission
 * via the StepsScreen prompt left the home StepsCard hook frozen at
 * 'denied' (the value it probed when it first mounted), so the card
 * stayed hidden until the next AppState background→active transition
 * happened to fire the per-instance permission re-check listener.
 *
 * This bus carries permission/canAskAgain/hasHardware updates only —
 * step data stays per-instance because different consumers can request
 * different history windows. Whenever any hook learns the permission
 * state has changed (autoRequest, refresh, requestPermission, AppState
 * re-check), it calls `publishPermission`; every mounted hook then
 * syncs its local state from the snapshot.
 */
type PermissionSnapshot = {
  permission: PedometerPermission;
  canAskAgain: boolean;
  hasHardware: boolean;
};

let permissionSnapshot: PermissionSnapshot = {
  permission: 'unknown',
  canAskAgain: true,
  hasHardware: false,
};

const permissionSubscribers = new Set<(s: PermissionSnapshot) => void>();

function publishPermission(update: Partial<PermissionSnapshot>) {
  const next = { ...permissionSnapshot, ...update };
  if (
    next.permission === permissionSnapshot.permission &&
    next.canAskAgain === permissionSnapshot.canAskAgain &&
    next.hasHardware === permissionSnapshot.hasHardware
  ) {
    return;
  }
  permissionSnapshot = next;
  permissionSubscribers.forEach((cb) => cb(next));
}

export function usePedometer(historyDays: number = 7, options?: PedometerOptions): PedometerData {
  const safeDays = Math.max(1, Math.min(90, Math.floor(historyDays)));
  const autoRequest = options?.autoRequest ?? false;
  const [todaySteps, setTodaySteps] = useState(0);
  const [historySteps, setHistorySteps] = useState<number[]>([]);
  const [historyDayLabels, setHistoryDayLabels] = useState<string[]>([]);
  // Permission/hardware state mirrors the module-level snapshot so newly
  // mounted instances start from the latest known truth instead of
  // re-probing from scratch. Subscribed below for cross-instance
  // updates.
  const [hasHardware, setHasHardware] = useState(permissionSnapshot.hasHardware);
  const [permission, setPermission] = useState<PedometerPermission>(permissionSnapshot.permission);
  const [canAskAgain, setCanAskAgain] = useState(permissionSnapshot.canAskAgain);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to cross-instance permission changes. Whenever any mounted
  // hook publishes (autoRequest, refresh, requestPermission, AppState
  // re-check), every other instance syncs here — fixes the home
  // StepsCard staying frozen at 'denied' after the user grants via
  // StepsScreen without backgrounding the app in between.
  useEffect(() => {
    const listener = (s: PermissionSnapshot) => {
      setPermission(s.permission);
      setCanAskAgain(s.canAskAgain);
      setHasHardware(s.hasHardware);
    };
    permissionSubscribers.add(listener);
    // Sync once from the current snapshot — covers the rare case where
    // another instance published between this hook's first render
    // (where useState seeded from the snapshot) and this subscribe
    // effect committing. setState bails out via Object.is when nothing
    // actually changed, so the redundant call is free.
    listener(permissionSnapshot);
    return () => { permissionSubscribers.delete(listener); };
  }, []);
  // Guard the mount-time auto-request so re-renders triggered by state
  // updates don't fire a second prompt before the OS has finished the
  // first one. StrictMode double-invocation would otherwise cause two
  // back-to-back dialogs in development.
  const didAutoRequestRef = useRef(false);
  // Monotonic counter — every loadSteps call captures its own version
  // and discards results once a newer call has started. Without this,
  // a slow first load (e.g. 30-day) finishing AFTER a fast second load
  // (e.g. 7-day) would overwrite the newer data with stale numbers.
  // Triggered in practice by the period-toggle plan and by pull-to-
  // refresh issued mid-load.
  const loadVersionRef = useRef(0);
  // Local-date string of when historySteps was last built. Drives
  // midnight-rollover detection in the polling interval below: if the
  // calendar day has changed since the last full build, patching the
  // last array slot would incorrectly overwrite *yesterday's* finalized
  // count with today's tiny just-after-midnight number. Reload instead.
  const lastBuildDayRef = useRef<string>('');

  const loadSteps = useCallback(async () => {
    const myVersion = ++loadVersionRef.current;
    const now = new Date();

    // Today's steps via a single pinpoint call (00:00 → now). Cheaper
    // than fetchStepsForDay() because the upper bound stays in the
    // past — Android's CMSensorRecorder rejects future end times,
    // iOS HealthKit accepts them.
    const todayStart = startOfDay(now);
    const todayRes = await Pedometer.getStepCountAsync(todayStart, now);
    if (loadVersionRef.current !== myVersion) return;
    setTodaySteps(todayRes.steps);

    // Backfill the historical window in parallel. The previous version
    // awaited each day sequentially, so a 90-day load took 90× the
    // per-call latency (≈3-4s on mid-range Android). With Promise.all
    // the native bridge fires all queries concurrently and the wall
    // time collapses to ~one per-call latency. Today's slot reuses
    // todayRes so we don't pay for two calls covering the same window.
    const dates: { date: Date; isToday: boolean }[] = [];
    for (let i = safeDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates.push({ date: d, isToday: i === 0 });
    }
    const days = await Promise.all(
      dates.map(({ date, isToday }) =>
        isToday ? Promise.resolve(todayRes.steps) : fetchStepsForDay(date),
      ),
    );
    if (loadVersionRef.current !== myVersion) return;
    const labels = dates.map(({ date }) => DAY_SHORT[date.getDay()]);
    setHistorySteps(days);
    setHistoryDayLabels(labels);
    // en-CA locale gives the canonical YYYY-MM-DD shape we need for
    // cheap day-equality checks; we don't rely on the locale for any
    // user-visible string.
    lastBuildDayRef.current = now.toLocaleDateString('en-CA');
  }, [safeDays]);

  // Initial mount: probe hardware + permission, optionally fire prompt.
  // Runs once per hook instance — re-prompting on safeDays change would
  // be hostile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const available = await Pedometer.isAvailableAsync();
        if (cancelled) return;
        if (!available) {
          publishPermission({ hasHardware: false, permission: 'unavailable' });
          setIsLoading(false);
          return;
        }
        const perm = await Pedometer.getPermissionsAsync();
        if (cancelled) return;
        if (perm.status === 'granted') {
          publishPermission({ hasHardware: true, permission: 'granted', canAskAgain: perm.canAskAgain });
          // Steps load happens in the [permission, loadSteps] effect below.
        } else if (perm.status === 'denied') {
          publishPermission({ hasHardware: true, permission: 'denied', canAskAgain: perm.canAskAgain });
          setIsLoading(false);
        } else {
          // undetermined. Fire the prompt only when the consumer opted in
          // via `autoRequest` — ambient surfaces (home card) shouldn't
          // pop a dialog the user didn't ask for.
          if (autoRequest && !didAutoRequestRef.current) {
            didAutoRequestRef.current = true;
            const requested = await Pedometer.requestPermissionsAsync();
            if (cancelled) return;
            if (requested.status === 'granted') {
              publishPermission({ hasHardware: true, permission: 'granted', canAskAgain: requested.canAskAgain });
            } else {
              publishPermission({ hasHardware: true, permission: 'denied', canAskAgain: requested.canAskAgain });
              setIsLoading(false);
            }
          } else {
            publishPermission({ hasHardware: true, permission: 'denied', canAskAgain: perm.canAskAgain });
            setIsLoading(false);
          }
        }
      } catch {
        if (!cancelled) {
          publishPermission({ hasHardware: false, permission: 'unavailable' });
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
    // autoRequest is read once per hook lifetime; consumers don't toggle
    // it after mount, so it's intentionally excluded from the dep list
    // alongside loadSteps (which has its own effect for re-loading).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load steps when permission becomes granted, and re-load when the
  // lookback window changes (safeDays drives loadSteps' identity).
  useEffect(() => {
    if (permission !== 'granted') return;
    let cancelled = false;
    (async () => {
      try {
        await loadSteps();
      } catch { /* loadSteps already handles per-day errors */ }
      finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [permission, loadSteps]);

  // Live refresh of today's count every minute — only while permission
  // is granted AND the app is in the foreground. We deliberately don't
  // re-query the historical window here: those days don't change, and
  // re-fetching N days every minute would be wasteful on Android.
  //
  // Round 186: pause polling when AppState != 'active'. setInterval
  // keeps firing on backgrounded RN apps (the JS thread isn't suspended
  // until OS-level freeze) — that was burning ~1 native call/min for
  // every user with the app open in the recents tray. On foreground we
  // also fire one immediate read to close the gap from however long the
  // app sat in the background.
  useEffect(() => {
    if (permission !== 'granted') return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const fetchNow = async () => {
      try {
        const now = new Date();
        const todayKey = now.toLocaleDateString('en-CA');
        // Day rolled over while the app was open. Patching the last
        // array slot would silently overwrite yesterday's finalized
        // count with today's tiny post-midnight number; fully reload
        // instead so the window shifts and a fresh today-slot appears.
        if (lastBuildDayRef.current && todayKey !== lastBuildDayRef.current) {
          await loadSteps();
          return;
        }
        const res = await Pedometer.getStepCountAsync(startOfDay(now), now);
        // Bail out when the count hasn't moved — the array setter's
        // `prev.slice()` would otherwise allocate a new reference every
        // minute and wake every consumer's render path for nothing.
        setTodaySteps((prev) => (prev === res.steps ? prev : res.steps));
        setHistorySteps((prev) => {
          if (prev.length === 0) return prev;
          if (prev[prev.length - 1] === res.steps) return prev;
          const next = prev.slice();
          next[next.length - 1] = res.steps;
          return next;
        });
      } catch {
        // getStepCountAsync rejected. The most common cause while the
        // hook is in the granted branch is that the user revoked the
        // permission externally (system settings) while the app was
        // backgrounded — without a re-probe, polling would keep
        // failing silently every minute and the UI would stay stuck on
        // stale step counts. Probe once; if access really is gone, the
        // resulting publish flips every consumer to the denied state
        // (which tears this interval down). On a transient OS hiccup
        // the probe still says 'granted' and we just no-op until the
        // next tick.
        try {
          const perm = await Pedometer.getPermissionsAsync();
          if (perm.status !== 'granted') {
            publishPermission({
              permission: perm.status === 'denied' ? 'denied' : 'unknown',
              canAskAgain: perm.canAskAgain,
            });
          }
        } catch { /* ignore — next tick will retry */ }
      }
    };

    const start = () => {
      if (interval !== null) return;
      interval = setInterval(fetchNow, 60_000);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    if (AppState.currentState === 'active') start();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Catch up on however many minutes the app spent in the
        // background, then resume the regular cadence.
        fetchNow();
        start();
      } else {
        stop();
      }
    });

    return () => {
      stop();
      sub.remove();
    };
    // loadSteps identity changes with safeDays; the polling closure must
    // see the current version so the midnight-rollover branch reloads
    // for the right window.
  }, [permission, loadSteps]);

  // Re-check permission when the app returns to foreground. Covers the
  // flow where the user taps "Open settings", toggles the permission,
  // and returns — without this, the screen would stay on the denied
  // state until manual pull-to-refresh.
  useEffect(() => {
    if (permission === 'granted' || permission === 'unavailable') return;
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      try {
        const perm = await Pedometer.getPermissionsAsync();
        if (perm.status === 'granted') {
          publishPermission({ permission: 'granted', canAskAgain: perm.canAskAgain });
        } else if (perm.status === 'denied') {
          publishPermission({ permission: 'denied', canAskAgain: perm.canAskAgain });
        }
      } catch { /* ignore */ }
    });
    return () => sub.remove();
  }, [permission]);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const available = await Pedometer.isAvailableAsync();
      if (!available) {
        publishPermission({ hasHardware: false, permission: 'unavailable' });
        return;
      }
      const perm = await Pedometer.getPermissionsAsync();
      if (perm.status === 'granted') {
        publishPermission({ hasHardware: true, permission: 'granted', canAskAgain: perm.canAskAgain });
        await loadSteps();
      } else if (perm.status === 'denied') {
        publishPermission({ hasHardware: true, permission: 'denied', canAskAgain: perm.canAskAgain });
      } else {
        publishPermission({ hasHardware: true, permission: 'unknown', canAskAgain: perm.canAskAgain });
      }
    } catch {
      publishPermission({ hasHardware: false, permission: 'unavailable' });
    } finally {
      setIsLoading(false);
    }
  }, [loadSteps]);

  const requestPermission = useCallback(async (): Promise<PedometerPermission> => {
    try {
      const available = await Pedometer.isAvailableAsync();
      if (!available) {
        publishPermission({ hasHardware: false, permission: 'unavailable' });
        return 'unavailable';
      }
      const perm = await Pedometer.requestPermissionsAsync();
      if (perm.status === 'granted') {
        publishPermission({ hasHardware: true, permission: 'granted', canAskAgain: perm.canAskAgain });
        return 'granted';
      }
      publishPermission({ hasHardware: true, permission: 'denied', canAskAgain: perm.canAskAgain });
      return 'denied';
    } catch {
      publishPermission({ hasHardware: false, permission: 'unavailable' });
      return 'unavailable';
    }
  }, []);

  // Backward-compatible week views — the 7 most recent entries.
  const weekSteps = historySteps.slice(-7);
  const weekDayLabels = historyDayLabels.slice(-7);

  return {
    todaySteps,
    historySteps,
    historyDayLabels,
    weekSteps,
    weekDayLabels,
    isAvailable: permission === 'granted',
    hasHardware,
    permission,
    canAskAgain,
    isLoading,
    refresh,
    requestPermission,
  };
}
