import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore, useAuthStore, useNutritionStore } from '../../store';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { computeAchievements, ACHIEVEMENT_DEFINITIONS } from '../../utils/achievements';
import {
  OverviewTab,
  CalendarTab,
  AchievementsTab,
  RecordsTab,
  WeightTab,
  PhotosTab,
} from './components';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TabKey = 'overview' | 'calendar' | 'records' | 'weight' | 'achievements' | 'photos';

export const ProgressScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { workoutHistory } = useWorkoutStore();
  const { user } = useAuthStore();
  const { dailyLog } = useNutritionStore();
  const [tab, setTab] = useState<TabKey>('overview');

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
      weeks.push({ label: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`, value: Math.round(volume) });
    }
    return weeks;
  }, [workoutHistory]);

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
      weeks.push({ label: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`, value: count });
    }
    return weeks;
  }, [workoutHistory]);

  const durationTrend = useMemo(() => {
    return workoutHistory
      .slice(0, 10)
      .reverse()
      .map((w, i) => ({ label: `${i + 1}`, value: w.durationMinutes || 0 }));
  }, [workoutHistory]);

  const workoutDates = useMemo(() => {
    return workoutHistory.filter((w) => w.completedAt).map((w) => w.completedAt!);
  }, [workoutHistory]);

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

  const nutritionDaysLogged = useMemo(() => {
    return Object.values(dailyLog).filter((d) => d.meals.length > 0).length;
  }, [dailyLog]);

  const achievements = useMemo(() =>
    computeAchievements({ workoutHistory, nutritionDaysLogged, currentStreak: streak }),
  [workoutHistory, nutritionDaysLogged, streak]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const tabs = [
    { key: 'overview' as const, label: 'Обзор' },
    { key: 'calendar' as const, label: 'Календарь' },
    { key: 'records' as const, label: 'Рекорды' },
    { key: 'weight' as const, label: 'Вес тела' },
    { key: 'achievements' as const, label: `🏅 ${unlockedCount}/${ACHIEVEMENT_DEFINITIONS.length}` },
    { key: 'photos' as const, label: '📸 Фото' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.h2, { color: colors.text, paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md }]}>
        Прогресс
      </Text>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        contentContainerStyle={styles.tabs}
      >
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => { haptic.selection(); setTab(t.key); }}
            style={[styles.tab, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[typography.smallMedium, { color: tab === t.key ? colors.primary : colors.textSecondary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'overview' && (
          <OverviewTab
            colors={colors}
            totalWorkouts={totalWorkouts}
            streak={streak}
            totalVolume={totalVolume}
            totalDuration={totalDuration}
            workoutDates={workoutDates}
            weeklyVolumeData={weeklyVolumeData}
            weeklyCountData={weeklyCountData}
            muscleDistribution={muscleDistribution}
            durationTrend={durationTrend}
            workoutHistory={workoutHistory}
          />
        )}

        {tab === 'calendar' && (
          <CalendarTab colors={colors} workoutHistory={workoutHistory} />
        )}

        {tab === 'records' && (
          <RecordsTab colors={colors} workoutHistory={workoutHistory} user={user} />
        )}

        {tab === 'weight' && (
          <WeightTab colors={colors} user={user} />
        )}

        {tab === 'photos' && (
          <PhotosTab colors={colors} />
        )}

        {tab === 'achievements' && (
          <AchievementsTab colors={colors} achievements={achievements} unlockedCount={unlockedCount} />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.xl },
  tab: { paddingVertical: spacing.md, marginRight: spacing.xl },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
});
