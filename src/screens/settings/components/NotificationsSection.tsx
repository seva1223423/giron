import React, { useState } from 'react';
import { Text, View, TouchableOpacity, Switch, Modal, Alert, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { SettingRow } from './SettingRow';
import {
  requestNotificationPermissions,
  getNotificationPermissionStatus,
  scheduleDailyWorkoutReminder,
  cancelWorkoutReminders,
  scheduleWaterReminders,
  cancelWaterReminders,
} from '../../../services/notificationService';

export const NotificationsSection: React.FC = () => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const {
    notificationsEnabled, reminderHour, waterRemindersEnabled, waterReminderInterval,
    setNotificationsEnabled, setReminderHour, setWaterRemindersEnabled, setWaterReminderInterval,
  } = useSettingsStore();
  const [showTimePicker, setShowTimePicker] = useState(false);

  const handleToggleNotifications = async (value: boolean) => {
    haptic.selection();
    if (value) {
      const status = await getNotificationPermissionStatus();
      let granted = status === 'granted';
      if (!granted) granted = await requestNotificationPermissions();
      if (granted) {
        await scheduleDailyWorkoutReminder(reminderHour, 0);
        setNotificationsEnabled(true);
        Alert.alert('Уведомления включены', `Напоминание каждый день в ${reminderHour}:00.`);
      } else {
        Alert.alert('Нет доступа', 'Разреши уведомления в настройках устройства:\nНастройки → Iron Gym → Уведомления.');
      }
    } else {
      await cancelWorkoutReminders();
      setNotificationsEnabled(false);
    }
  };

  const handleChangeReminderTime = async (hour: number) => {
    haptic.selection();
    setReminderHour(hour);
    setShowTimePicker(false);
    if (notificationsEnabled) await scheduleDailyWorkoutReminder(hour, 0);
  };

  const handleToggleWaterReminders = async (value: boolean) => {
    haptic.selection();
    if (value) {
      const status = await getNotificationPermissionStatus();
      let granted = status === 'granted';
      if (!granted) granted = await requestNotificationPermissions();
      if (granted) {
        await scheduleWaterReminders(waterReminderInterval);
        setWaterRemindersEnabled(true);
        Alert.alert('Напоминания о воде включены', `Буду напоминать каждые ${waterReminderInterval} ч с 8:00 до 22:00.`);
      } else {
        Alert.alert('Нет доступа', 'Разреши уведомления в настройках устройства.');
      }
    } else {
      await cancelWaterReminders();
      setWaterRemindersEnabled(false);
    }
  };

  const handleWaterIntervalChange = async (hours: number) => {
    haptic.selection();
    setWaterReminderInterval(hours);
    if (waterRemindersEnabled) await scheduleWaterReminders(hours);
  };

  return (
    <FadeIn delay={180}>
      <Modal visible={showTimePicker} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Время напоминания</Text>
            {[6, 7, 8, 9, 10, 12, 14, 16, 17, 18, 19, 20, 21, 22].map((h) => (
              <TouchableOpacity key={h} onPress={() => handleChangeReminderTime(h)} style={[styles.pickerRow, { borderBottomColor: colors.divider }]}>
                <Text style={[typography.body, { color: h === reminderHour ? colors.primary : colors.text }]}>{h}:00</Text>
                {h === reminderHour && <Text style={{ color: colors.primary }}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowTimePicker(false)} style={{ marginTop: spacing.lg, alignItems: 'center' }}>
              <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>УВЕДОМЛЕНИЯ</Text>
        <SettingRow
          label="Напоминание о тренировке"
          sublabel={notificationsEnabled ? `Каждый день в ${reminderHour}:00` : 'Выключены'}
          right={<Switch value={notificationsEnabled} onValueChange={handleToggleNotifications} trackColor={{ false: colors.border, true: colors.primary + '60' }} thumbColor={notificationsEnabled ? colors.primary : '#f4f3f4'} />}
        />
        {notificationsEnabled && (
          <SettingRow
            label="Время напоминания"
            sublabel={`${reminderHour}:00`}
            onPress={() => setShowTimePicker(true)}
            divider
            right={<Text style={[typography.body, { color: colors.primary }]}>›</Text>}
          />
        )}
        <SettingRow
          label="Напоминания о воде"
          sublabel={waterRemindersEnabled ? `Каждые ${waterReminderInterval} ч (8:00–22:00)` : 'Выключены'}
          divider
          right={<Switch value={waterRemindersEnabled} onValueChange={handleToggleWaterReminders} trackColor={{ false: colors.border, true: colors.info + '60' }} thumbColor={waterRemindersEnabled ? colors.info : '#f4f3f4'} />}
        />
        {waterRemindersEnabled && (
          <SettingRow
            label="Интервал напоминаний"
            sublabel={`Каждые ${waterReminderInterval} часа`}
            divider
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[1, 2, 3].map((h) => (
                  <TouchableOpacity
                    key={h}
                    onPress={() => handleWaterIntervalChange(h)}
                    style={[styles.intervalBtn, { backgroundColor: waterReminderInterval === h ? colors.info : colors.surface, borderColor: waterReminderInterval === h ? colors.info : colors.border }]}
                  >
                    <Text style={[typography.caption, { color: waterReminderInterval === h ? '#fff' : colors.text, fontWeight: '700' }]}>{h}ч</Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
          />
        )}
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 48 },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1 },
  intervalBtn: { width: 36, height: 32, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
