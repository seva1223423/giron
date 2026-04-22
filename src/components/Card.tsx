import React, { useCallback } from 'react';
import { View, ViewStyle, StyleProp, Pressable, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../store';
import { borderRadius, spacing } from '../theme/spacing';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padding?: number;
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  onPress,
  padding = spacing.lg,
  elevated = false,
}) => {
  const { colors } = useThemeStore();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 400 });
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  }, []);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  }, [onPress]);

  // Direction A uses generous 18-24pt radii on all card surfaces (home
  // tiles, paywall plans, quick actions). Bumping the default one step
  // from lg (16) → xl (20) matches the design spec; callers needing a
  // tighter corner can still override via the style prop.
  const cardStyle: ViewStyle = {
    backgroundColor: elevated ? colors.surfaceElevated : colors.card,
    borderRadius: borderRadius.xl,
    padding,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: elevated ? 0.18 : 0.1,
          shadowRadius: elevated ? 16 : 8,
        }
      : {
          elevation: elevated ? 4 : 2,
        }),
    borderWidth: 1,
    // In dark mode the border is already a 8% white translucent token,
    // so we don't reduce its alpha further (used to be border + '40'
    // which went 8% → ~3% and made cards feel flat-on-flat).
    borderColor: colors.border,
  };

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[animatedStyle, cardStyle, style]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
};
