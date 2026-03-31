import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useThemeStore, useAuthStore, useWorkoutStore, useNutritionStore } from '../../store';
import { Card, ProgressRing, MacroBar } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const todayDate = () => new Date().toISOString().split('T')[0];

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const { programs, workoutHistory, activeWorkout } = useWorkoutStore();
  const { getDayLog } = useNutritionStore();

  const today = todayDate();
  const dayLog = getDayLog(today);
  const todayCalories = dayLog.meals.reduce((sum, m) => sum + m.totalCalories, 0);
  const todayProtein = dayLog.meals.reduce((sum, m) => sum + m.totalProtein, 0);
  const todayFats = dayLog.meals.reduce((sum, m) => sum + m.totalFats, 0);
  const todayCarbs = dayLog.meals.reduce((sum, m) => sum + m.totalCarbs, 0);

  const activeProgram = programs.find((p) => p.isActive);
  const weekWorkouts = workoutHistory.filter((w) => {
    if (!w.completedAt) return false;
    const d = new Date(w.completedAt);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= weekAgo;
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 6) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[typography.small, { color: colors.textSecondary }]}>{greeting()}</Text>
          <Text style={[typography.h2, { color: colors.text }]}>
            {user?.firstName || 'Атлет'} 💪
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('ProfileTab')}
          style={[styles.avatar, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700' }}>
            {(user?.firstName?.[0] || 'A').toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Quick Start */}
      {activeWorkout ? (
        <Card
          style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.success }}
          onPress={() => navigation.navigate('WorkoutsTab', { screen: 'ActiveWorkout' })}
        >
          <Text style={[typography.captionMedium, { color: colors.success }]}>АКТИВНАЯ ТРЕНИРОВКА</Text>
          <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>
            {activeWorkout.workout.name}
          </Text>
          <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            Нажми, чтобы продолжить →
          </Text>
        </Card>
      ) : (
        <Card
          style={{ marginBottom: spacing.lg }}
          onPress={() => navigation.navigate('WorkoutsTab')}
        >
          <Text style={[typography.h4, { color: colors.text }]}>Начать тренировку</Text>
          <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            {activeProgram
              ? `Программа: ${activeProgram.name}`
              : 'Выбери программу или создай свою'}
          </Text>
        </Card>
      )}

      {/* Weekly stats */}
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
          Статистика за неделю
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[typography.number, { color: colors.primary }]}>
              {weekWorkouts.length}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренировок</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[typography.number, { color: colors.primary }]}>
              {Math.round(weekWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0) / 1000)}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Тонн</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[typography.number, { color: colors.primary }]}>
              {weekWorkouts.reduce((s, w) => s + (w.durationMinutes || 0), 0)}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Минут</Text>
          </View>
        </View>
      </Card>

      {/* Nutrition today */}
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={styles.nutritionHeader}>
          <Text style={[typography.h4, { color: colors.text }]}>Питание сегодня</Text>
          <TouchableOpacity onPress={() => navigation.navigate('NutritionTab')}>
            <Text style={[typography.smallMedium, { color: colors.primary }]}>Подробнее</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.calorieRow}>
          <ProgressRing
            progress={dayLog.targetCalories > 0 ? todayCalories / dayLog.targetCalories : 0}
            size={90}
            strokeWidth={8}
            value={`${todayCalories}`}
            label="ккал"
          />
          <View style={{ flex: 1, marginLeft: spacing.xl }}>
            <MacroBar
              label="Белки"
              current={todayProtein}
              target={dayLog.targetProtein}
              color={colors.protein}
            />
            <MacroBar
              label="Жиры"
              current={todayFats}
              target={dayLog.targetFats}
              color={colors.fats}
            />
            <MacroBar
              label="Углеводы"
              current={todayCarbs}
              target={dayLog.targetCarbs}
              color={colors.carbs}
            />
          </View>
        </View>
      </Card>

      {/* AI tip */}
      <Card
        style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent }}
        onPress={() => navigation.navigate('AITab')}
      >
        <Text style={[typography.captionMedium, { color: colors.accent }]}>ИИ-ТРЕНЕР</Text>
        <Text style={[typography.body, { color: colors.text, marginTop: spacing.sm }]}>
          Спроси что угодно о тренировках, питании или технике упражнений
        </Text>
        <Text style={[typography.smallMedium, { color: colors.primary, marginTop: spacing.sm }]}>
          Открыть чат →
        </Text>
      </Card>

      {/* Water tracker mini */}
      <Card style={{ marginBottom: spacing.xxxl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[typography.h4, { color: colors.text }]}>Вода</Text>
            <Text style={[typography.small, { color: colors.textSecondary }]}>
              {dayLog.waterMl} / 2500 мл
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {[250, 500].map((ml) => (
              <TouchableOpacity
                key={ml}
                style={[styles.waterBtn, { backgroundColor: colors.info + '15', borderColor: colors.info }]}
                onPress={() => {
                  useNutritionStore.getState().addWater(today, ml);
                }}
              >
                <Text style={[typography.buttonSmall, { color: colors.info }]}>+{ml}мл</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center' },
  nutritionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  waterBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
});
