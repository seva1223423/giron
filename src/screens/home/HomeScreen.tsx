import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useAuthStore, useWorkoutStore, useNutritionStore } from '../../store';
import { Card, ProgressRing, MacroBar, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const todayDate = () => new Date().toISOString().split('T')[0];

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const { programs, workoutHistory, activeWorkout, fetchPrograms, fetchHistory } = useWorkoutStore();
  const { getDayLog } = useNutritionStore();

  // Sync data from server on mount
  useEffect(() => {
    fetchPrograms();
    fetchHistory();
  }, []);

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

  const handleWater = (ml: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useNutritionStore.getState().addWater(today, ml);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <FadeIn delay={0} from="top">
        <View style={styles.header}>
          <View>
            <Text style={[typography.small, { color: colors.textSecondary }]}>{greeting()}</Text>
            <Text style={[typography.h2, { color: colors.text }]}>
              {user?.firstName || 'Атлет'}
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
      </FadeIn>

      {/* Quick Start */}
      <FadeIn delay={100}>
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
              Нажми, чтобы продолжить
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
      </FadeIn>

      {/* Weekly stats */}
      <FadeIn delay={200}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
            Эта неделя
          </Text>
          {/* Week day dots */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg }}>
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, i) => {
              const now = new Date();
              const currentDow = now.getDay() === 0 ? 6 : now.getDay() - 1;
              const dayDate = new Date(now);
              dayDate.setDate(now.getDate() - currentDow + i);
              const dateStr = dayDate.toISOString().split('T')[0];
              const hadWorkout = workoutHistory.some(
                (w) => w.completedAt && w.completedAt.startsWith(dateStr)
              );
              const isToday = i === currentDow;
              return (
                <View key={day} style={{ alignItems: 'center', gap: 4 }}>
                  <Text style={[typography.small, { color: isToday ? colors.primary : colors.textTertiary, fontSize: 10 }]}>
                    {day}
                  </Text>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: hadWorkout ? colors.success : isToday ? colors.primary + '15' : colors.surface,
                      borderWidth: isToday ? 2 : 0,
                      borderColor: colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {hadWorkout ? (
                      <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>{'✓'}</Text>
                    ) : (
                      <Text style={[typography.small, { color: isToday ? colors.primary : colors.textTertiary }]}>
                        {dayDate.getDate()}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.primary }]}>
                {weekWorkouts.length}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренировок</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.accent }]}>
                {Math.round(weekWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0) / 1000)}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Тонн</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.success }]}>
                {weekWorkouts.reduce((s, w) => s + (w.durationMinutes || 0), 0)}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Минут</Text>
            </View>
          </View>
        </Card>
      </FadeIn>

      {/* Nutrition today */}
      <FadeIn delay={300}>
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
      </FadeIn>

      {/* AI tip */}
      <FadeIn delay={400}>
        <Card
          style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent }}
          onPress={() => navigation.navigate('AITab')}
        >
          <Text style={[typography.captionMedium, { color: colors.accent }]}>ИИ-ТРЕНЕР</Text>
          <Text style={[typography.body, { color: colors.text, marginTop: spacing.sm }]}>
            Спроси что угодно о тренировках, питании или технике упражнений
          </Text>
          <Text style={[typography.smallMedium, { color: colors.primary, marginTop: spacing.sm }]}>
            Открыть чат
          </Text>
        </Card>
      </FadeIn>

      {/* Water tracker mini */}
      <FadeIn delay={500}>
        <Card style={{ marginBottom: spacing.xxxl }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
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
                  onPress={() => handleWater(ml)}
                >
                  <Text style={[typography.buttonSmall, { color: colors.info }]}>+{ml}мл</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {/* Water progress bar */}
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.info,
                width: `${Math.min((dayLog.waterMl / 2500) * 100, 100)}%`,
              }}
            />
          </View>
        </Card>
      </FadeIn>
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
