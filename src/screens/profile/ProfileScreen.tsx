import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Switch } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useAuthStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'Похудение',
  muscle_gain: 'Набор массы',
  strength: 'Сила',
  endurance: 'Выносливость',
  flexibility: 'Гибкость',
  general_fitness: 'Общая форма',
};

const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Новичок',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
  expert: 'Эксперт',
};

export const ProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, isDark, toggleTheme, mode } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { workoutHistory } = useWorkoutStore();

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={{ color: '#FFF', fontSize: 32, fontWeight: '800' }}>
            {(user?.firstName?.[0] || 'A').toUpperCase()}
          </Text>
        </View>
        <Text style={[typography.h2, { color: colors.text, marginTop: spacing.lg }]}>
          {user?.firstName} {user?.lastName}
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary }]}>
          {user?.email}
        </Text>
      </View>

      {/* Stats summary */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[typography.numberSmall, { color: colors.primary }]}>{workoutHistory.length}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренировок</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[typography.numberSmall, { color: colors.primary }]}>{user?.weightKg || '—'}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>кг</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[typography.numberSmall, { color: colors.primary }]}>
            {user?.fitnessLevel ? LEVEL_LABELS[user.fitnessLevel] : '—'}
          </Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Уровень</Text>
        </View>
      </View>

      {/* Personal info */}
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
          Личные данные
        </Text>
        <ProfileRow label="Рост" value={user?.heightCm ? `${user.heightCm} см` : 'Не указан'} colors={colors} />
        <ProfileRow label="Вес" value={user?.weightKg ? `${user.weightKg} кг` : 'Не указан'} colors={colors} />
        <ProfileRow label="Пол" value={user?.gender === 'male' ? 'Мужской' : user?.gender === 'female' ? 'Женский' : 'Не указан'} colors={colors} />
        <ProfileRow label="Цель" value={user?.goal ? GOAL_LABELS[user.goal] : 'Не указана'} colors={colors} />
        <ProfileRow label="Уровень" value={user?.fitnessLevel ? LEVEL_LABELS[user.fitnessLevel] : 'Не указан'} colors={colors} />
        <ProfileRow label="Стаж" value={user?.trainingExperienceYears ? `${user.trainingExperienceYears} лет` : 'Не указан'} colors={colors} isLast />
      </Card>

      {/* Settings */}
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
          Настройки
        </Text>

        <View style={styles.settingRow}>
          <Text style={[typography.body, { color: colors.text }]}>Тёмная тема</Text>
          <Switch
            value={isDark}
            onValueChange={() => { Haptics.selectionAsync(); toggleTheme(); }}
            trackColor={{ false: colors.border, true: colors.primary + '60' }}
            thumbColor={isDark ? colors.primary : '#f4f3f4'}
          />
        </View>

        <TouchableOpacity style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: colors.divider }]}>
          <Text style={[typography.body, { color: colors.text }]}>Язык</Text>
          <Text style={[typography.body, { color: colors.textSecondary }]}>Русский</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: colors.divider }]}>
          <Text style={[typography.body, { color: colors.text }]}>Единицы измерения</Text>
          <Text style={[typography.body, { color: colors.textSecondary }]}>кг / см</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: colors.divider }]}>
          <Text style={[typography.body, { color: colors.text }]}>Уведомления</Text>
          <Text style={[typography.body, { color: colors.textSecondary }]}>Вкл</Text>
        </TouchableOpacity>
      </Card>

      {/* Subscription */}
      <Card style={{ marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.accent }}>
        <Text style={[typography.captionMedium, { color: colors.accent }]}>PREMIUM</Text>
        <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>
          Iron Gym Pro
        </Text>
        <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          Безлимитный ИИ-тренер, расширенная аналитика, персональные программы, КБЖУ без ограничений
        </Text>
        <Button
          title="Попробовать бесплатно"
          onPress={() => {}}
          style={{ marginTop: spacing.lg }}
          fullWidth
        />
      </Card>

      {/* Logout */}
      <Button
        title="Выйти из аккаунта"
        variant="ghost"
        onPress={handleLogout}
        fullWidth
        textStyle={{ color: colors.error }}
        style={{ marginBottom: spacing.huge }}
      />
    </ScrollView>
  );
};

const ProfileRow: React.FC<{ label: string; value: string; colors: any; isLast?: boolean }> = ({
  label,
  value,
  colors,
  isLast,
}) => (
  <View
    style={[
      {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.md,
      },
      !isLast && { borderBottomWidth: 1, borderBottomColor: colors.divider },
    ]}
  >
    <Text style={[typography.body, { color: colors.textSecondary }]}>{label}</Text>
    <Text style={[typography.bodyMedium, { color: colors.text }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  profileHeader: { alignItems: 'center', marginBottom: spacing.xxl },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  statItem: { alignItems: 'center' },
  statDivider: { width: 1, height: 30 },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
});
