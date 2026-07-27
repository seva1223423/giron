import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors } from '../../store';
import { AnimatedPressable, Icon } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { ProgramsTab } from './components';

/**
 * The full program library, reached from the "все 25" link on the shelf.
 *
 * It is the old Программы tab, unchanged, given its own screen. The shelf on
 * the workouts screen shows enough to pick from at a glance; someone who
 * wants to filter by goal and level came here on purpose.
 */
export const ProgramLibraryScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();
  const safeTop = useSafeTop();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: safeTop + spacing.sm, borderBottomColor: colors.border }]}>
        <AnimatedPressable
          onPress={() => { haptic.selection(); navigation.goBack(); }}
          haptic={false}
          scaleDown={0.9}
          style={styles.back as any}
          accessibilityRole="button"
          accessibilityLabel="Назад"
        >
          <Icon name="chev" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text style={[typography.h3, { color: colors.text }]}>Библиотека программ</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ProgramsTab navigation={navigation} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
});
