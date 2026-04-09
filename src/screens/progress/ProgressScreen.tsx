import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
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

type TabKey = 'overview' | 'calendar' | 'records' | 'weight' | 'achievements' | 'photos';

export const ProgressScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { workoutHistory } = useWorkoutStore();
  const { user } = useAuthStore();
  const { dailyLog } = useNutritionStore();
  const [tab, setTab] = useState<TabKey>('overview');

  // Achievements need streak + nutritionDays — shared across tabs header
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
      <Text style={[typography.h2, { color: colors.text, paddingHorizontal: spacing.xl, paddingTop: safeTop, paddingBottom: spacing.md }]}>
        Прогресс
      </Text>

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
        {tab === 'calendar' && <CalendarTab colors={colors} workoutHistory={workoutHistory} />}
        {tab === 'records' && <RecordsTab colors={colors} workoutHistory={workoutHistory} user={user} />}
        {tab === 'weight' && <WeightTab colors={colors} user={user} />}
        {tab === 'photos' && <PhotosTab colors={colors} />}
        {tab === 'achievements' && <AchievementsTab colors={colors} achievements={achievements} unlockedCount={unlockedCount} />}
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
