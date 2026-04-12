import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useWorkoutStore, useAuthStore, useNutritionStore, useMeasurementsStore } from '../../store';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { computeAchievements } from '../../utils/achievements';
import {
  OverviewTab,
  RecordsTab,
  SleepTab,
  ActivityTab,
  BodyTab,
} from './components';

type TabKey = 'overview' | 'activity' | 'body' | 'records' | 'sleep';

export const ProgressScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { workoutHistory } = useWorkoutStore();
  const { user } = useAuthStore();
  const { dailyLog } = useNutritionStore();
  const { syncFromServer: syncMeasurements } = useMeasurementsStore();
  const [tab, setTab] = useState<TabKey>('overview');

  useEffect(() => { syncMeasurements().catch(() => {}); }, []);

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
      } else if (i > 0) break;
    }
    return s;
  }, [workoutHistory]);

  const nutritionDaysLogged = useMemo(() =>
    Object.values(dailyLog).filter((d) => d.meals.length > 0).length,
  [dailyLog]);

  const achievements = useMemo(() =>
    computeAchievements({ workoutHistory, nutritionDaysLogged, currentStreak: streak }),
  [workoutHistory, nutritionDaysLogged, streak]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'activity', label: 'Активность' },
    { key: 'body', label: 'Тело' },
    { key: 'records', label: 'Рекорды' },
    { key: 'sleep', label: 'Сон' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.h2, { color: colors.text, paddingHorizontal: spacing.xl, paddingTop: safeTop, paddingBottom: spacing.md }]}>
        Прогресс
      </Text>

      {/* Tab bar */}
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
        {tab === 'overview' && <OverviewTab colors={colors} workoutHistory={workoutHistory} navigation={navigation} />}
        {tab === 'activity' && <ActivityTab colors={colors} workoutHistory={workoutHistory} />}
        {tab === 'body' && <BodyTab colors={colors} user={user} />}
        {tab === 'records' && (
          <RecordsTab
            colors={colors}
            workoutHistory={workoutHistory}
            user={user}
            achievements={achievements}
            unlockedCount={unlockedCount}
          />
        )}
        {tab === 'sleep' && <SleepTab colors={colors} />}
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
