import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useThemeStore } from '../store';
import { Icon } from './Icon';

interface Props {
  /** Pixel diameter of the spinning mark. Defaults to 24. */
  size?: number;
  /** Override color; defaults to theme.primary (champagne gold). */
  color?: string;
}

/**
 * Premium brand-aligned loader — a rotating gold spark icon. Meant as a
 * drop-in replacement for React Native's ActivityIndicator on premium
 * surfaces (home loading, paywall fetch, AI analysis blocked states).
 *
 * Uses reanimated for a smooth 900ms linear rotation loop. Respects
 * the theme: color prop overrides, otherwise pulls colors.primary so
 * the loader stays on-brand in both light and dark modes.
 *
 *   <Spinner size={32} />
 */
export const Spinner: React.FC<Props> = ({ size = 24, color }) => {
  const { colors } = useThemeStore();
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={style}>
        <Icon name="spark" size={size} color={color ?? colors.primary} strokeWidth={2} />
      </Animated.View>
    </View>
  );
};
