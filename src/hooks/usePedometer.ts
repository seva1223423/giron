import { useState, useEffect, useCallback } from 'react';
import { Pedometer } from 'expo-sensors';

export interface PedometerData {
  todaySteps: number;
  weekSteps: number[];       // steps per day for the last 7 days (index 0 = oldest)
  weekDayLabels: string[];   // 'Пн', 'Вт', ... for the last 7 days
  isAvailable: boolean;
  isLoading: boolean;
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

export function usePedometer(): PedometerData {
  const [todaySteps, setTodaySteps] = useState(0);
  const [weekSteps, setWeekSteps] = useState<number[]>([]);
  const [weekDayLabels, setWeekDayLabels] = useState<string[]>([]);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const available = await Pedometer.isAvailableAsync();
      setIsAvailable(available);
      if (!available) { setIsLoading(false); return; }

      const now = new Date();

      // Today's steps via live subscription for real-time
      const todayStart = startOfDay(now);
      const todayRes = await Pedometer.getStepCountAsync(todayStart, now);
      setTodaySteps(todayRes.steps);

      // Last 7 days
      const days: number[] = [];
      const labels: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const steps = await fetchStepsForDay(d);
        days.push(steps);
        labels.push(DAY_SHORT[d.getDay()]);
      }
      setWeekSteps(days);
      setWeekDayLabels(labels);
    } catch {
      setIsAvailable(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    // Live update today's steps every minute
    const interval = setInterval(async () => {
      try {
        const available = await Pedometer.isAvailableAsync();
        if (!available) return;
        const now = new Date();
        const res = await Pedometer.getStepCountAsync(startOfDay(now), now);
        setTodaySteps(res.steps);
      } catch {}
    }, 60_000);

    return () => clearInterval(interval);
  }, [load]);

  return { todaySteps, weekSteps, weekDayLabels, isAvailable, isLoading };
}
