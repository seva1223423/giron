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
    const base: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.md,
      ...(fullWidth && { width: '100%' }),
    };

    const sizes: Record<string, ViewStyle> = {
      sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 36 },
      md: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl, minHeight: 44 },
      lg: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, minHeight: 52 },
    };

    const variants: Record<string, ViewStyle> = {
      primary: { backgroundColor: disabled ? colors.textTertiary : colors.primary },
      secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: disabled ? colors.border : colors.border },
      outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: disabled ? colors.textTertiary : colors.primary },
      ghost: { backgroundColor: 'transparent' },
      danger: { backgroundColor: disabled ? colors.textTertiary : colors.error },
    };

    return { ...base, ...sizes[size], ...variants[variant] };
  };

  const getTextStyle = (): TextStyle => {
    const variants: Record<string, TextStyle> = {
      primary: { color: '#FFFFFF' },
      secondary: { color: disabled ? colors.textTertiary : colors.text },
      outline: { color: disabled ? colors.textTertiary : colors.primary },
      ghost: { color: disabled ? colors.textTertiary : colors.primary },
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
      style={[
        animatedStyle,
        getContainerStyle(),
        disabled && { opacity: 0.6 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'danger' ? '#FFFFFF' : colors.primary}
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
