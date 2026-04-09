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
});
