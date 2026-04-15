import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsStore {
  units: 'metric' | 'imperial';
  restTimerDefault: number; // seconds
  hapticFeedback: boolean;
  notificationsEnabled: boolean;
  reminderHour: number;
  waterRemindersEnabled: boolean;
  waterReminderInterval: number; // hours between reminders
  workoutDurationGoal: number; // minutes, 0 = no goal

  setUnits: (units: 'metric' | 'imperial') => void;
  setRestTimerDefault: (seconds: number) => void;
  setHapticFeedback: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setReminderHour: (hour: number) => void;
  setWaterRemindersEnabled: (enabled: boolean) => void;
  setWaterReminderInterval: (hours: number) => void;
  setWorkoutDurationGoal: (minutes: number) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      units: 'metric',
      restTimerDefault: 90,
      hapticFeedback: true,
      notificationsEnabled: false,
      reminderHour: 18,
      waterRemindersEnabled: false,
      waterReminderInterval: 2,
      workoutDurationGoal: 0,

      setUnits: (units) => set({ units }),
      setRestTimerDefault: (restTimerDefault) => set({ restTimerDefault }),
      setHapticFeedback: (hapticFeedback) => set({ hapticFeedback }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setReminderHour: (reminderHour) => set({ reminderHour }),
      setWaterRemindersEnabled: (waterRemindersEnabled) => set({ waterRemindersEnabled }),
      setWaterReminderInterval: (waterReminderInterval) => set({ waterReminderInterval }),
      setWorkoutDurationGoal: (workoutDurationGoal) => set({ workoutDurationGoal }),
    }),
    {
      name: 'iron-gym-settings',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (state: any) => state,
    }
  )
);
