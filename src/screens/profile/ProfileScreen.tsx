import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useAuthStore, useWorkoutStore, useNutritionStore } from '../../store';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { computeAchievements } from '../../utils/achievements';
import { LifetimeStatsCard, AchievementsCard } from './components';

const GOAL_LABELS: Record<string, string> = {
  WEIGHT_LOSS: 'Похудение', weight_loss: 'Похудение',
  MUSCLE_GAIN: 'Набор массы', muscle_gain: 'Набор массы',
  STRENGTH: 'Сила', strength: 'Сила',
  ENDURANCE: 'Выносливость', endurance: 'Выносливость',
  FLEXIBILITY: 'Гибкость', flexibility: 'Гибкость',
  GENERAL_FITNESS: 'Общая форма', general_fitness: 'Общая форма',
};

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Новичок', beginner: 'Новичок',
  INTERMEDIATE: 'Средний', intermediate: 'Средний',
  ADVANCED: 'Продвинутый', advanced: 'Продвинутый',
  EXPERT: 'Эксперт', expert: 'Эксперт',
};

const ProfileRow: React.FC<{ label: string; value: string; colors: any; isLast?: boolean }> = ({ label, value, colors, isLast }) => (
  <View style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md }, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
    <Text style={[typography.body, { color: colors.textSecondary }]}>{label}</Text>
    <Text style={[typography.bodyMedium, { color: colors.text }]}>{value}</Text>
  </View>
);

export const ProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { workoutHistory } = useWorkoutStore();
  const { dailyLog } = useNutritionStore();

  const achievements = useMemo(() => {
    const nutritionDaysLogged = Object.values(dailyLog).filter((d) => d.meals.length > 0).length;
    const sortedDates = workoutHistory
      .filter((w) => w.completedAt)
      .map((w) => w.completedAt!.split('T')[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => b.localeCompare(a));
    let currentStreak = 0;
    const today = new Date();
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = new Date(today);
      expected.setDate(today.getDate() - i);
      if (sortedDates[i] === expected.toISOString().split('T')[0]) currentStreak++;
      else break;
    }
    return computeAchievements({ workoutHistory, nutritionDaysLogged, currentStreak });
  }, [workoutHistory, dailyLog]);

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.content, { paddingTop: safeTop }]} showsVerticalScrollIndicator={false}>
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={{ color: '#FFF', fontSize: 32, fontWeight: '800' }}>{(user?.firstName?.[0] || 'A').toUpperCase()}</Text>
        </View>
        <Text style={[typography.h2, { color: colors.text, marginTop: spacing.lg }]}>{user?.firstName} {user?.lastName}</Text>
        <Text style={[typography.body, { color: colors.textSecondary }]}>{user?.email}</Text>
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
          <Text style={[typography.numberSmall, { color: colors.primary }]}>{user?.fitnessLevel ? LEVEL_LABELS[user.fitnessLevel] : '—'}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Уровень</Text>
        </View>
      </View>

      <LifetimeStatsCard delay={100} />
      <AchievementsCard achievements={achievements} delay={180} />

      {/* Personal info */}
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text }]}>Личные данные</Text>
          <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
            <Text style={[typography.smallMedium, { color: colors.primary }]}>Изменить</Text>
          </TouchableOpacity>
        </View>
        <ProfileRow label="Рост" value={user?.heightCm ? `${user.heightCm} см` : 'Не указан'} colors={colors} />
        <ProfileRow label="Вес" value={user?.weightKg ? `${user.weightKg} кг` : 'Не указан'} colors={colors} />
        <ProfileRow label="Пол" value={user?.gender === 'male' ? 'Мужской' : user?.gender === 'female' ? 'Женский' : 'Не указан'} colors={colors} />
        <ProfileRow label="Цель" value={user?.goal ? GOAL_LABELS[user.goal] : 'Не указана'} colors={colors} />
        <ProfileRow label="Уровень" value={user?.fitnessLevel ? LEVEL_LABELS[user.fitnessLevel] : 'Не указан'} colors={colors} />
        <ProfileRow label="Стаж" value={user?.trainingExperienceYears ? `${user.trainingExperienceYears} лет` : 'Не указан'} colors={colors} isLast />
      </Card>

      {/* Settings */}
      <Card style={{ marginBottom: spacing.lg }}>
        <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('Settings'); }} style={styles.settingRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textSecondary }}>SET</Text>
            <Text style={[typography.body, { color: colors.text }]}>Настройки</Text>
          </View>
          <Text style={[typography.body, { color: colors.textSecondary }]}>›</Text>
        </TouchableOpacity>
      </Card>

      {/* Subscription */}
      <Card style={{ marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.accent }}>
        <Text style={[typography.captionMedium, { color: colors.accent }]}>PREMIUM</Text>
        <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>Iron Gym Pro</Text>
        <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          Безлимитный ИИ-тренер, расширенная аналитика, персональные программы, КБЖУ без ограничений
        </Text>
        <Button title="Попробовать бесплатно — 7 дней" onPress={() => navigation.navigate('Subscription')} style={{ marginTop: spacing.lg }} fullWidth />
      </Card>

      {/* Trainer mode */}
      <Card style={{ marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.primary + '40' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm }}><Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>T</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.h4, { color: colors.text }]}>Режим тренера</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>Управляй клиентами, назначай программы и отслеживай прогресс</Text>
          </View>
        </View>
        <Button title="Открыть кабинет тренера" variant="outline" onPress={() => navigation.navigate('TrainerDashboard')} fullWidth />
      </Card>

      <Button title="Выйти из аккаунта" variant="ghost" onPress={handleLogout} fullWidth textStyle={{ color: colors.error }} style={{ marginBottom: spacing.huge }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  profileHeader: { alignItems: 'center', marginBottom: spacing.xxl },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: spacing.xxl },
  statItem: { alignItems: 'center' },
  statDivider: { width: 1, height: 30 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md },
});
