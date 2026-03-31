import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ProgressScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { workoutHistory } = useWorkoutStore();
  const [tab, setTab] = useState<'overview' | 'calendar' | 'records'>('overview');

  const totalWorkouts = workoutHistory.length;
  const totalVolume = workoutHistory.reduce((s, w) => s + (w.totalVolume || 0), 0);
  const totalDuration = workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0);

  // Calculate streak
  const getStreak = () => {
    if (workoutHistory.length === 0) return 0;
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const hasWorkout = workoutHistory.some(
        (w) => w.completedAt && w.completedAt.startsWith(dateStr)
      );
      if (hasWorkout) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  };

  // Get calendar data for current month
  const getCalendarData = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: { date: number; hasWorkout: boolean; isToday: boolean }[] = [];

    // Offset for first day of week
    let startDow = firstDay.getDay();
    if (startDow === 0) startDow = 7;
    for (let i = 1; i < startDow; i++) {
      days.push({ date: 0, hasWorkout: false, isToday: false });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasWorkout = workoutHistory.some(
        (w) => w.completedAt && w.completedAt.startsWith(dateStr)
      );
      const isToday = d === now.getDate();
      days.push({ date: d, hasWorkout, isToday });
    }

    return days;
  };

  // Personal records
  const getPersonalRecords = () => {
    const records: Record<string, { name: string; maxWeight: number; maxReps: number; estimated1RM: number }> = {};

    workoutHistory.forEach((workout) => {
      workout.exercises.forEach((ex) => {
        ex.sets
          .filter((s) => s.completed && s.weight && s.reps)
          .forEach((set) => {
            const key = ex.exerciseId;
            const estimated1RM = (set.weight || 0) * (1 + (set.reps || 0) / 30);

            if (!records[key] || estimated1RM > records[key].estimated1RM) {
              records[key] = {
                name: ex.exercise.name,
                maxWeight: set.weight || 0,
                maxReps: set.reps || 0,
                estimated1RM: Math.round(estimated1RM),
              };
            }
          });
      });
    });

    return Object.values(records).sort((a, b) => b.estimated1RM - a.estimated1RM);
  };

  const tabs = [
    { key: 'overview', label: 'Обзор' },
    { key: 'calendar', label: 'Календарь' },
    { key: 'records', label: 'Рекорды' },
  ] as const;

  const MONTH_NAMES = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.h2, { color: colors.text, paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md }]}>
        Прогресс
      </Text>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[typography.smallMedium, { color: tab === t.key ? colors.primary : colors.textSecondary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'overview' && (
          <>
            {/* Stats cards */}
            <View style={styles.statsGrid}>
              <Card style={styles.statCard}>
                <Text style={[typography.number, { color: colors.primary }]}>{totalWorkouts}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренировок</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={[typography.number, { color: colors.primary }]}>{getStreak()}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Дней подряд</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={[typography.number, { color: colors.primary }]}>{Math.round(totalVolume / 1000)}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Тонн всего</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={[typography.number, { color: colors.primary }]}>{totalDuration}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Минут</Text>
              </Card>
            </View>

            {/* Recent workouts */}
            <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>
              Последние тренировки
            </Text>
            {workoutHistory.length === 0 ? (
              <Card>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Нет завершённых тренировок. Начни первую!
                </Text>
              </Card>
            ) : (
              workoutHistory.slice(0, 10).map((workout) => (
                <Card key={workout.id} style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View>
                      <Text style={[typography.bodySemibold, { color: colors.text }]}>{workout.name}</Text>
                      <Text style={[typography.small, { color: colors.textSecondary }]}>
                        {workout.exercises.length} упр. • {workout.durationMinutes || 0} мин
                        {workout.totalVolume ? ` • ${Math.round(workout.totalVolume)} кг` : ''}
                      </Text>
                    </View>
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>
                      {workout.completedAt
                        ? new Date(workout.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                        : ''}
                    </Text>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {tab === 'calendar' && (
          <>
            <Text style={[typography.h4, { color: colors.text, textAlign: 'center', marginBottom: spacing.lg }]}>
              {MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()}
            </Text>
            <View style={styles.calendarHeader}>
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                <Text key={d} style={[typography.captionMedium, { color: colors.textSecondary, width: CELL_SIZE, textAlign: 'center' }]}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {getCalendarData().map((day, i) => (
                <View
                  key={i}
                  style={[
                    styles.calendarCell,
                    day.isToday && { borderWidth: 2, borderColor: colors.primary },
                    day.hasWorkout && { backgroundColor: colors.success + '30' },
                  ]}
                >
                  {day.date > 0 && (
                    <>
                      <Text style={[typography.smallMedium, { color: day.hasWorkout ? colors.success : colors.text }]}>
                        {day.date}
                      </Text>
                      {day.hasWorkout && (
                        <View style={[styles.workoutDot, { backgroundColor: colors.success }]} />
                      )}
                    </>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {tab === 'records' && (
          <>
            {getPersonalRecords().length === 0 ? (
              <Card style={{ marginTop: spacing.xl }}>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Рекорды появятся после первых тренировок
                </Text>
              </Card>
            ) : (
              getPersonalRecords().map((record, i) => (
                <Card key={i} style={{ marginBottom: spacing.sm }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>{record.name}</Text>
                  <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
                    <View>
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>Макс. вес</Text>
                      <Text style={[typography.numberSmall, { color: colors.primary }]}>{record.maxWeight} кг</Text>
                    </View>
                    <View>
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>Повторений</Text>
                      <Text style={[typography.numberSmall, { color: colors.text }]}>{record.maxReps}</Text>
                    </View>
                    <View>
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>~1ПМ</Text>
                      <Text style={[typography.numberSmall, { color: colors.accent }]}>{record.estimated1RM} кг</Text>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const CELL_SIZE = (SCREEN_WIDTH - spacing.xl * 2) / 7;

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  tab: { paddingVertical: spacing.md, marginRight: spacing.xl },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: { width: (SCREEN_WIDTH - spacing.xl * 2 - spacing.md) / 2 - 1, alignItems: 'center', paddingVertical: spacing.xl },
  calendarHeader: { flexDirection: 'row', marginBottom: spacing.sm },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
  },
  workoutDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
