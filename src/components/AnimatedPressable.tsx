import React, { useCallback } from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPress = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends PressableProps {
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  scaleDown?: number;
}

const AnimatedPressableImpl: React.FC<AnimatedPressableProps> = ({
  children,
  style,
  onPress,
  haptic = true,
  scaleDown = 0.97,
  ...rest
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(scaleDown, { damping: 15, stiffness: 400 });
  }, [scaleDown]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  }, []);

  const handlePress = useCallback(
    (e: any) => {
      if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress?.(e);
    },
    [haptic, onPress]
  );

  return (
    <AnimatedPress
      style={[animatedStyle, style]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      {...rest}
    >
      {children}
    </AnimatedPress>
  );
};

// React.memo: rendered in lists / grids; saves re-render when only an
// unrelated parent slice mutates.
export const AnimatedPressable = React.memo(AnimatedPressableImpl);
