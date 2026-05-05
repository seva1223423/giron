import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { useThemeColors } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  onSearchPress: () => void;
  onMenuPress: () => void;
}

/**
 * Workouts screen header — Direction A.
 *
 * After the layout simplification (round 287) the pill row of 8 shortcuts
 * was retired in favour of a sticky HERO start button + utility menu.
 * The header now carries only the title and two icon buttons:
 *
 *   "Тренировки"            🔍   ⋮
 *
 * Search currently routes to the Routines list as a placeholder browse
 * target until a dedicated exercise search screen is added.
 */
export const WorkoutsHeader: React.FC<Props> = ({ onSearchPress, onMenuPress }) => {
  const safeTop = useSafeTop();
  const colors = useThemeColors();
  const haptic = useHaptic();

  const iconBtnStyle = {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <View style={{ paddingTop: safeTop, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          paddingTop: spacing.md,
        }}
      >
        <Text style={[typography.h2, { color: colors.text }]}>Тренировки</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TouchableOpacity
            onPress={() => { haptic.selection(); onSearchPress(); }}
            style={iconBtnStyle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Поиск упражнений"
            accessibilityRole="button"
          >
            <Icon name="search" size={20} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { haptic.selection(); onMenuPress(); }}
            style={iconBtnStyle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Меню инструментов"
            accessibilityRole="button"
          >
            <Icon name="more" size={20} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
