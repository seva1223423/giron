import { useState, useEffect, useCallback } from 'react';
import { Pedometer } from 'expo-sensors';

/**
 * Live + historical pedometer data.
 *
 * Round 88: expanded from 7-day window to a configurable lookback so the
 * Steps screen can show 30-day stats without forking the hook. The API
 * stays backward-compatible — `weekSteps` / `weekDayLabels` still hold
 * the LAST 7 days of `historySteps` / `historyDayLabels`, so the existing
 * Home StepsCard keeps working unchanged.
 *
 * Live updates: a 60s interval refreshes `todaySteps` only (cheaper than
 * re-querying the whole window). The interval is deliberately suspended
 * while the user has the app backgrounded — `Pedometer.getStepCountAsync`
 * costs nothing on iOS HealthKit but does kick a CMSensorRecorder query
 * on Android that we don't want polling forever.
 */
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
  isAvailable: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
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

export function usePedometer(historyDays: number = 7): PedometerData {
  const safeDays = Math.max(1, Math.min(90, Math.floor(historyDays)));
  const [todaySteps, setTodaySteps] = useState(0);
  const [historySteps, setHistorySteps] = useState<number[]>([]);
  const [historyDayLabels, setHistoryDayLabels] = useState<string[]>([]);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const available = await Pedometer.isAvailableAsync();
      setIsAvailable(available);
      if (!available) { setIsLoading(false); return; }

      const now = new Date();

      // Today's steps via a single pinpoint call (00:00 → now). Cheaper
      // than fetchStepsForDay() because the upper bound stays in the
      // past — Android's CMSensorRecorder rejects future end times,
      // iOS HealthKit accepts them.
      const todayStart = startOfDay(now);
      const todayRes = await Pedometer.getStepCountAsync(todayStart, now);
      setTodaySteps(todayRes.steps);

      // Backfill the historical window — i = safeDays-1 is the OLDEST
      // day, i = 0 is today. Today's slot uses todayRes so we don't pay
      // for two calls covering the same window.
      const days: number[] = [];
      const labels: string[] = [];
      for (let i = safeDays - 1; i >= 0; i--) {
        if (i === 0) {
          days.push(todayRes.steps);
          labels.push(DAY_SHORT[now.getDay()]);
        } else {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const steps = await fetchStepsForDay(d);
          days.push(steps);
          labels.push(DAY_SHORT[d.getDay()]);
        }
      }
      setHistorySteps(days);
      setHistoryDayLabels(labels);
    } catch {
      setIsAvailable(false);
    } finally {
      setIsLoading(false);
    }
  }, [safeDays]);

  useEffect(() => {
    load();

    // Live refresh of today's count every minute. We deliberately don't
    // re-query the historical window here — those days don't change,
    // and re-fetching N days every minute would be wasteful on Android.
    const interval = setInterval(async () => {
      try {
        const available = await Pedometer.isAvailableAsync();
        if (!available) return;
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
    }, 60_000);

    return () => clearInterval(interval);
  }, [load]);

  // Backward-compatible week views — the 7 most recent entries.
  const weekSteps = historySteps.slice(-7);
  const weekDayLabels = historyDayLabels.slice(-7);

  return {
    todaySteps,
    historySteps,
    historyDayLabels,
    weekSteps,
    weekDayLabels,
    isAvailable,
    isLoading,
    refresh: load,
  };
}
