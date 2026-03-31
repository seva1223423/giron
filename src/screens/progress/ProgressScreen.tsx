import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore, useAuthStore } from '../../store';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - spacing.xl * 2 - spacing.lg * 2;

// Simple bar chart component
const BarChart: React.FC<{
  data: { label: string; value: number }[];
  color: string;
  height?: number;
  colors: any;
}> = ({ data, color, height = 140, colors }) => {
  const maxValue = Math.max(1, ...data.map((d) => d.value));

  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      {data.map((item, i) => {
        const barHeight = (item.value / maxValue) * (height - 24);
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            {item.value > 0 && (
              <Text style={[typography.small, { color: colors.textTertiary, fontSize: 9, marginBottom: 2 }]}>
                {item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}k` : item.value}
              </Text>
            )}
            <View
              style={{
                width: '70%',
                height: Math.max(barHeight, 2),
                backgroundColor: item.value > 0 ? color : colors.border,
                borderRadius: 4,
                minHeight: 2,
              }}
            />
            <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10, marginTop: 4 }]}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

// Mini line chart
const LineChart: React.FC<{
  data: { label: string; value: number }[];
  color: string;
  height?: number;
  colors: any;
  suffix?: string;
}> = ({ data, color, height = 120, colors, suffix = '' }) => {
  if (data.length < 2) return null;

  const maxVal = Math.max(...data.map((d) => d.value));
  const minVal = Math.min(...data.map((d) => d.value));
  const range = maxVal - minVal || 1;
  const chartH = height - 32;

  return (
    <View style={{ height }}>
      {/* Y axis labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>{maxVal}{suffix}</Text>
        <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>{minVal}{suffix}</Text>
      </View>
      {/* Points and lines */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: chartH }}>
        {data.map((item, i) => {
          const y = ((item.value - minVal) / range) * (chartH - 16);
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', height: chartH, justifyContent: 'flex-end' }}>
              <View style={{ position: 'absolute', bottom: y }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: color,
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
      {/* X labels */}
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.map((item, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[typography.small, { color: colors.textTertiary, fontSize: 9 }]}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// Heatmap for weekly activity
const WeeklyHeatmap: React.FC<{
  workoutDates: string[];
  weeks?: number;
  colors: any;
}> = ({ workoutDates, weeks = 12, colors }) => {
  const today = new Date();
  const cells: { date: string; count: number; dayOfWeek: number }[] = [];

  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const count = workoutDates.filter((wd) => wd.startsWith(dateStr)).length;
    cells.push({ date: dateStr, count, dayOfWeek: d.getDay() });
  }

  const cellSize = Math.floor((CHART_WIDTH - 24) / weeks) - 2;

  // Group by weeks
  const weekGroups: typeof cells[] = [];
  let currentWeek: typeof cells = [];
  cells.forEach((cell) => {
    currentWeek.push(cell);
    if (cell.dayOfWeek === 6 || cells.indexOf(cell) === cells.length - 1) {
      weekGroups.push(currentWeek);
      currentWeek = [];
    }
  });

  return (
    <View style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {cells.map((cell, i) => (
        <View
          key={i}
          style={{
            width: cellSize,
            height: cellSize,
            borderRadius: 2,
            backgroundColor: cell.count > 0
              ? cell.count >= 2 ? colors.success : colors.success + '70'
              : colors.surface,
          }}
        />
      ))}
    </View>
  );
};

export const ProgressScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { workoutHistory } = useWorkoutStore();
  const { user } = useAuthStore();
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

  // Weekly volume data for last 8 weeks
  const weeklyVolumeData = useMemo(() => {
    const weeks: { label: string; value: number }[] = [];
    const today = new Date();

    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - w * 7 - today.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const volume = workoutHistory
        .filter((wk) => {
          if (!wk.completedAt) return false;
          const d = new Date(wk.completedAt);
          return d >= weekStart && d < weekEnd;
        })
        .reduce((s, wk) => s + (wk.totalVolume || 0), 0);

      const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
      weeks.push({ label, value: Math.round(volume) });
    }

    return weeks;
  }, [workoutHistory]);

  // Weekly workout count
  const weeklyCountData = useMemo(() => {
    const weeks: { label: string; value: number }[] = [];
    const today = new Date();

    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - w * 7 - today.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const count = workoutHistory.filter((wk) => {
        if (!wk.completedAt) return false;
        const d = new Date(wk.completedAt);
        return d >= weekStart && d < weekEnd;
      }).length;

      const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
      weeks.push({ label, value: count });
    }

    return weeks;
  }, [workoutHistory]);

  // Average workout duration over last 10 workouts
  const durationTrend = useMemo(() => {
    return workoutHistory
      .slice(0, 10)
      .reverse()
      .map((w, i) => ({
        label: `${i + 1}`,
        value: w.durationMinutes || 0,
      }));
  }, [workoutHistory]);

  // Workout dates for heatmap
  const workoutDates = useMemo(() => {
    return workoutHistory
      .filter((w) => w.completedAt)
      .map((w) => w.completedAt!);
  }, [workoutHistory]);

  // Get calendar data for current month
  const getCalendarData = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: { date: number; hasWorkout: boolean; isToday: boolean }[] = [];

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

  // Muscle group distribution
  const muscleDistribution = useMemo(() => {
    const muscles: Record<string, number> = {};
    const labels: Record<string, string> = {
      chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
      triceps: 'Трицепс', quadriceps: 'Ноги', hamstrings: 'Задняя', glutes: 'Ягодицы',
      abs: 'Пресс', calves: 'Икры',
    };

    workoutHistory.forEach((w) => {
      w.exercises.forEach((ex) => {
        const completedSets = ex.sets.filter((s) => s.completed).length;
        ex.exercise.primaryMuscles.forEach((m) => {
          muscles[m] = (muscles[m] || 0) + completedSets;
        });
      });
    });

    return Object.entries(muscles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, value]) => ({ label: labels[key] || key, value }));
  }, [workoutHistory]);

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
            onPress={() => { Haptics.selectionAsync(); setTab(t.key); }}
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
            <FadeIn delay={0}>
              <View style={styles.statsGrid}>
                <Card style={styles.statCard}>
                  <Text style={[typography.number, { color: colors.primary }]}>{totalWorkouts}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренировок</Text>
                </Card>
                <Card style={styles.statCard}>
                  <Text style={[typography.number, { color: colors.success }]}>{getStreak()}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Дней подряд</Text>
                </Card>
                <Card style={styles.statCard}>
                  <Text style={[typography.number, { color: colors.accent }]}>{Math.round(totalVolume / 1000)}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Тонн всего</Text>
                </Card>
                <Card style={styles.statCard}>
                  <Text style={[typography.number, { color: colors.primary }]}>{totalDuration}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Минут</Text>
                </Card>
              </View>
            </FadeIn>

            {/* Activity heatmap */}
            <FadeIn delay={100}>
              <Card style={{ marginTop: spacing.xl }}>
                <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                  Активность
                </Text>
                <WeeklyHeatmap workoutDates={workoutDates} colors={colors} />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: spacing.sm, gap: spacing.xs }}>
                  <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>Мало</Text>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.surface }} />
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.success + '70' }} />
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.success }} />
                  <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>Много</Text>
                </View>
              </Card>
            </FadeIn>

            {/* Weekly volume chart */}
            <FadeIn delay={200}>
              <Card style={{ marginTop: spacing.lg }}>
                <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                  Объём по неделям (кг)
                </Text>
                <BarChart data={weeklyVolumeData} color={colors.primary} colors={colors} />
              </Card>
            </FadeIn>

            {/* Workout frequency chart */}
            <FadeIn delay={300}>
              <Card style={{ marginTop: spacing.lg }}>
                <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                  Тренировок в неделю
                </Text>
                <BarChart data={weeklyCountData} color={colors.success} height={100} colors={colors} />
              </Card>
            </FadeIn>

            {/* Muscle distribution */}
            {muscleDistribution.length > 0 && (
              <FadeIn delay={400}>
                <Card style={{ marginTop: spacing.lg }}>
                  <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                    Распределение нагрузки
                  </Text>
                  {muscleDistribution.map((m, i) => {
                    const maxSets = Math.max(1, muscleDistribution[0].value);
                    const pct = (m.value / maxSets) * 100;
                    return (
                      <View key={i} style={{ marginBottom: spacing.sm }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                          <Text style={[typography.smallMedium, { color: colors.text }]}>{m.label}</Text>
                          <Text style={[typography.small, { color: colors.textSecondary }]}>{m.value} подх.</Text>
                        </View>
                        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface }}>
                          <View
                            style={{
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: colors.primary,
                              width: `${pct}%`,
                            }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </FadeIn>
            )}

            {/* Duration trend */}
            {durationTrend.length >= 2 && (
              <FadeIn delay={500}>
                <Card style={{ marginTop: spacing.lg }}>
                  <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                    Длительность тренировок (мин)
                  </Text>
                  <LineChart data={durationTrend} color={colors.accent} colors={colors} suffix=" мин" />
                </Card>
              </FadeIn>
            )}

            {/* Recent workouts */}
            <FadeIn delay={600}>
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
                workoutHistory.slice(0, 10).map((workout, i) => (
                  <FadeIn key={workout.id} delay={650 + i * 50}>
                    <Card style={{ marginBottom: spacing.sm }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.bodySemibold, { color: colors.text }]}>{workout.name}</Text>
                          <Text style={[typography.small, { color: colors.textSecondary }]}>
                            {workout.exercises.length} упр. {'\u2022'} {workout.durationMinutes || 0} мин
                            {workout.totalVolume ? ` \u2022 ${Math.round(workout.totalVolume)} кг` : ''}
                          </Text>
                        </View>
                        <Text style={[typography.caption, { color: colors.textTertiary }]}>
                          {workout.completedAt
                            ? new Date(workout.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                            : ''}
                        </Text>
                      </View>
                    </Card>
                  </FadeIn>
                ))
              )}
            </FadeIn>
          </>
        )}

        {tab === 'calendar' && (
          <>
            <FadeIn delay={0}>
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
            </FadeIn>

            {/* Monthly summary */}
            <FadeIn delay={150}>
              <Card style={{ marginTop: spacing.xl }}>
                <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                  Этот месяц
                </Text>
                {(() => {
                  const now = new Date();
                  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  const monthWorkouts = workoutHistory.filter(
                    (w) => w.completedAt && w.completedAt.startsWith(monthStr)
                  );
                  const monthVolume = monthWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
                  const monthDuration = monthWorkouts.reduce((s, w) => s + (w.durationMinutes || 0), 0);

                  return (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={[typography.number, { color: colors.primary }]}>{monthWorkouts.length}</Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>тренировок</Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={[typography.number, { color: colors.accent }]}>{Math.round(monthVolume)}</Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>кг объём</Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={[typography.number, { color: colors.success }]}>{monthDuration}</Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>минут</Text>
                      </View>
                    </View>
                  );
                })()}
              </Card>
            </FadeIn>
          </>
        )}

        {tab === 'records' && (
          <>
            {getPersonalRecords().length === 0 ? (
              <FadeIn>
                <Card style={{ marginTop: spacing.xl }}>
                  <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                    Рекорды появятся после первых тренировок
                  </Text>
                </Card>
              </FadeIn>
            ) : (
              getPersonalRecords().map((record, i) => (
                <FadeIn key={i} delay={i * 60}>
                  <Card style={{ marginBottom: spacing.sm }}>
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
                    {/* Progress bar relative to top */}
                    <View style={{ marginTop: spacing.sm }}>
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface }}>
                        <View
                          style={{
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: colors.primary,
                            width: `${(record.estimated1RM / getPersonalRecords()[0].estimated1RM) * 100}%`,
                          }}
                        />
                      </View>
                    </View>
                  </Card>
                </FadeIn>
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
