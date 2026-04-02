import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../../store';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  requestNotificationPermissions,
  getNotificationPermissionStatus,
  scheduleDailyWorkoutReminder,
  cancelWorkoutReminders,
} from '../../services/notificationService';

const REST_TIMER_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300];

export const SettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, isDark, toggleTheme } = useThemeStore();
  const {
    units,
    restTimerDefault,
    hapticFeedback,
    notificationsEnabled,
    reminderHour,
    setUnits,
    setRestTimerDefault,
    setHapticFeedback,
    setNotificationsEnabled,
    setReminderHour,
  } = useSettingsStore();

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showRestPicker, setShowRestPicker] = useState(false);

  const handleToggleNotifications = async (value: boolean) => {
    if (hapticFeedback) Haptics.selectionAsync();
    if (value) {
      const status = await getNotificationPermissionStatus();
      let granted = status === 'granted';
      if (!granted) {
        granted = await requestNotificationPermissions();
      }
      if (granted) {
        await scheduleDailyWorkoutReminder(reminderHour, 0);
        setNotificationsEnabled(true);
        Alert.alert('Уведомления включены', `Напоминание каждый день в ${reminderHour}:00.`);
      } else {
        Alert.alert(
          'Нет доступа',
          'Разреши уведомления в настройках устройства:\nНастройки → Iron Gym → Уведомления.'
        );
      }
    } else {
      await cancelWorkoutReminders();
      setNotificationsEnabled(false);
    }
  };

  const handleChangeReminderTime = async (hour: number) => {
    if (hapticFeedback) Haptics.selectionAsync();
    setReminderHour(hour);
    setShowTimePicker(false);
    if (notificationsEnabled) {
      await scheduleDailyWorkoutReminder(hour, 0);
    }
  };

  const handleToggleHaptic = (value: boolean) => {
    if (value) Haptics.selectionAsync();
    setHapticFeedback(value);
  };

  const formatRestTimer = (sec: number) => {
    if (sec < 60) return `${sec} сек`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m} мин ${s} сек` : `${m} мин`;
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Time picker modal */}
      <Modal visible={showTimePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
              Время напоминания
            </Text>
            {[6, 7, 8, 9, 10, 12, 14, 16, 17, 18, 19, 20, 21, 22].map((h) => (
              <TouchableOpacity
                key={h}
                onPress={() => handleChangeReminderTime(h)}
                style={[
                  styles.pickerRow,
                  { borderBottomColor: colors.divider },
                ]}
              >
                <Text
                  style={[
                    typography.body,
                    { color: h === reminderHour ? colors.primary : colors.text },
                  ]}
                >
                  {h}:00
                </Text>
                {h === reminderHour && (
                  <Text style={{ color: colors.primary }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setShowTimePicker(false)}
              style={{ marginTop: spacing.lg, alignItems: 'center' }}
            >
              <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>
                Отмена
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rest timer picker modal */}
      <Modal visible={showRestPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
              Таймер отдыха по умолчанию
            </Text>
            {REST_TIMER_OPTIONS.map((sec) => (
              <TouchableOpacity
                key={sec}
                onPress={() => {
                  if (hapticFeedback) Haptics.selectionAsync();
                  setRestTimerDefault(sec);
                  setShowRestPicker(false);
                }}
                style={[styles.pickerRow, { borderBottomColor: colors.divider }]}
              >
                <Text
                  style={[
                    typography.body,
                    { color: sec === restTimerDefault ? colors.primary : colors.text },
                  ]}
                >
                  {formatRestTimer(sec)}
                </Text>
                {sec === restTimerDefault && (
                  <Text style={{ color: colors.primary }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setShowRestPicker(false)}
              style={{ marginTop: spacing.lg, alignItems: 'center' }}
            >
              <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>
                Отмена
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.h2, { color: colors.text }]}>Настройки</Text>
        </View>
      </View>

      {/* Appearance */}
      <FadeIn delay={0}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            ВНЕШНИЙ ВИД
          </Text>

          <SettingRow
            label="Тёмная тема"
            colors={colors}
            right={
              <Switch
                value={isDark}
                onValueChange={() => {
                  if (hapticFeedback) Haptics.selectionAsync();
                  toggleTheme();
                }}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={isDark ? colors.primary : '#f4f3f4'}
              />
            }
          />
        </Card>
      </FadeIn>

      {/* Units & measurements */}
      <FadeIn delay={60}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            ЕДИНИЦЫ ИЗМЕРЕНИЯ
          </Text>

          <View style={styles.segmentRow}>
            <TouchableOpacity
              onPress={() => {
                if (hapticFeedback) Haptics.selectionAsync();
                setUnits('metric');
              }}
              style={[
                styles.segment,
                {
                  backgroundColor: units === 'metric' ? colors.primary : colors.surface,
                  borderColor: units === 'metric' ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  typography.captionMedium,
                  { color: units === 'metric' ? '#FFF' : colors.text },
                ]}
              >
                кг / см
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (hapticFeedback) Haptics.selectionAsync();
                setUnits('imperial');
              }}
              style={[
                styles.segment,
                {
                  backgroundColor: units === 'imperial' ? colors.primary : colors.surface,
                  borderColor: units === 'imperial' ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  typography.captionMedium,
                  { color: units === 'imperial' ? '#FFF' : colors.text },
                ]}
              >
                lbs / дюймы
              </Text>
            </TouchableOpacity>
          </View>
        </Card>
      </FadeIn>

      {/* Workout settings */}
      <FadeIn delay={120}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            ТРЕНИРОВКИ
          </Text>

          <SettingRow
            label="Таймер отдыха"
            sublabel={formatRestTimer(restTimerDefault)}
            colors={colors}
            onPress={() => setShowRestPicker(true)}
            right={
              <Text style={[typography.body, { color: colors.primary }]}>›</Text>
            }
          />
        </Card>
      </FadeIn>

      {/* Notifications */}
      <FadeIn delay={180}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            УВЕДОМЛЕНИЯ
          </Text>

          <SettingRow
            label="Напоминание о тренировке"
            sublabel={
              notificationsEnabled
                ? `Каждый день в ${reminderHour}:00`
                : 'Выключены'
            }
            colors={colors}
            right={
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={notificationsEnabled ? colors.primary : '#f4f3f4'}
              />
            }
          />

          {notificationsEnabled && (
            <SettingRow
              label="Время напоминания"
              sublabel={`${reminderHour}:00`}
              colors={colors}
              onPress={() => setShowTimePicker(true)}
              divider
              right={
                <Text style={[typography.body, { color: colors.primary }]}>›</Text>
              }
            />
          )}
        </Card>
      </FadeIn>

      {/* System */}
      <FadeIn delay={240}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            СИСТЕМА
          </Text>

          <SettingRow
            label="Тактильный отклик"
            colors={colors}
            right={
              <Switch
                value={hapticFeedback}
                onValueChange={handleToggleHaptic}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={hapticFeedback ? colors.primary : '#f4f3f4'}
              />
            }
          />

          <SettingRow
            label="Язык"
            sublabel="Русский"
            colors={colors}
            divider
            right={
              <Text style={[typography.body, { color: colors.textSecondary }]}>
                Русский
              </Text>
            }
          />
        </Card>
      </FadeIn>

      {/* App info */}
      <FadeIn delay={300}>
        <View style={styles.appInfo}>
          <Text style={[typography.caption, { color: colors.textTertiary }]}>
            Iron Gym
          </Text>
          <Text style={[typography.caption, { color: colors.textTertiary }]}>
            Версия 1.0.0
          </Text>
        </View>
      </FadeIn>
    </ScrollView>
  );
};

interface SettingRowProps {
  label: string;
  sublabel?: string;
  colors: any;
  right: React.ReactNode;
  onPress?: () => void;
  divider?: boolean;
}

const SettingRow: React.FC<SettingRowProps> = ({
  label,
  sublabel,
  colors,
  right,
  onPress,
  divider,
}) => {
  const Container: any = onPress ? TouchableOpacity : View;
  return (
    <Container
      onPress={onPress}
      style={[
        styles.settingRow,
        divider && { borderTopWidth: 1, borderTopColor: colors.divider },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, { color: colors.text }]}>{label}</Text>
        {sublabel ? (
          <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {right}
    </Container>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.captionMedium,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: 48,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  appInfo: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.xl,
  },
});
