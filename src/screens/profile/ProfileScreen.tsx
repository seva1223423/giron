import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useAuthStore, useWorkoutStore, useNutritionStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { computeAchievements } from '../../utils/achievements';

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

export const ProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { workoutHistory } = useWorkoutStore();
  const { dailyLog } = useNutritionStore();
  const [showAllAchievements, setShowAllAchievements] = useState(false);

  const lifetimeStats = useMemo(() => {
    if (workoutHistory.length === 0) return null;
    const totalTonnage = workoutHistory.reduce((s, w) => s + (w.totalVolume || 0), 0);
    const totalMinutes = workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0);

    // Best streak
    let bestStreak = 0;
    let currentStreak = 0;
    const sortedDates = workoutHistory
      .filter((w) => w.completedAt)
      .map((w) => w.completedAt!.split('T')[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        currentStreak = 1;
      } else {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
        if (diffDays === 1) {
          currentStreak++;
        } else {
          currentStreak = 1;
        }
      }
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    }

    // Favorite exercise (most frequently done)
    const exCount: Record<string, { name: string; count: number }> = {};
    workoutHistory.forEach((w) => {
      w.exercises.forEach((we) => {
        const id = we.exerciseId || we.exercise.id;
        if (!exCount[id]) exCount[id] = { name: we.exercise.name, count: 0 };
        exCount[id].count++;
      });
    });
    const topExercise = Object.values(exCount).sort((a, b) => b.count - a.count)[0] || null;

    // Avg workouts per week (based on first/last workout span)
    const first = new Date(sortedDates[0]);
    const last = new Date(sortedDates[sortedDates.length - 1]);
    const weeks = Math.max(1, Math.round((last.getTime() - first.getTime()) / (7 * 86400000)));
    const avgPerWeek = +(workoutHistory.length / weeks).toFixed(1);

    return { totalTonnage, totalMinutes, bestStreak, topExercise, avgPerWeek };
  }, [workoutHistory]);

  const achievements = useMemo(() => {
    const nutritionDaysLogged = Object.values(dailyLog).filter((d) => d.meals.length > 0).length;
    // Compute current streak
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

  const unlockedAchievements = achievements.filter((a) => a.unlocked);
  const inProgressAchievements = achievements.filter((a) => !a.unlocked && (a.progress ?? 0) > 0);

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

      {/* Lifetime stats */}
      {lifetimeStats && (
        <FadeIn delay={100}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Статистика за всё время</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <View style={[styles.statCard, { backgroundColor: colors.primary + '15', flex: 1, minWidth: '45%' }]}>
                <Text style={{ fontSize: 22 }}>🏋️</Text>
                <Text style={[typography.number, { color: colors.primary, marginTop: 4 }]}>
                  {lifetimeStats.totalTonnage >= 1000000
                    ? `${(lifetimeStats.totalTonnage / 1000000).toFixed(1)}M`
                    : lifetimeStats.totalTonnage >= 1000
                    ? `${Math.round(lifetimeStats.totalTonnage / 1000)}K`
                    : `${lifetimeStats.totalTonnage}`}
                </Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>кг поднято</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.success + '15', flex: 1, minWidth: '45%' }]}>
                <Text style={{ fontSize: 22 }}>⏱</Text>
                <Text style={[typography.number, { color: colors.success, marginTop: 4 }]}>
                  {lifetimeStats.totalMinutes >= 60
                    ? `${Math.round(lifetimeStats.totalMinutes / 60)}`
                    : `${lifetimeStats.totalMinutes}`}
                </Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  {lifetimeStats.totalMinutes >= 60 ? 'часов в зале' : 'минут'}
                </Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.accent + '15', flex: 1, minWidth: '45%' }]}>
                <Text style={{ fontSize: 22 }}>🔥</Text>
                <Text style={[typography.number, { color: colors.accent, marginTop: 4 }]}>{lifetimeStats.bestStreak}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>лучший стрик</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.primary + '10', flex: 1, minWidth: '45%' }]}>
                <Text style={{ fontSize: 22 }}>📅</Text>
                <Text style={[typography.number, { color: colors.primary, marginTop: 4 }]}>{lifetimeStats.avgPerWeek}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>трен/неделю</Text>
              </View>
            </View>
            {lifetimeStats.topExercise && (
              <View style={{ marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider }}>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Любимое упражнение</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Text style={[typography.bodyMedium, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                    {lifetimeStats.topExercise.name}
                  </Text>
                  <Text style={[typography.small, { color: colors.textSecondary }]}>
                    {lifetimeStats.topExercise.count} раз
                  </Text>
                </View>
              </View>
            )}
          </Card>
        </FadeIn>
      )}

      {/* Achievements */}
      <FadeIn delay={180}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
            <View>
              <Text style={[typography.h4, { color: colors.text }]}>Достижения</Text>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                {unlockedAchievements.length} / {achievements.length} разблокировано
              </Text>
            </View>
            {(inProgressAchievements.length > 0 || unlockedAchievements.length > 0) && (
              <TouchableOpacity onPress={() => { haptic.selection(); setShowAllAchievements((v) => !v); }}>
                <Text style={[typography.smallMedium, { color: colors.primary }]}>
                  {showAllAchievements ? 'Свернуть' : 'Все'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Unlocked badges grid */}
          {unlockedAchievements.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: inProgressAchievements.length > 0 ? spacing.lg : 0 }}>
              {(showAllAchievements ? unlockedAchievements : unlockedAchievements.slice(0, 8)).map((a) => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => Alert.alert(`${a.emoji} ${a.title}`, a.description)}
                  style={[styles.achievementBadge, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}
                >
                  <Text style={{ fontSize: 22 }}>{a.emoji}</Text>
                  <Text style={[typography.caption, { color: colors.primary, marginTop: 4, textAlign: 'center' }]} numberOfLines={2}>
                    {a.title}
                  </Text>
                </TouchableOpacity>
              ))}
              {!showAllAchievements && unlockedAchievements.length > 8 && (
                <TouchableOpacity
                  onPress={() => setShowAllAchievements(true)}
                  style={[styles.achievementBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>+{unlockedAchievements.length - 8}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* In-progress achievements */}
          {showAllAchievements && inProgressAchievements.length > 0 && (
            <View>
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                В ПРОЦЕССЕ
              </Text>
              {inProgressAchievements.slice(0, 4).map((a) => (
                <View key={a.id} style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text style={{ fontSize: 18 }}>{a.emoji}</Text>
                      <Text style={[typography.small, { color: colors.text }]}>{a.title}</Text>
                    </View>
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>{a.progressLabel}</Text>
                  </View>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}>
                    <View
                      style={{
                        height: 4,
                        borderRadius: 2,
                        width: `${Math.round((a.progress ?? 0) * 100)}%` as any,
                        backgroundColor: colors.primary + '80',
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {unlockedAchievements.length === 0 && inProgressAchievements.length === 0 && (
            <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.md }]}>
              Заверши первую тренировку — разблокируй первое достижение 🎯
            </Text>
          )}
        </Card>
      </FadeIn>

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

      {/* Settings link */}
      <Card style={{ marginBottom: spacing.lg }}>
        <TouchableOpacity
          onPress={() => { haptic.selection(); navigation.navigate('Settings'); }}
          style={styles.settingRow}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 20 }}>⚙️</Text>
            <Text style={[typography.body, { color: colors.text }]}>Настройки</Text>
          </View>
          <Text style={[typography.body, { color: colors.textSecondary }]}>›</Text>
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
          title="Попробовать бесплатно — 7 дней"
          onPress={() => navigation.navigate('Subscription')}
          style={{ marginTop: spacing.lg }}
          fullWidth
        />
      </Card>

      {/* Trainer mode */}
      <Card style={{ marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.primary + '40' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 24, marginRight: spacing.sm }}>🏋️</Text>
          <View style={{ flex: 1 }}>
            <Text style={[typography.h4, { color: colors.text }]}>Режим тренера</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
              Управляй клиентами, назначай программы и отслеживай прогресс
            </Text>
          </View>
        </View>
        <Button
          title="Открыть кабинет тренера"
          variant="outline"
          onPress={() => navigation.navigate('TrainerDashboard')}
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
  achievementBadge: {
    width: 68,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  statItem: { alignItems: 'center' },
  statDivider: { width: 1, height: 30 },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statCard: {
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
  },
});
