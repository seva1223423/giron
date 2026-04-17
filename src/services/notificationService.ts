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
  STREAK_RISK: 'streak-risk',
  WATER_PREFIX: 'water-reminder-',
  WEEKLY_SUMMARY: 'weekly-summary',
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

/**
 * Get the Expo push token for this device and register it with the server.
 * Should be called after authentication and permissions are granted.
 */
export async function registerPushTokenWithServer(): Promise<void> {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    if (!token) return;

    const { api } = await import('./api');
    await api.post('/user/push-token', { token });
  } catch { /* non-critical — ignore */ }
}

export async function getNotificationPermissionStatus(): Promise<string> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

// Schedule a daily workout reminder at the given hour/minute (local time)
// Fires every day at that time
export async function scheduleDailyWorkoutReminder(hour: number, minute: number): Promise<void> {
  try {
    // Cancel existing reminder first
    await cancelWorkoutReminders();

    const messages = [
      { title: 'Время тренироваться!', body: 'Открой Iron Gym и сделай тренировку — ты уже почти там.' },
      { title: 'Сегодня день тренировки', body: 'Маленький шаг каждый день = большой результат через год.' },
      { title: 'Iron Coach ждёт', body: 'Не пропускай — дисциплина строит тело, мотивация только запускает.' },
      { title: 'Пора в зал', body: 'Твоё будущее тело скажет спасибо. Открой приложение!' },
      { title: 'День тренировки', body: 'Тренировки сегодня нет в планах? Iron Coach поможет составить.' },
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
        ...(Platform.OS === 'android' && { channelId: 'reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch { /* permissions not granted or device unsupported */ }
}

// Schedule a one-time notification right away (e.g., for testing or instant reminders)
export async function sendImmediateNotification(title: string, body: string): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default', ...(Platform.OS === 'android' && { channelId: 'reminders' }) },
      trigger: null, // fires immediately
    });
  } catch { /* permissions not granted or device unsupported */ }
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
        title: 'Отдых закончился!',
        body: 'Время следующего подхода.',
        sound: 'default',
        data: { url: 'irongym://workout/active' },
        ...(Platform.OS === 'android' && { channelId: 'reminders' }),
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

// Schedule "streak at risk" notification 48h after last workout.
// Call after finishing a workout — this replaces any previous streak-risk notification.
export async function scheduleStreakRiskNotification(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_IDS.STREAK_RISK).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_IDS.STREAK_RISK,
      content: {
        title: 'Серия под угрозой!',
        body: 'Ты не тренировался 2 дня. Не дай серии прерваться — открой Iron Gym!',
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'reminders' }),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 48 * 3600 },
    });
  } catch {
    // Silently fail if notifications unavailable
  }
}

export async function cancelStreakRiskNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_IDS.STREAK_RISK).catch(() => {});
}

// Schedule water intake reminders every `intervalHours` hours between startHour and endHour
// Fires as daily repeating at fixed times (e.g., every 2h from 8:00 to 22:00)
export async function scheduleWaterReminders(
  intervalHours: number,
  startHour: number = 8,
  endHour: number = 22,
): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    // Cancel existing water reminders first
    await cancelWaterReminders();

    const messages = [
      { title: 'Время выпить воды', body: 'Не забудь про водный баланс — это важно для восстановления.' },
      { title: '💦 Выпей стакан воды', body: 'Правильная гидратация ускоряет рост мышц и сжигание жира.' },
      { title: '🫗 Пора освежиться', body: 'Тело на 70% состоит из воды. Поддерживай баланс!' },
      { title: 'Вода — ключ к силе', body: 'Даже 2% обезвоживания снижают силовые показатели на 10%.' },
    ];

    let msgIdx = 0;
    for (let hour = startHour; hour <= endHour; hour += intervalHours) {
      const msg = messages[msgIdx % messages.length];
      const id = `${NOTIFICATION_IDS.WATER_PREFIX}${hour}`;
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: msg.title,
          body: msg.body,
          sound: 'default',
          ...(Platform.OS === 'android' && { channelId: 'reminders' }),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: Math.floor(hour),
          minute: 0,
        },
      });
      msgIdx++;
    }
  } catch {
    // Silently fail
  }
}

