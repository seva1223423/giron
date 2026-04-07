import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useThemeStore, useWorkoutStore } from '../../store';
import { spacing } from '../../theme/spacing';
import {
  WorkoutsHeader,
  WorkoutsTabBar,
  WorkoutsTab,
  QuickStartTab,
  ProgramsTab,
  ExercisesTab,
} from './components';

export const WorkoutsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { fetchPrograms } = useWorkoutStore();
  const [tab, setTab] = useState<WorkoutsTab>('quick');

  useEffect(() => {
    fetchPrograms();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WorkoutsHeader navigation={navigation} />
      <WorkoutsTabBar activeTab={tab} onTabChange={setTab} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'quick' && <QuickStartTab navigation={navigation} />}
        {tab === 'programs' && <ProgramsTab navigation={navigation} />}
        {tab === 'exercises' && <ExercisesTab navigation={navigation} />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
});
