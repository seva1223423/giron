import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useThemeColors } from '../store/useThemeStore';
import { useReducedMotion } from '../hooks/useAccessibility';
import { Icon } from './Icon';

interface Props {
  /** Pixel diameter of the spinning mark. Defaults to 24. */
  size?: number;
  /** Override color; defaults to theme.primary (champagne gold). */
  color?: string;
  /** Override the VoiceOver label. Defaults to "Загрузка". */
  accessibilityLabel?: string;
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
export const Spinner: React.FC<Props> = ({ size = 24, color, accessibilityLabel }) => {
  // Round 233 (2026-05-02 audit):
  //  - selector hook avoids full-store re-renders
  //  - useReducedMotion gate respects vestibular-disorder accessibility setting
  //  - accessibilityRole="progressbar" + busy state announces loading to VoiceOver
  //    (was completely silent before — Wave 3 a11y finding A2)
  const colors = useThemeColors();
  const reduce = useReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (!reduce) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 900, easing: Easing.linear }),
        -1,
        false,
      );
    }
    return () => cancelAnimation(rotation);
  }, [rotation, reduce]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? 'Загрузка'}
      accessibilityState={{ busy: true }}
    >
      <Animated.View style={style}>
        <Icon name="spark" size={size} color={color ?? colors.primary} strokeWidth={2} />
      </Animated.View>
    </View>
  );
};