// Schedule a daily nutrition summary notification at 21:00
// Shows how calories/protein tracking went that day
export async function scheduleNutritionSummaryReminder(
  caloriesPercent: number, // 0-1+, how close to target
  proteinPercent: number,
): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.cancelScheduledNotificationAsync('nutrition-summary').catch(() => {});

    let title: string;
    let body: string;

    if (caloriesPercent >= 0.85 && caloriesPercent <= 1.1 && proteinPercent >= 0.9) {
      title = '✅ Отличный день по питанию!';
      body = 'Ты попал в цель по калориям и белку. Так держать!';
    } else if (proteinPercent < 0.7) {
      title = 'Не добрал белок сегодня';
      body = `Белка ${Math.round(proteinPercent * 100)}% от нормы. Съешь творог, яйца или выпей протеин.`;
    } else if (caloriesPercent > 1.15) {
      title = 'Вышел за калории сегодня';
      body = 'Немного превысил норму. Это не страшно — просто учти завтра.';
    } else if (caloriesPercent < 0.7) {
      title = '📉 Мало поел сегодня';
      body = 'Слишком большой дефицит замедляет восстановление. Не забудь поужинать!';
    } else {
      title = 'Итог питания за день';
      body = `Калории: ${Math.round(caloriesPercent * 100)}% · Белок: ${Math.round(proteinPercent * 100)}% от нормы.`;
    }

    // Schedule for 21:00 today
    await Notifications.scheduleNotificationAsync({
      identifier: 'nutrition-summary',
      content: { title, body, sound: 'default', ...(Platform.OS === 'android' && { channelId: 'reminders' }) },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 21,
        minute: 0,
      },
    });
  } catch {
    // Silently fail
  }
}

export async function scheduleWeeklySummaryNotification(
  workoutsThisWeek: number,
  totalVolumeKg: number,
  bestWorkoutName?: string,
): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_IDS.WEEKLY_SUMMARY).catch(() => {});

    if (workoutsThisWeek <= 0) return;

    let title: string;
    let body: string;

    if (workoutsThisWeek <= 2) {
      title = 'Итоги недели';
      body = `Ты потренировался ${workoutsThisWeek} ${workoutsThisWeek === 1 ? 'раз' : 'раза'} — хорошее начало! Объём: ${totalVolumeKg} кг. На следующей неделе попробуй добавить ещё одну тренировку.`;
    } else if (workoutsThisWeek <= 4) {
      title = 'Отличная неделя!';
      body = `${workoutsThisWeek} тренировок, объём ${totalVolumeKg} кг${bestWorkoutName ? `, лучшая: ${bestWorkoutName}` : ''}. Ты в топ-форме — продолжай!`;
    } else {
      title = 'Легенда!';
      body = `${workoutsThisWeek} тренировок за неделю! Объём ${totalVolumeKg} кг. Феноменальная работа!`;
    }

    // Schedule for the coming Sunday at 20:00 (same day if it's Sunday before 20:00, else next Sunday)
    const now = new Date();
    const daysUntilSunday = (7 - now.getDay()) % 7;
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(20, 0, 0, 0);
    // If the target time is already past, advance to next Sunday
    if (nextSunday <= now) {
      nextSunday.setDate(nextSunday.getDate() + 7);
    }
    const secondsUntilSunday = Math.round((nextSunday.getTime() - now.getTime()) / 1000);

    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_IDS.WEEKLY_SUMMARY,
      content: { title, body, sound: 'default', ...(Platform.OS === 'android' && { channelId: 'reminders' }) },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntilSunday,
      },
    });
  } catch {
    // Silently fail
  }
}

