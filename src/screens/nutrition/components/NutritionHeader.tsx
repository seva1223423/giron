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
 * Nutrition screen header — Direction A.
 *
 * Mirrors the WorkoutsHeader pattern: title + search icon + menu icon.
 * Replaces the legacy "Цели" pill row plus 4-pill nav bar with a sticky
 * HERO scan button and an inline utility menu.
 */
export const NutritionHeader: React.FC<Props> = ({ onSearchPress, onMenuPress }) => {
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
        <Text style={[typography.h2, { color: colors.text }]}>Питание</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TouchableOpacity
            onPress={() => { haptic.selection(); onSearchPress(); }}
            style={iconBtnStyle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Поиск рецептов"
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
