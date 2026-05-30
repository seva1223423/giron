import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors } from '../../store';
import { Icon } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { ExercisesTab } from './components/ExercisesTab';

interface Props {
  navigation: any;
  route?: { params?: { focusSearch?: boolean } };
}

/**
 * ExerciseLibraryScreen — Phase 3 wiring of the previously orphaned
 * `ExercisesTab` component.
 *
 * Provides a dedicated header ("Библиотека упражнений") with a back
 * button and delegates the list itself (search input + muscle/equipment
 * filters + favorites) to the existing `ExercisesTab` (239 LOC,
 * production-ready, was just never plugged in until Phase 3).
 *
 * Search routing: `WorkoutsScreen.handleSearchPress` used to navigate
 * to `Routines` (placeholder) — it now lands here, which actually
 * searches *упражнения*.
 */
export const ExerciseLibraryScreen: React.FC<Props> = ({ navigation }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();
  const safeTop = useSafeTop();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: safeTop, borderBottomColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <TouchableOpacity
          onPress={() => { haptic.selection(); navigation.goBack(); }}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[
            styles.backBtn,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <Icon name="chev" size={20} color={colors.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text, flex: 1, marginLeft: spacing.md }]}>
          Библиотека упражнений
        </Text>
      </View>

      <ExercisesTab navigation={navigation} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
