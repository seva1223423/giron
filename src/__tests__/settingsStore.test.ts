/**
 * Tests for useSettingsStore — app settings defaults and setters
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { useSettingsStore } from '../store/useSettingsStore';

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      units: 'metric',
      restTimerDefault: 90,
      hapticFeedback: true,
      notificationsEnabled: false,
      reminderHour: 18,
      waterRemindersEnabled: false,
      waterReminderInterval: 2,
      workoutDurationGoal: 0,
    });
  });

  test('default rest timer is 90 seconds', () => {
    expect(useSettingsStore.getState().restTimerDefault).toBe(90);
  });

  test('setRestTimerDefault updates value', () => {
    useSettingsStore.getState().setRestTimerDefault(120);
    expect(useSettingsStore.getState().restTimerDefault).toBe(120);
  });

  test('default units are metric', () => {
    expect(useSettingsStore.getState().units).toBe('metric');
  });

  test('setUnits switches to imperial', () => {
    useSettingsStore.getState().setUnits('imperial');
    expect(useSettingsStore.getState().units).toBe('imperial');
  });

  test('workout duration goal defaults to 0', () => {
    expect(useSettingsStore.getState().workoutDurationGoal).toBe(0);
  });

  test('setWorkoutDurationGoal updates', () => {
    useSettingsStore.getState().setWorkoutDurationGoal(60);
    expect(useSettingsStore.getState().workoutDurationGoal).toBe(60);
  });

  test('haptic feedback defaults to true', () => {
    expect(useSettingsStore.getState().hapticFeedback).toBe(true);
  });

  test('setHapticFeedback disables haptics', () => {
    useSettingsStore.getState().setHapticFeedback(false);
    expect(useSettingsStore.getState().hapticFeedback).toBe(false);
  });

  test('notifications default to disabled', () => {
    expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
  });

  test('setNotificationsEnabled enables notifications', () => {
    useSettingsStore.getState().setNotificationsEnabled(true);
    expect(useSettingsStore.getState().notificationsEnabled).toBe(true);
  });

  test('water reminder interval defaults to 2 hours', () => {
    expect(useSettingsStore.getState().waterReminderInterval).toBe(2);
  });

  test('setWaterReminderInterval updates', () => {
    useSettingsStore.getState().setWaterReminderInterval(3);
    expect(useSettingsStore.getState().waterReminderInterval).toBe(3);
  });

  test('water reminders default to disabled', () => {
    expect(useSettingsStore.getState().waterRemindersEnabled).toBe(false);
  });

  test('setWaterRemindersEnabled enables water reminders', () => {
    useSettingsStore.getState().setWaterRemindersEnabled(true);
    expect(useSettingsStore.getState().waterRemindersEnabled).toBe(true);
  });

  test('reminder hour defaults to 18 (6 PM)', () => {
    expect(useSettingsStore.getState().reminderHour).toBe(18);
  });

  test('setReminderHour updates the hour', () => {
    useSettingsStore.getState().setReminderHour(8);
    expect(useSettingsStore.getState().reminderHour).toBe(8);
  });

  test('resetToDefaults restores all settings to defaults', () => {
    // Change everything
    useSettingsStore.getState().setUnits('imperial');
    useSettingsStore.getState().setRestTimerDefault(180);
    useSettingsStore.getState().setHapticFeedback(false);
    useSettingsStore.getState().setNotificationsEnabled(true);
    useSettingsStore.getState().setReminderHour(7);
    useSettingsStore.getState().setWaterRemindersEnabled(true);
    useSettingsStore.getState().setWaterReminderInterval(4);
    useSettingsStore.getState().setWorkoutDurationGoal(90);

    // Reset
    useSettingsStore.getState().resetToDefaults();

    const state = useSettingsStore.getState();
    expect(state.units).toBe('metric');
    expect(state.restTimerDefault).toBe(90);
    expect(state.hapticFeedback).toBe(true);
    // Reminders default ON: the OS permission is the real gate, so defaulting
    // this off left users with no reminders even after granting permission.
    expect(state.notificationsEnabled).toBe(true);
    expect(state.reminderHour).toBe(18);
    expect(state.waterRemindersEnabled).toBe(false);
    expect(state.waterReminderInterval).toBe(2);
    expect(state.workoutDurationGoal).toBe(0);
  });
});
