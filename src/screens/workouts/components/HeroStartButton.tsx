import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeColors } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  hasActiveWorkout: boolean;
  subtitle?: string;
  onPress: () => void;
}

/**
 * Sticky-feel HERO call-to-action mounted under the header.
 *
 * Switches between "Начать тренировку" and "Продолжить тренировку"
 * based on whether `useWorkoutStore` has an `activeWorkout`.
 *
 * Shadow stack mirrors the gold tab-bar center pill in
 * `AppNavigator.tsx` (offset 0/10, opacity 0.33, radius 20).
 */
export const HeroStartButton: React.FC<Props> = ({ hasActiveWorkout, subtitle, onPress }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();

  const title = hasActiveWorkout ? 'Продолжить тренировку' : 'Начать тренировку';
  const hint = subtitle ?? (hasActiveWorkout ? undefined : 'Свободная тренировка');

  return (
    <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => { haptic.selection(); onPress(); }}
        accessibilityRole="button"
        accessibilityLabel={title}
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
          <Icon
            name={hasActiveWorkout ? 'play' : 'dumbbell'}
            size={24}
            color={colors.primary}
            strokeWidth={2.2}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodySemibold, { color: colors.textInverse }]}>{title}</Text>
          {hint ? (
            <Text
              style={[typography.caption, { color: colors.textInverse, opacity: 0.75, marginTop: 2 }]}
              numberOfLines={1}
            >
              {hint}
            </Text>
          ) : null}
        </View>
        <Icon name="chev" size={20} color={colors.textInverse} strokeWidth={2.4} />
      </TouchableOpacity>
    </View>
  );
};
