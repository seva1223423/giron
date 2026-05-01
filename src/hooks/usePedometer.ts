import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
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

async function fetchStepsForDay(date: Date): Promise<number> {
  try {
    const result = await Pedometer.getStepCountAsync(startOfDay(date), endOfDay(date));
    return result.steps;
  } catch {
    return 0;
  }
}

export function usePedometer(historyDays: number = 7, options?: PedometerOptions): PedometerData {
  const safeDays = Math.max(1, Math.min(90, Math.floor(historyDays)));
  const autoRequest = options?.autoRequest ?? false;
  const [todaySteps, setTodaySteps] = useState(0);
  const [historySteps, setHistorySteps] = useState<number[]>([]);
  const [historyDayLabels, setHistoryDayLabels] = useState<string[]>([]);
  const [hasHardware, setHasHardware] = useState(false);
  const [permission, setPermission] = useState<PedometerPermission>('unknown');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  // Guard the mount-time auto-request so re-renders triggered by state
  // updates don't fire a second prompt before the OS has finished the
  // first one. StrictMode double-invocation would otherwise cause two
  // back-to-back dialogs in development.
  const didAutoRequestRef = useRef(false);

  const loadSteps = useCallback(async () => {
    const now = new Date();

    // Today's steps via a single pinpoint call (00:00 → now). Cheaper
    // than fetchStepsForDay() because the upper bound stays in the
    // past — Android's CMSensorRecorder rejects future end times,
    // iOS HealthKit accepts them.
    const todayStart = startOfDay(now);
    const todayRes = await Pedometer.getStepCountAsync(todayStart, now);
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
    const labels = dates.map(({ date }) => DAY_SHORT[date.getDay()]);
    setHistorySteps(days);
    setHistoryDayLabels(labels);
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
        setHasHardware(available);
        if (!available) {
          setPermission('unavailable');
          setIsLoading(false);
          return;
        }
        const perm = await Pedometer.getPermissionsAsync();
        if (cancelled) return;
        setCanAskAgain(perm.canAskAgain);
        if (perm.status === 'granted') {
          setPermission('granted');
          // Steps load happens in the [permission, loadSteps] effect below.
        } else if (perm.status === 'denied') {
          setPermission('denied');
          setIsLoading(false);
        } else {
          // undetermined. Fire the prompt only when the consumer opted in
          // via `autoRequest` — ambient surfaces (home card) shouldn't
          // pop a dialog the user didn't ask for.
          if (autoRequest && !didAutoRequestRef.current) {
            didAutoRequestRef.current = true;
            const requested = await Pedometer.requestPermissionsAsync();
            if (cancelled) return;
            setCanAskAgain(requested.canAskAgain);
            if (requested.status === 'granted') {
              setPermission('granted');
            } else {
              setPermission('denied');
              setIsLoading(false);
            }
          } else {
            setPermission('denied');
            setIsLoading(false);
          }
        }
      } catch {
        if (!cancelled) {
          setHasHardware(false);
          setPermission('unavailable');
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
        const res = await Pedometer.getStepCountAsync(startOfDay(now), now);
        setTodaySteps(res.steps);
        // Patch today's slot in the historical array so consumers that
        // visualise the last bar don't get a stale read mid-day.
        setHistorySteps((prev) => {
          if (prev.length === 0) return prev;
          const next = prev.slice();
          next[next.length - 1] = res.steps;
          return next;
        });
      } catch { /* ignore */ }
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
  }, [permission]);

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
        setCanAskAgain(perm.canAskAgain);
        if (perm.status === 'granted') {
          setPermission('granted');
        } else if (perm.status === 'denied') {
          setPermission('denied');
        }
      } catch { /* ignore */ }
    });
    return () => sub.remove();
  }, [permission]);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const available = await Pedometer.isAvailableAsync();
      setHasHardware(available);
      if (!available) {
        setPermission('unavailable');
        return;
      }
      const perm = await Pedometer.getPermissionsAsync();
      setCanAskAgain(perm.canAskAgain);
      if (perm.status === 'granted') {
        setPermission('granted');
        await loadSteps();
      } else if (perm.status === 'denied') {
        setPermission('denied');
      } else {
        setPermission('unknown');
      }
    } catch {
      setHasHardware(false);
      setPermission('unavailable');
    } finally {
      setIsLoading(false);
    }
  }, [loadSteps]);

  const requestPermission = useCallback(async (): Promise<PedometerPermission> => {
    try {
      const available = await Pedometer.isAvailableAsync();
      setHasHardware(available);
      if (!available) {
        setPermission('unavailable');
        return 'unavailable';
      }
      const perm = await Pedometer.requestPermissionsAsync();
      setCanAskAgain(perm.canAskAgain);
      if (perm.status === 'granted') {
        setPermission('granted');
        return 'granted';
      }
      setPermission('denied');
      return 'denied';
    } catch {
      setHasHardware(false);
      setPermission('unavailable');
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
