import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useWorkoutStore, useThemeColors } from '../../store';
import { spacing } from '../../theme/spacing';
import {
  WorkoutsHeader,
  WorkoutsTabBar,
  WorkoutsTab,
  QuickStartTab,
  ProgramsTab,
  HeroStartButton,
  ExercisesTab,
  UtilityMenu,
} from './components';

/**
 * Workouts root screen — Phase 3 unified mental model.
 *
 *   Header (title + 🔍 + ⋮)              🔍 → ExerciseLibrary (was Routines)
 *   HeroStartButton  (Начать / Продолжить)
 *   TabBar           (Начать / Программы / Библиотека)
 *   ─ Начать tab       → QuickStartTab (saved templates + ready bundles)
 *   ─ Программы tab    → ProgramsTab with «Создать программу» gold CTA
 *   ─ Библиотека tab   → ExercisesTab (search/filter/favorites)
 *   ⋮ menu             → inline panel with 2 groups
 *                         (Инструменты + Логирование)
 *
 * "История" tab was removed in Phase 3 — its surfaces (Calendar, History,
 * PRs) are reachable via the ⋮ menu and from the Home screen. Removing
 * it brings cognitive density from 13 → ~5 sections.
 */
export const WorkoutsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const colors = useThemeColors();
  const { fetchPrograms, activeWorkout } = useWorkoutStore();
  const [tab, setTab] = useState<WorkoutsTab>('start');
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

  // Phase 3: 🔍 now routes to the dedicated ExerciseLibrary screen
  // (previously pointed at Routines as a placeholder).
  const handleSearchPress = () => navigation.navigate('ExerciseLibrary', { focusSearch: true });

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
      {tab === 'library' ? (
        // ExercisesTab renders its own FlatList — don't wrap in ScrollView.
        <ExercisesTab navigation={navigation} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {tab === 'start' && <QuickStartTab navigation={navigation} />}
          {tab === 'programs' && <ProgramsTab navigation={navigation} />}
        </ScrollView>
      )}
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
});