// Schedule a protein reminder if protein intake is below 50% of target after 16:00.
// Call this whenever a meal is logged. Cancels itself if target is met.
export async function scheduleProteinReminder(
  proteinGrams: number,
  proteinTargetGrams: number,
): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.cancelScheduledNotificationAsync('protein-reminder').catch(() => {});

    if (proteinTargetGrams <= 0) return;
    const pct = proteinGrams / proteinTargetGrams;
    if (pct >= 0.5) return; // target already on track, nothing to remind

    const now = new Date();
    if (now.getHours() < 16) return; // too early — daily summary at 21:00 is enough

    const remaining = Math.round(proteinTargetGrams - proteinGrams);
    await Notifications.scheduleNotificationAsync({
      identifier: 'protein-reminder',
      content: {
        title: 'Не хватает белка',
        body: `Только ${Math.round(pct * 100)}% нормы. Осталось добрать ${remaining} г — творог, яйца или протеин.`,
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'reminders' }),
      },
      trigger: null, // fire immediately
    });
  } catch {
    // Silently fail
  }
}

export async function cancelWaterReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier.startsWith(NOTIFICATION_IDS.WATER_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
      }
    }
  } catch {
    // Silently fail
  }
}

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Show a persistent "widget-like" notification with today's workout plan
// Call on app open to update the notification with current plan
export async function showTodayPlanNotification(
  planName: string | null,
  exerciseCount: number,
  streak: number,
): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.dismissNotificationAsync('today-plan').catch(() => {});

    if (!planName) {
      // Rest day
      await Notifications.scheduleNotificationAsync({
        identifier: 'today-plan',
        content: {
          title: `Сегодня: день отдыха${streak > 0 ? ` | ${streak} дней подряд` : ''}`,
          body: 'Мышцы растут во время отдыха. Отдохни и вернись завтра сильнее!',
          sound: undefined,
          sticky: true,
          priority: Notifications.AndroidNotificationPriority.LOW,
          ...(Platform.OS === 'android' && { channelId: 'reminders' }),
        },
        trigger: null,
      });
    } else {
      await Notifications.scheduleNotificationAsync({
        identifier: 'today-plan',
        content: {
          title: `Сегодня: ${planName}${streak > 0 ? ` | ${streak} дн.` : ''}`,
          body: exerciseCount > 0 ? `${exerciseCount} упражнений. Открой Iron Gym чтобы начать!` : 'Тренировка запланирована. Готов?',
          sound: undefined,
          sticky: true,
          priority: Notifications.AndroidNotificationPriority.LOW,
          ...(Platform.OS === 'android' && { channelId: 'reminders' }),
        },
        trigger: null,
      });
    }
  } catch {
    // Silently fail
  }
}

export async function dismissTodayPlanNotification(): Promise<void> {
  await Notifications.dismissNotificationAsync('today-plan').catch(() => {});
}

// Schedule an inactivity reminder based on how many days since last workout.
// Call this when the app opens. Fires tomorrow morning at 9:00 if user hasn't trained.
export async function scheduleInactivityReminder(daysSinceLastWorkout: number): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.cancelScheduledNotificationAsync('inactivity-reminder').catch(() => {});

    // Only schedule if user has been inactive for 2+ days
    if (daysSinceLastWorkout < 2) return;

    let title: string;
    let body: string;

    if (daysSinceLastWorkout >= 7) {
      title = 'Неделя без тренировок';
      body = 'Мышцы начинают терять силу после 7 дней отдыха. Вернись в зал — даже короткая тренировка считается!';
    } else if (daysSinceLastWorkout >= 4) {
      title = 'Ты не тренировался 4+ дня';
      body = 'Серия прервалась. Начни заново сегодня — одна тренировка сбросит счётчик.';
    } else {
      title = 'Пора в зал!';
      body = `Ты не тренировался ${daysSinceLastWorkout} дня. Открой Iron Gym и запусти тренировку.`;
    }

    await Notifications.scheduleNotificationAsync({
      identifier: 'inactivity-reminder',
      content: { title, body, sound: 'default', ...(Platform.OS === 'android' && { channelId: 'reminders' }) },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 0,
      },
    });
  } catch {
    // Silently fail
  }
}
