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
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
  fullWidth = false,
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  const getContainerStyle = (): ViewStyle => {
    const base: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.md,
      ...(fullWidth && { width: '100%' }),
    };

    const sizes: Record<string, ViewStyle> = {
      sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
      md: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl },
      lg: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl },
    };

    const variants: Record<string, ViewStyle> = {
      primary: { backgroundColor: colors.primary },
      secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
      outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
      ghost: { backgroundColor: 'transparent' },
    };

    return { ...base, ...sizes[size], ...variants[variant] };
  };

  const getTextStyle = (): TextStyle => {
    const variants: Record<string, TextStyle> = {
      primary: { color: '#FFFFFF' },
      secondary: { color: colors.text },
      outline: { color: colors.primary },
      ghost: { color: colors.primary },
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
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? '#FFFFFF' : colors.primary}
          size="small"
        />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text style={[getTextStyle(), icon ? { marginLeft: spacing.sm } : undefined, textStyle]}>
            {title}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
};
