import React from 'react';
import { View, ViewStyle, StyleProp, Animated, Easing, StyleSheet } from 'react-native';
import { useThemeStore } from '../store/useThemeStore';
import { useReducedMotion } from '../hooks/useAccessibility';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Subtle pulsing placeholder for "still loading" states.
 *
 * Honors Reduce Motion — falls back to a static muted block when the
 * user has motion disabled.
 *
 *   <Skeleton width="60%" height={20}/>
 *   <Skeleton height={120} radius={16}/>
 */
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  const colors = useThemeStore((s) => s.colors);
  const reduceMotion = useReducedMotion();
  const opacity = React.useRef(new Animated.Value(0.4)).current;

  React.useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * A column of skeleton lines — quick way to mock a paragraph while data loads.
 */
export function SkeletonText({ lines = 3, lastLineWidth = '60%' }: { lines?: number; lastLineWidth?: number | string }) {
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={14} width={i === lines - 1 ? lastLineWidth : '100%'} />
      ))}
    </View>
  );
}
