import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useWorkoutStore, useThemeColors } from '../../store';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import {
  WorkoutsHeader,
  WorkoutsTabBar,
  WorkoutsTab,
  QuickStartTab,
  ProgramsTab,
  HeroStartButton,
  HistoryTab,
  UtilityMenu,
} from './components';

/**
 * Workouts root screen — round 287 layout simplification.
 *
 *   Header (title + 🔍 + ⋮)
 *   HeroStartButton  (Начать / Продолжить)
 *   TabBar           (План / История)
 *   ─ План tab    → QuickStartTab + ProgramsTab in one scroll column
 *   ─ История tab → 4 nav cards (calendar, history, PRs, routines)
 *   ⋮ menu          → inline panel with 6 utility shortcuts
 */
export const WorkoutsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const colors = useThemeColors();
  const { fetchPrograms, activeWorkout } = useWorkoutStore();
  const [tab, setTab] = useState<WorkoutsTab>('plan');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetchPrograms();
  }, []);

  const handleHeroPress = () => {
    if (activeWorkout) {
      navigation.navigate('ActiveWorkout');
    } else {
      navigation.navigate('CustomWorkout');
    }
  };

  // TODO: dedicated exercise search screen — currently routes to Routines list as a placeholder browse target.
  const handleSearchPress = () => navigation.navigate('ExerciseSearch');

  const heroSubtitle = activeWorkout
    ? activeWorkout.workout.name || 'Идёт тренировка'
    : undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WorkoutsHeader
        onSearchPress={handleSearchPress}
        onMenuPress={() => setMenuOpen((v) => !v)}
      />
      <HeroStartButton
        hasActiveWorkout={!!activeWorkout}
        subtitle={heroSubtitle}
        onPress={handleHeroPress}
      />
      <WorkoutsTabBar activeTab={tab} onTabChange={setTab} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'plan' ? (
          <>
            <QuickStartTab navigation={navigation} />
            <View style={[styles.sectionDivider, { borderTopColor: colors.border }]}>
              <Text style={[typography.h4, { color: colors.text }]}>Готовые программы</Text>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                Подбери под свою цель
              </Text>
            </View>
            <ProgramsTab navigation={navigation} />
          </>
        ) : (
          <HistoryTab navigation={navigation} />
        )}
      </ScrollView>
      <UtilityMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={(screen) => navigation.navigate(screen)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  sectionDivider: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    marginBottom: spacing.md,
    borderTopWidth: 1,
  },
});
