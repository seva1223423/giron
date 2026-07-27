import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsStore {
  /** NOT WIRED UP. Nothing converts weights or lengths anywhere in the app, so
   *  this only ever stored a value. The settings toggle that exposed it was
   *  removed in audit R38 — do not surface it again without implementing real
   *  conversion on entry, history, records and measurements. */
  units: 'metric' | 'imperial';
  restTimerDefault: number; // seconds
  hapticFeedback: boolean;
  notificationsEnabled: boolean;
  reminderHour: number;
  waterRemindersEnabled: boolean;
  waterReminderInterval: number; // hours between reminders
  workoutDurationGoal: number; // minutes, 0 = no goal
  /** Daily step goal — drives the StepsScreen ring + StepsCard progress bar.
   *  Default 10000 (WHO baseline); user-adjustable via the settings sheet
   *  on StepsScreen. Stored here (not in the workouts store) because it's
   *  a global preference, independent of training plan. */
  stepsDailyGoal: number;
  /** Stride length in centimetres — used to estimate distance from steps.
   *  Default 75cm (population average for adults). When the user has a
   *  measured heightCm in their profile, distance estimators can fall
   *  back to 0.413 × heightCm as a finer approximation. */
  strideLengthCm: number;

  setUnits: (units: 'metric' | 'imperial') => void;
  setRestTimerDefault: (seconds: number) => void;
  setHapticFeedback: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setReminderHour: (hour: number) => void;
  setWaterRemindersEnabled: (enabled: boolean) => void;
  setWaterReminderInterval: (hours: number) => void;
  setWorkoutDurationGoal: (minutes: number) => void;
  setStepsDailyGoal: (steps: number) => void;
  setStrideLengthCm: (cm: number) => void;
  resetToDefaults: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      units: 'metric',
      restTimerDefault: 90,
      hapticFeedback: true,
      // Default ON. The OS permission is the real gate — nothing fires until
      // the user grants it — so defaulting this off meant that after granting
      // permission they still silently got no reminders at all (audit R17
      // follow-up). The switch now controls reminders; the OS controls consent.
      notificationsEnabled: true,
      reminderHour: 18,
      waterRemindersEnabled: false,
      waterReminderInterval: 2,
      workoutDurationGoal: 0,
      stepsDailyGoal: 10_000,
      strideLengthCm: 75,

      setUnits: (units) => set({ units }),
      setRestTimerDefault: (restTimerDefault) => set({ restTimerDefault }),
      setHapticFeedback: (hapticFeedback) => set({ hapticFeedback }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setReminderHour: (reminderHour) => set({ reminderHour }),
      setWaterRemindersEnabled: (waterRemindersEnabled) => set({ waterRemindersEnabled }),
      setWaterReminderInterval: (waterReminderInterval) => set({ waterReminderInterval }),
      setWorkoutDurationGoal: (workoutDurationGoal) => set({ workoutDurationGoal }),
      setStepsDailyGoal: (stepsDailyGoal) => {
        // Clamp to a reasonable band — ML researchers cap "active" target at
        // 30k for athletes, anything below 1k makes the ring meaningless.
        const clamped = Math.max(1000, Math.min(30_000, Math.round(stepsDailyGoal)));
        set({ stepsDailyGoal: clamped });
      },
      setStrideLengthCm: (strideLengthCm) => {
        const clamped = Math.max(40, Math.min(120, Math.round(strideLengthCm)));
        set({ strideLengthCm: clamped });
      },
      resetToDefaults: () => set({
        units: 'metric',
        restTimerDefault: 90,
        hapticFeedback: true,
        notificationsEnabled: true, // see the default above
        reminderHour: 18,
        waterRemindersEnabled: false,
        waterReminderInterval: 2,
        workoutDurationGoal: 0,
        stepsDailyGoal: 10_000,
        strideLengthCm: 75,
      }),
    }),
    {
      name: 'giron-settings',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (state: any) => state,
    }
  )
);
