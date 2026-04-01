import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications appear when the app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const NOTIFICATION_IDS = {
  WORKOUT_REMINDER: 'workout-reminder',
  DAILY_REMINDER: 'daily-reminder',
  REST_TIMER: 'rest-timer',
};

// Request notification permissions. Returns true if granted.
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Напоминания о тренировках',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getNotificationPermissionStatus(): Promise<string> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

// Schedule a daily workout reminder at the given hour/minute (local time)
// Fires every day at that time
export async function scheduleDailyWorkoutReminder(hour: number, minute: number): Promise<void> {
  // Cancel existing reminder first
  await cancelWorkoutReminders();

  const messages = [
    { title: '💪 Время тренироваться!', body: 'Открой Iron Gym и сделай тренировку — ты уже почти там.' },
    { title: '🏋️ Сегодня день тренировки', body: 'Маленький шаг каждый день = большой результат через год.' },
    { title: '🔥 Iron Coach ждёт', body: 'Не пропускай — дисциплина строит тело, мотивация только запускает.' },
    { title: '⚡ Пора в зал', body: 'Твоё будущее тело скажет спасибо. Открой приложение!' },
    { title: '🎯 День тренировки', body: 'Тренировки сегодня нет в планах? Iron Coach поможет составить.' },
  ];

  // Rotate through messages by day of week
  const today = new Date().getDay(); // 0-6
  const msg = messages[today % messages.length];

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_IDS.WORKOUT_REMINDER,
    content: {
      title: msg.title,
      body: msg.body,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

// Schedule a one-time notification right away (e.g., for testing or instant reminders)
export async function sendImmediateNotification(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: 'default' },
    trigger: null, // fires immediately
  });
}

// Schedule a rest timer end notification (fires after `seconds` seconds)
// Returns the notification identifier so it can be cancelled if the user skips rest.
export async function scheduleRestEndNotification(seconds: number): Promise<string | null> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    return await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_IDS.REST_TIMER,
      content: {
        title: '💪 Отдых закончился!',
        body: 'Время следующего подхода.',
        sound: 'default',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
    });
  } catch {
    return null;
  }
}

export async function cancelRestEndNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_IDS.REST_TIMER).catch(() => {});
}

// Cancel all workout reminders
export async function cancelWorkoutReminders(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_IDS.WORKOUT_REMINDER).catch(() => {});
}

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
