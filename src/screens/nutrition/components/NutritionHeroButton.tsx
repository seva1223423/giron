import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeColors } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  onPress: () => void;
}

/**
 * Sticky-feel HERO call-to-action mounted under the nutrition header.
 *
 * Opens the FoodScanner — primary entry point for logging meals via
 * AI photo recognition or barcode. Shadow stack mirrors the gold tab-bar
 * center pill in `AppNavigator.tsx` (offset 0/10, opacity 0.33, radius 20).
 *
 * Inner icon-circle background = `colors.background` (NOT primary tint —
 * it has zero contrast on a gold button); icon stroke = `colors.primary`.
 */
export const NutritionHeroButton: React.FC<Props> = ({ onPress }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();

  return (
    <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => { haptic.selection(); onPress(); }}
        accessibilityRole="button"
        accessibilityLabel="Сканировать еду"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: colors.primary,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.xl,
          borderRadius: borderRadius.xl,
          ...(Platform.OS === 'ios'
            ? {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.33,
                shadowRadius: 20,
              }
            : {
                elevation: 8,
              }),
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: borderRadius.md,
            backgroundColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="camera" size={24} color={colors.primary} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodySemibold, { color: colors.textInverse }]}>Сканировать еду</Text>
          <Text
            style={[typography.caption, { color: colors.textInverse, opacity: 0.75, marginTop: 2 }]}
            numberOfLines={1}
          >
            Распознавание по фото или штрих-коду
          </Text>
        </View>
        <Icon name="chev" size={20} color={colors.textInverse} strokeWidth={2.4} />
      </TouchableOpacity>
    </View>
  );
};
