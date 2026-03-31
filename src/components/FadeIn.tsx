import React, { useEffect } from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  from?: 'bottom' | 'top' | 'left' | 'right' | 'none';
  distance?: number;
  style?: StyleProp<ViewStyle>;
}

export const FadeIn: React.FC<FadeInProps> = ({
  children,
  delay = 0,
  duration = 400,
  from = 'bottom',
  distance = 20,
  style,
}) => {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(
    from === 'left' ? -distance : from === 'right' ? distance : 0
  );
  const translateY = useSharedValue(
    from === 'bottom' ? distance : from === 'top' ? -distance : 0
  );

  useEffect(() => {
    const timingConfig = { duration, easing: Easing.out(Easing.cubic) };
    opacity.value = withDelay(delay, withTiming(1, timingConfig));
    translateX.value = withDelay(delay, withTiming(0, timingConfig));
    translateY.value = withDelay(delay, withTiming(0, timingConfig));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
};
