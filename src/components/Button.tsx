import React, { useCallback } from 'react';
import {
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../store';
import { typography } from '../theme';
import { borderRadius, spacing } from '../theme/spacing';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
  hapticStyle?: 'light' | 'medium' | 'heavy' | 'none';
  /** Override the VoiceOver label. Defaults to the visible `title`, which
   *  reads wrong for emoji-only or icon-heavy button titles. */
  accessibilityLabel?: string;
  /** Extra VoiceOver hint read after the label — use for secondary context
   *  (e.g. "Откроет камеру для анализа ИИ"). */
  accessibilityHint?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconRight,
  style,
  textStyle,
  fullWidth = false,
  hapticStyle = 'light',
  accessibilityLabel,
  accessibilityHint,
}) => {
  const { colors } = useThemeStore();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  }, []);

  const handlePress = useCallback(() => {
    if (hapticStyle === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (hapticStyle === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (hapticStyle === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onPress();
  }, [onPress, hapticStyle]);

  const getContainerStyle = (): ViewStyle => {
    // Direction A rounds buttons generously — 20pt on the primary CTA
    // is the design spec (tokens.A, `buttons` in the onboarding/paywall
    // screens). Smaller buttons shrink to 16pt to stay proportional.
    const base: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: size === 'lg' ? borderRadius.xl : borderRadius.lg,
      ...(fullWidth && { width: '100%' }),
    };

    const sizes: Record<string, ViewStyle> = {
      sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 36 },
      md: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl, minHeight: 44 },
      // lg = 58 in design; tall premium pill for onboarding / paywall CTAs
      lg: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, minHeight: 58 },
    };

    const variants: Record<string, ViewStyle> = {
      primary: { backgroundColor: disabled ? colors.textTertiary : colors.primary },
      secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: disabled ? colors.border : colors.border },
      // Outline: subtle gold fill + gold border + gold text. Keeps brand
      // presence without competing with the solid primary.
      outline: { backgroundColor: disabled ? 'transparent' : colors.primary + '15', borderWidth: 1, borderColor: disabled ? colors.textTertiary : colors.primary + '60' },
      ghost: { backgroundColor: 'transparent' },
      danger: { backgroundColor: disabled ? colors.textTertiary : colors.error },
    };

    return { ...base, ...sizes[size], ...variants[variant] };
  };

  const getTextStyle = (): TextStyle => {
    // Premium primary button = gold background with DARK foreground text
    // (design spec: `color: '#0A0A0A'` on the gold pill). White-on-gold
    // is low-contrast and reads as cheap. `textInverse` is dark in dark
    // mode and cream in light mode — exactly what we want on the gold.
    const variants: Record<string, TextStyle> = {
      primary: { color: colors.textInverse },
      secondary: { color: disabled ? colors.textTertiary : colors.text },
      outline: { color: disabled ? colors.textTertiary : colors.primary },
      ghost: { color: disabled ? colors.textTertiary : colors.primary },
      // Danger keeps white on terracotta — the red needs max contrast.
      danger: { color: '#FFFFFF' },
    };

    const sizes: Record<string, TextStyle> = {
      sm: typography.buttonSmall,
      md: typography.button,
      lg: typography.button,
    };

    return { ...sizes[size], ...variants[variant] };
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[
        animatedStyle,
        getContainerStyle(),
        disabled && { opacity: 0.6 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.textInverse : variant === 'danger' ? '#FFFFFF' : colors.primary}
          size="small"
        />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text style={[getTextStyle(), (icon || iconRight) ? { marginHorizontal: spacing.sm } : undefined, textStyle]} numberOfLines={2}>
            {title}
          </Text>
          {iconRight && <>{iconRight}</>}
        </>
      )}
    </AnimatedPressable>
  );
};
