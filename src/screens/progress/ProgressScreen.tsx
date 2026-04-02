import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions, TextInput, Modal, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore, useAuthStore, useNutritionStore } from '../../store';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { userService, workoutService } from '../../services';
import { BodyWeight, BodyMeasurement } from '../../types';
import { LeaderboardEntry } from '../../services/workoutService';
import { computeAchievements, ACHIEVEMENT_DEFINITIONS, Achievement } from '../../utils/achievements';

const MEASUREMENTS_KEY = 'iron_gym_body_measurements';

const MEASUREMENT_FIELDS: { key: keyof BodyMeasurement; label: string; emoji: string }[] = [
  { key: 'chest', label: 'Грудь', emoji: '💪' },
  { key: 'waist', label: 'Талия', emoji: '📏' },
  { key: 'hips', label: 'Бёдра', emoji: '🦵' },
  { key: 'bicep', label: 'Бицепс', emoji: '💪' },
  { key: 'thigh', label: 'Бедро', emoji: '🦵' },
  { key: 'calf', label: 'Икра', emoji: '🦿' },
  { key: 'neck', label: 'Шея', emoji: '📐' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - spacing.xl * 2 - spacing.lg * 2;

const STRENGTH_STANDARDS = [
  { exerciseId: 'squat', name: 'Присед', multipliers: [0.5, 1.0, 1.5, 2.0, 2.5] },
  { exerciseId: 'bench-press', name: 'Жим лёжа', multipliers: [0.35, 0.75, 1.25, 1.75, 2.0] },
  { exerciseId: 'deadlift', name: 'Становая', multipliers: [0.5, 1.25, 1.75, 2.25, 2.75] },
  { exerciseId: 'overhead-press', name: 'Жим стоя', multipliers: [0.25, 0.5, 0.75, 1.0, 1.25] },
];
const LEVEL_NAMES = ['Новичок', 'Начинающий', 'Средний', 'Продвинутый', 'Элита'];
const LEVEL_COLORS = ['#9E9E9E', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0'];

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
  const { dailyLog } = useNutritionStore();
  const [tab, setTab] = useState<'overview' | 'calendar' | 'records' | 'weight' | 'achievements'>('overview');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [recordsView, setRecordsView] = useState<'mine' | 'club'>('mine');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    if (leaderboard.length > 0) return; // already loaded
    setLoadingLeaderboard(true);
    try {
      const data = await workoutService.getLeaderboard();
      setLeaderboard(data);
    } catch {
      // silently fail
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [leaderboard.length]);

  // Body weight state
  const [weightHistory, setWeightHistory] = useState<BodyWeight[]>([]);
  const [loadingWeight, setLoadingWeight] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  // Body measurements state
  const [measurementHistory, setMeasurementHistory] = useState<BodyMeasurement[]>([]);
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [newMeasurements, setNewMeasurements] = useState<Partial<Record<keyof BodyMeasurement, string>>>({});
  const [savingMeasurements, setSavingMeasurements] = useState(false);

  const fetchMeasurementHistory = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MEASUREMENTS_KEY);
      if (raw) {
        const data: BodyMeasurement[] = JSON.parse(raw);
        setMeasurementHistory(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
      }
    } catch {
      // silently fail
    }
  }, []);

  const handleAddMeasurements = async () => {
    const today = new Date().toISOString().split('T')[0];
    const entry: BodyMeasurement = { date: today };
    let hasAny = false;
    MEASUREMENT_FIELDS.forEach(({ key }) => {
      const val = parseFloat((newMeasurements[key] ?? '').replace(',', '.'));
      if (val > 0 && val < 200) { (entry as any)[key] = val; hasAny = true; }
    });
    if (!hasAny) { Alert.alert('Ошибка', 'Введи хотя бы одно измерение'); return; }
    setSavingMeasurements(true);
    try {
      const updated = [...measurementHistory.filter((m) => m.date !== today), entry]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      await AsyncStorage.setItem(MEASUREMENTS_KEY, JSON.stringify(updated));
      setMeasurementHistory(updated);
      setNewMeasurements({});
      setShowMeasurementModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить измерения');
    } finally {
      setSavingMeasurements(false);
    }
  };

  const fetchWeightHistory = useCallback(async () => {
    setLoadingWeight(true);
    try {
      const data = await userService.getWeightHistory();
      setWeightHistory(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    } catch {
      // silently fail
    } finally {
      setLoadingWeight(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'weight') { fetchWeightHistory(); fetchMeasurementHistory(); }
    if (tab === 'records' && recordsView === 'club') fetchLeaderboard();
  }, [tab, fetchWeightHistory, fetchMeasurementHistory, fetchLeaderboard, recordsView]);

  const handleAddWeight = async () => {
    const kg = parseFloat(newWeight.replace(',', '.'));
    if (!kg || kg < 20 || kg > 300) {
      Alert.alert('Ошибка', 'Введи корректный вес (20–300 кг)');
      return;
    }
    setSavingWeight(true);
    try {
      await userService.addWeight(kg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowWeightModal(false);
      setNewWeight('');
      await fetchWeightHistory();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить вес');
    } finally {
      setSavingWeight(false);
    }
  };

  const totalWorkouts = workoutHistory.length;
  const totalVolume = workoutHistory.reduce((s, w) => s + (w.totalVolume || 0), 0);
  const totalDuration = workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0);

  const streak = useMemo(() => {
    if (workoutHistory.length === 0) return 0;
    let s = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      if (workoutHistory.some((w) => w.completedAt && w.completedAt.startsWith(dateStr))) {
        s++;
      } else if (i > 0) {
        break;
      }
    }
    return s;
  }, [workoutHistory]);

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

  // Get calendar data for a given month
  const getCalendarData = (monthDate: Date) => {
    const now = new Date();
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: { date: number; dateStr: string; hasWorkout: boolean; isToday: boolean }[] = [];

    let startDow = firstDay.getDay();
    if (startDow === 0) startDow = 7;
    for (let i = 1; i < startDow; i++) {
      days.push({ date: 0, dateStr: '', hasWorkout: false, isToday: false });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasWorkout = workoutHistory.some(
        (w) => w.completedAt && w.completedAt.startsWith(dateStr)
      );
      const isToday =
        d === now.getDate() &&
        month === now.getMonth() &&
        year === now.getFullYear();
      days.push({ date: d, dateStr, hasWorkout, isToday });
    }

    return days;
  };

  // Personal records
  const personalRecords = useMemo(() => {
    const records: Record<string, { exerciseId: string; name: string; maxWeight: number; maxReps: number; estimated1RM: number }> = {};

    workoutHistory.forEach((workout) => {
      workout.exercises.forEach((ex) => {
        ex.sets
          .filter((s) => s.completed && s.weight && s.reps)
          .forEach((set) => {
            const key = ex.exerciseId;
            const estimated1RM = (set.weight || 0) * (1 + (set.reps || 0) / 30);

            if (!records[key] || estimated1RM > records[key].estimated1RM) {
              records[key] = {
                exerciseId: ex.exerciseId,
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
  }, [workoutHistory]);

  // 1RM history for selected exercise
  const oneRMHistory = useMemo(() => {
    if (!selectedExerciseId) return [];

    const byDate = new Map<string, number>();

    [...workoutHistory]
      .filter((w) => w.completedAt)
      .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime())
      .forEach((workout) => {
        workout.exercises
          .filter((ex) => ex.exerciseId === selectedExerciseId)
          .forEach((ex) => {
            ex.sets
              .filter((s) => s.completed && s.weight && s.reps)
              .forEach((set) => {
                const date = workout.completedAt!.split('T')[0];
                const est1rm = Math.round((set.weight || 0) * (1 + (set.reps || 0) / 30));
                if (!byDate.has(date) || est1rm > byDate.get(date)!) {
                  byDate.set(date, est1rm);
                }
              });
          });
      });

    return Array.from(byDate.entries()).map(([date, value]) => ({
      label: new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''),
      value,
    }));
  }, [selectedExerciseId, workoutHistory]);

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

  // Nutrition days logged (distinct dates with at least 1 meal)
  const nutritionDaysLogged = useMemo(() => {
    return Object.values(dailyLog).filter((d) => d.meals.length > 0).length;
  }, [dailyLog]);

  // Achievements
  const achievements = useMemo(() =>
    computeAchievements({ workoutHistory, nutritionDaysLogged, currentStreak: streak }),
  [workoutHistory, nutritionDaysLogged, streak]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const tabs = [
    { key: 'overview', label: 'Обзор' },
    { key: 'calendar', label: 'Календарь' },
    { key: 'records', label: 'Рекорды' },
    { key: 'weight', label: 'Вес тела' },
    { key: 'achievements', label: `🏅 ${unlockedCount}/${ACHIEVEMENT_DEFINITIONS.length}` },
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
                  <Text style={[typography.number, { color: colors.success }]}>{streak}</Text>
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

        {tab === 'calendar' && (() => {
          const calDays = getCalendarData(calendarMonth);
          const monthStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
          const monthWorkouts = workoutHistory.filter(
            (w) => w.completedAt && w.completedAt.startsWith(monthStr)
          );
          const monthVolume = monthWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
          const monthDuration = monthWorkouts.reduce((s, w) => s + (w.durationMinutes || 0), 0);
          const selectedDayWorkouts = selectedDay
            ? workoutHistory.filter((w) => w.completedAt && w.completedAt.startsWith(selectedDay))
            : [];

          const goToPrevMonth = () => {
            Haptics.selectionAsync();
            setSelectedDay(null);
            setCalendarMonth((prev) => {
              const d = new Date(prev);
              d.setMonth(d.getMonth() - 1);
              return d;
            });
          };

          const goToNextMonth = () => {
            const now = new Date();
            if (
              calendarMonth.getFullYear() === now.getFullYear() &&
              calendarMonth.getMonth() === now.getMonth()
            ) return;
            Haptics.selectionAsync();
            setSelectedDay(null);
            setCalendarMonth((prev) => {
              const d = new Date(prev);
              d.setMonth(d.getMonth() + 1);
              return d;
            });
          };

          const isCurrentMonth =
            calendarMonth.getFullYear() === new Date().getFullYear() &&
            calendarMonth.getMonth() === new Date().getMonth();

          return (
            <>
              <FadeIn delay={0}>
                {/* Month navigation */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
                  <TouchableOpacity onPress={goToPrevMonth} style={styles.monthNavBtn}>
                    <Text style={[typography.h4, { color: colors.primary }]}>‹</Text>
                  </TouchableOpacity>
                  <Text style={[typography.h4, { color: colors.text }]}>
                    {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                  </Text>
                  <TouchableOpacity
                    onPress={goToNextMonth}
                    style={[styles.monthNavBtn, isCurrentMonth && { opacity: 0.3 }]}
                    disabled={isCurrentMonth}
                  >
                    <Text style={[typography.h4, { color: colors.primary }]}>›</Text>
                  </TouchableOpacity>
                </View>

                {/* Day labels */}
                <View style={styles.calendarHeader}>
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                    <Text key={d} style={[typography.captionMedium, { color: colors.textSecondary, width: CELL_SIZE, textAlign: 'center' }]}>
                      {d}
                    </Text>
                  ))}
                </View>

                {/* Calendar grid */}
                <View style={styles.calendarGrid}>
                  {calDays.map((day, i) => {
                    const isSelected = day.dateStr && selectedDay === day.dateStr;
                    return (
                      <TouchableOpacity
                        key={i}
                        onPress={() => {
                          if (!day.date || !day.hasWorkout) return;
                          Haptics.selectionAsync();
                          setSelectedDay(isSelected ? null : day.dateStr);
                        }}
                        activeOpacity={day.hasWorkout ? 0.7 : 1}
                        style={[
                          styles.calendarCell,
                          day.isToday && { borderWidth: 2, borderColor: colors.primary },
                          day.hasWorkout && { backgroundColor: isSelected ? colors.success + '60' : colors.success + '30' },
                          isSelected && { borderWidth: 2, borderColor: colors.success },
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
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </FadeIn>

              {/* Selected day workouts */}
              {selectedDay && selectedDayWorkouts.length > 0 && (
                <FadeIn delay={0}>
                  <Card style={{ marginTop: spacing.xl }}>
                    <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                      {new Date(selectedDay + 'T12:00:00').toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        weekday: 'long',
                      })}
                    </Text>
                    {selectedDayWorkouts.map((w, i) => (
                      <View
                        key={w.id}
                        style={[
                          { paddingVertical: spacing.md },
                          i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
                        ]}
                      >
                        <Text style={[typography.bodySemibold, { color: colors.text }]}>{w.name}</Text>
                        <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                          {w.exercises.length} упр.
                          {w.durationMinutes ? ` · ${w.durationMinutes} мин` : ''}
                          {w.totalVolume ? ` · ${Math.round(w.totalVolume)} кг` : ''}
                        </Text>
                        {w.exercises.length > 0 && (
                          <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
                            {w.exercises.map((ex) => ex.exercise.name).join(', ')}
                          </Text>
                        )}
                      </View>
                    ))}
                  </Card>
                </FadeIn>
              )}

              {/* Monthly summary */}
              <FadeIn delay={150}>
                <Card style={{ marginTop: spacing.xl }}>
                  <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                    {MONTH_NAMES[calendarMonth.getMonth()]}
                  </Text>
                  {monthWorkouts.length === 0 ? (
                    <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                      Нет тренировок за этот месяц
                    </Text>
                  ) : (
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
                  )}
                </Card>
              </FadeIn>
            </>
          );
        })()}

        {tab === 'records' && (
          <>
            {/* Mine / Club toggle */}
            <FadeIn delay={0}>
              <View style={[styles.segmentControl, { backgroundColor: colors.surface }]}>
                {(['mine', 'club'] as const).map((v) => (
                  <TouchableOpacity
                    key={v}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setRecordsView(v);
                      if (v === 'club') fetchLeaderboard();
                    }}
                    style={[
                      styles.segmentBtn,
                      recordsView === v && { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={[typography.smallMedium, {
                      color: recordsView === v ? '#fff' : colors.textSecondary,
                    }]}>
                      {v === 'mine' ? 'Мои рекорды' : '🏆 Клуб'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FadeIn>

            {/* My records */}
            {recordsView === 'mine' && (
              personalRecords.length === 0 ? (
                <FadeIn>
                  <Card style={{ marginTop: spacing.lg }}>
                    <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                      Рекорды появятся после первых тренировок
                    </Text>
                  </Card>
                </FadeIn>
              ) : (
                (() => {
                const records = personalRecords;
                return records.map((record, i) => {
                  const isSelected = selectedExerciseId === record.exerciseId;
                  return (
                    <FadeIn key={record.exerciseId} delay={i * 60}>
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedExerciseId(isSelected ? null : record.exerciseId);
                        }}
                        activeOpacity={0.85}
                      >
                        <Card style={{
                          marginBottom: spacing.sm,
                          marginTop: i === 0 ? spacing.lg : 0,
                          borderWidth: isSelected ? 1.5 : 0,
                          borderColor: isSelected ? colors.accent : 'transparent',
                        }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Text style={[typography.bodySemibold, { color: colors.text, flex: 1 }]}>{record.name}</Text>
                            <Text style={[typography.caption, { color: isSelected ? colors.accent : colors.textTertiary, marginLeft: spacing.sm }]}>
                              {isSelected ? 'Скрыть ▲' : 'График ▼'}
                            </Text>
                          </View>
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
                          <View style={{ marginTop: spacing.sm }}>
                            <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface }}>
                              <View style={{
                                height: 4, borderRadius: 2, backgroundColor: colors.primary,
                                width: `${(record.estimated1RM / records[0].estimated1RM) * 100}%`,
                              }} />
                            </View>
                          </View>
                          {isSelected && oneRMHistory.length >= 2 && (
                            <View style={{ marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider }}>
                              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>
                                ДИНАМИКА ~1ПМ
                              </Text>
                              <LineChart
                                data={oneRMHistory.slice(-12)}
                                color={colors.accent}
                                colors={colors}
                                suffix=" кг"
                                height={130}
                              />
                            </View>
                          )}
                          {isSelected && oneRMHistory.length < 2 && (
                            <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
                              <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center' }]}>
                                Нужно минимум 2 тренировки с этим упражнением для графика
                              </Text>
                            </View>
                          )}
                        </Card>
                      </TouchableOpacity>
                    </FadeIn>
                  );
                });
              })()
              )
            )}

            {/* Strength Standards */}
            {recordsView === 'mine' && personalRecords.length > 0 && (() => {
              const bodyWeightKg = weightHistory.length > 0
                ? weightHistory[weightHistory.length - 1].weightKg
                : user?.weightKg || 80;

              const standardData = STRENGTH_STANDARDS.map((std) => {
                const pr = personalRecords.find((r) => r.exerciseId === std.exerciseId);
                if (!pr) return null;
                const ratio = pr.estimated1RM / bodyWeightKg;
                let levelIdx = 0;
                for (let li = 0; li < std.multipliers.length; li++) {
                  if (ratio >= std.multipliers[li]) levelIdx = li;
                }
                const nextMultiplier = std.multipliers[Math.min(levelIdx + 1, std.multipliers.length - 1)];
                const progress = levelIdx >= std.multipliers.length - 1
                  ? 1
                  : (ratio - std.multipliers[levelIdx]) / (nextMultiplier - std.multipliers[levelIdx]);
                return { ...std, pr: pr.estimated1RM, ratio: Math.round(ratio * 100) / 100, levelIdx, progress: Math.max(0, Math.min(1, progress)) };
              }).filter(Boolean) as { exerciseId: string; name: string; multipliers: number[]; pr: number; ratio: number; levelIdx: number; progress: number }[];

              if (standardData.length === 0) return null;

              return (
                <FadeIn delay={200}>
                  <Card style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
                    <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.xs }]}>
                      Стандарты силы
                    </Text>
                    <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
                      На основе твоего веса тела {bodyWeightKg} кг
                    </Text>
                    {standardData.map((item, idx) => (
                      <View key={item.exerciseId} style={idx < standardData.length - 1 ? { marginBottom: spacing.lg } : {}}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.xs }}>
                          <Text style={[typography.smallMedium, { color: colors.text }]}>{item.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                            <Text style={[typography.caption, { color: colors.textSecondary }]}>{item.pr} кг  ({item.ratio}×)</Text>
                            <View style={[{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }, { backgroundColor: LEVEL_COLORS[item.levelIdx] + '25' }]}>
                              <Text style={[typography.captionMedium, { color: LEVEL_COLORS[item.levelIdx], fontSize: 10 }]}>
                                {LEVEL_NAMES[item.levelIdx]}
                              </Text>
                            </View>
                          </View>
                        </View>
                        {/* Progress bar with 5 segments */}
                        <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 }}>
                          {item.multipliers.map((_, segIdx) => {
                            const filled = segIdx < item.levelIdx || (segIdx === item.levelIdx && item.progress > 0);
                            const partial = segIdx === item.levelIdx;
                            return (
                              <View key={segIdx} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 3, overflow: 'hidden' }}>
                                {filled && (
                                  <View style={{
                                    height: '100%',
                                    width: partial ? `${item.progress * 100}%` : '100%',
                                    backgroundColor: LEVEL_COLORS[Math.min(segIdx, LEVEL_COLORS.length - 1)],
                                    borderRadius: 3,
                                  }} />
                                )}
                              </View>
                            );
                          })}
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                          {item.multipliers.map((m, segIdx) => (
                            <Text key={segIdx} style={[typography.small, { color: colors.textTertiary, fontSize: 9 }]}>{m}×</Text>
                          ))}
                        </View>
                      </View>
                    ))}
                  </Card>
                </FadeIn>
              );
            })()}

            {/* Club leaderboard */}
            {recordsView === 'club' && (
              loadingLeaderboard ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
              ) : leaderboard.length === 0 ? (
                <FadeIn>
                  <Card style={{ marginTop: spacing.lg }}>
                    <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                      Рекорды клуба появятся когда участники завершат тренировки
                    </Text>
                  </Card>
                </FadeIn>
              ) : (
                <FadeIn delay={0}>
                  <Card style={{ marginTop: spacing.lg }}>
                    {leaderboard.slice(0, 30).map((entry, i) => (
                      <View
                        key={i}
                        style={[
                          { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
                          i < leaderboard.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                        ]}
                      >
                        <Text style={[typography.numberSmall, {
                          color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : colors.textTertiary,
                          width: 32,
                          textAlign: 'center',
                          fontSize: i < 3 ? 18 : 14,
                        }]}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                        </Text>
                        <View style={{ flex: 1, marginLeft: spacing.sm }}>
                          <Text style={[typography.bodySemibold, { color: colors.text }]}>{entry.exerciseName}</Text>
                          <Text style={[typography.small, { color: colors.textSecondary }]}>
                            {entry.userName} • {entry.weightKg} кг × {entry.reps}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[typography.numberSmall, { color: colors.accent, fontSize: 16 }]}>
                            {entry.estimated1RM} кг
                          </Text>
                          <Text style={[typography.small, { color: colors.textTertiary }]}>~1ПМ</Text>
                        </View>
                      </View>
                    ))}
                  </Card>
                </FadeIn>
              )
            )}
          </>
        )}

        {tab === 'weight' && (
          <>
            {/* Current weight + add button */}
            <FadeIn delay={0}>
              <Card style={{ marginBottom: spacing.lg }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>Текущий вес</Text>
                    <Text style={[typography.h1, { color: colors.primary, marginTop: 2 }]}>
                      {weightHistory.length > 0
                        ? `${weightHistory[weightHistory.length - 1].weightKg} кг`
                        : user?.weightKg ? `${user.weightKg} кг` : '— кг'}
                    </Text>
                    {weightHistory.length >= 2 && (() => {
                      const diff = weightHistory[weightHistory.length - 1].weightKg - weightHistory[weightHistory.length - 2].weightKg;
                      const sign = diff > 0 ? '+' : '';
                      const color = diff < 0 ? colors.success : diff > 0 ? colors.error : colors.textSecondary;
                      return (
                        <Text style={[typography.small, { color, marginTop: 2 }]}>
                          {sign}{diff.toFixed(1)} кг с прошлого замера
                        </Text>
                      );
                    })()}
                  </View>
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowWeightModal(true); }}
                    style={[styles.addWeightBtn, { backgroundColor: colors.primary }]}
                  >
                    <Text style={{ color: '#fff', fontSize: 22, lineHeight: 26 }}>+</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            </FadeIn>

            {/* Weight chart */}
            {loadingWeight ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : weightHistory.length >= 2 ? (
              <FadeIn delay={100}>
                <Card style={{ marginBottom: spacing.lg }}>
                  <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                    Динамика веса
                  </Text>
                  <LineChart
                    data={weightHistory.slice(-12).map((w) => ({
                      label: new Date(w.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''),
                      value: w.weightKg,
                    }))}
                    color={colors.primary}
                    colors={colors}
                    suffix=" кг"
                    height={140}
                  />
                </Card>
              </FadeIn>
            ) : weightHistory.length === 0 && !loadingWeight ? (
              <FadeIn delay={100}>
                <Card style={{ marginBottom: spacing.lg }}>
                  <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                    Добавь первый замер, чтобы отслеживать динамику
                  </Text>
                </Card>
              </FadeIn>
            ) : null}

            {/* Weight history list */}
            {weightHistory.length > 0 && (
              <FadeIn delay={200}>
                <Card style={{ marginBottom: spacing.lg }}>
                  <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                    История замеров
                  </Text>
                  {[...weightHistory].reverse().slice(0, 20).map((entry, i) => (
                    <View
                      key={i}
                      style={[
                        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
                        i < Math.min(weightHistory.length, 20) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                      ]}
                    >
                      <Text style={[typography.body, { color: colors.text }]}>
                        {new Date(entry.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                      </Text>
                      <Text style={[typography.bodySemibold, { color: colors.primary }]}>
                        {entry.weightKg} кг
                      </Text>
                    </View>
                  ))}
                </Card>
              </FadeIn>
            )}

            {/* Body measurements section */}
            <FadeIn delay={250}>
              <Card style={{ marginBottom: spacing.lg }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <Text style={[typography.h4, { color: colors.text }]}>Обхваты тела</Text>
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowMeasurementModal(true); }}
                    style={[{ backgroundColor: colors.accent + '15', paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.accent + '40' }]}
                  >
                    <Text style={[typography.captionMedium, { color: colors.accent }]}>+ Замер</Text>
                  </TouchableOpacity>
                </View>

                {measurementHistory.length === 0 ? (
                  <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.md }]}>
                    Добавь первый замер обхватов
                  </Text>
                ) : (() => {
                  const latest = measurementHistory[measurementHistory.length - 1];
                  const prev = measurementHistory.length >= 2 ? measurementHistory[measurementHistory.length - 2] : null;
                  return (
                    <>
                      <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                        {new Date(latest.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                        {MEASUREMENT_FIELDS.filter(({ key }) => latest[key] != null).map(({ key, label, emoji }) => {
                          const val = latest[key] as number;
                          const prevVal = prev?.[key] as number | undefined;
                          const diff = prevVal != null ? val - prevVal : null;
                          return (
                            <View
                              key={key}
                              style={[{ backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.sm, minWidth: 90, alignItems: 'center' }]}
                            >
                              <Text style={{ fontSize: 16 }}>{emoji}</Text>
                              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{label}</Text>
                              <Text style={[typography.bodySemibold, { color: colors.primary }]}>{val} см</Text>
                              {diff != null && diff !== 0 && (
                                <Text style={[typography.caption, { color: diff < 0 ? colors.success : colors.error, fontSize: 10 }]}>
                                  {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>

                      {measurementHistory.length >= 2 && (
                        <TouchableOpacity
                          onPress={() => {
                            Alert.alert(
                              'История замеров',
                              [...measurementHistory].reverse().slice(0, 10).map((m) => {
                                const parts = MEASUREMENT_FIELDS
                                  .filter(({ key }) => m[key] != null)
                                  .map(({ key, label }) => `${label}: ${m[key]} см`);
                                return `${new Date(m.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}\n${parts.join(', ')}`;
                              }).join('\n\n')
                            );
                          }}
                          style={{ marginTop: spacing.md }}
                        >
                          <Text style={[typography.caption, { color: colors.primary, textAlign: 'center' }]}>
                            История ({measurementHistory.length} замеров) ›
                          </Text>
                        </TouchableOpacity>
                      )}
                    </>
                  );
                })()}
              </Card>
            </FadeIn>
          </>
        )}

        {tab === 'achievements' && (
          <>
            <FadeIn delay={0}>
              <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                <Text style={{ fontSize: 48 }}>🏅</Text>
                <Text style={[typography.h3, { color: colors.text, marginTop: spacing.md }]}>
                  Достижения
                </Text>
                <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                  {unlockedCount} из {ACHIEVEMENT_DEFINITIONS.length} получено
                </Text>
                <View style={[styles.achievementProgressBar, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.achievementProgressFill,
                      {
                        backgroundColor: colors.accent,
                        width: `${(unlockedCount / ACHIEVEMENT_DEFINITIONS.length) * 100}%` as any,
                      },
                    ]}
                  />
                </View>
              </View>
            </FadeIn>
            {(['workout', 'strength', 'streak', 'exploration', 'nutrition'] as const).map((cat) => {
              const catAchievements = achievements.filter((a) => a.category === cat);
              const catLabels: Record<string, string> = {
                workout: '💪 Тренировки',
                strength: '🏋️ Сила',
                streak: '🔥 Серии',
                exploration: '🌟 Разнообразие',
                nutrition: '🥗 Питание',
              };
              return (
                <FadeIn key={cat} delay={80}>
                  <Text
                    style={[
                      typography.h4,
                      { color: colors.text, marginBottom: spacing.md, marginTop: spacing.lg },
                    ]}
                  >
                    {catLabels[cat]}
                  </Text>
                  {catAchievements.map((a) => (
                    <Card key={a.id} style={{ marginBottom: spacing.sm, opacity: a.unlocked ? 1 : 0.55 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                        <View
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: a.unlocked ? colors.accent + '20' : colors.border + '60',
                          }}
                        >
                          <Text style={{ fontSize: 24 }}>{a.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              typography.bodySemibold,
                              { color: a.unlocked ? colors.text : colors.textSecondary },
                            ]}
                          >
                            {a.title}
                          </Text>
                          <Text
                            style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}
                          >
                            {a.description}
                          </Text>
                          {!a.unlocked && a.progress !== undefined && (
                            <>
                              <View
                                style={{
                                  height: 4,
                                  borderRadius: 2,
                                  backgroundColor: colors.border,
                                  marginTop: spacing.sm,
                                }}
                              >
                                <View
                                  style={{
                                    height: 4,
                                    borderRadius: 2,
                                    backgroundColor: colors.accent,
                                    width: `${a.progress * 100}%` as any,
                                  }}
                                />
                              </View>
                              <Text
                                style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}
                              >
                                {a.progressLabel}
                              </Text>
                            </>
                          )}
                        </View>
                        {a.unlocked && <Text style={{ fontSize: 20 }}>✅</Text>}
                      </View>
                    </Card>
                  ))}
                </FadeIn>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Add measurements modal */}
      <Modal visible={showMeasurementModal} transparent animationType="slide" onRequestClose={() => setShowMeasurementModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderRadius: 0, paddingBottom: 48 }]}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>Замер обхватов</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.lg }]}>Заполни только те поля, которые хочешь отследить</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {MEASUREMENT_FIELDS.map(({ key, label, emoji }) => (
                <View key={key} style={{ marginBottom: spacing.md }}>
                  <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
                    {emoji} {label.toUpperCase()}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <TextInput
                      style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText, flex: 1 }]}
                      value={newMeasurements[key] ?? ''}
                      onChangeText={(v) => setNewMeasurements((prev) => ({ ...prev, [key]: v }))}
                      placeholder="—"
                      placeholderTextColor={colors.inputPlaceholder}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />
                    <Text style={[typography.body, { color: colors.textSecondary }]}>см</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
              <TouchableOpacity
                onPress={() => { setShowMeasurementModal(false); setNewMeasurements({}); }}
                style={[styles.modalBtn, { backgroundColor: colors.surface, flex: 1 }]}
              >
                <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddMeasurements}
                disabled={savingMeasurements}
                style={[styles.modalBtn, { backgroundColor: colors.accent, flex: 1 }]}
              >
                {savingMeasurements
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[typography.bodyMedium, { color: '#fff' }]}>Сохранить</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add weight modal */}
      <Modal visible={showWeightModal} transparent animationType="fade" onRequestClose={() => setShowWeightModal(false)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.md }]}>
              Записать вес
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <TextInput
                style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
                value={newWeight}
                onChangeText={setNewWeight}
                placeholder="85.5"
                placeholderTextColor={colors.inputPlaceholder}
                keyboardType="decimal-pad"
                autoFocus
                maxLength={6}
              />
              <Text style={[typography.h4, { color: colors.textSecondary }]}>кг</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
              <TouchableOpacity
                onPress={() => { setShowWeightModal(false); setNewWeight(''); }}
                style={[styles.modalBtn, { backgroundColor: colors.surface, flex: 1 }]}
              >
                <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddWeight}
                disabled={savingWeight}
                style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]}
              >
                {savingWeight
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[typography.bodyMedium, { color: '#fff' }]}>Сохранить</Text>
                }
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </Modal>
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
  monthNavBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
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
  segmentControl: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    padding: 3,
    marginBottom: spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  addWeightBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalCard: { padding: spacing.xl },
  achievementProgressBar: {
    height: 6,
    borderRadius: 3,
    width: '70%',
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  achievementProgressFill: {
    height: 6,
    borderRadius: 3,
  },
  weightInput: {
    flex: 1,
    height: 52,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalBtn: {
    height: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
