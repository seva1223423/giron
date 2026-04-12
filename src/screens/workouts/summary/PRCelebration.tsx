import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

const COLORS = ['#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE', '#7C3AED', '#6D28D9', '#EDE9FE'];
const PARTICLE_COUNT = 30;

interface Particle {
  x: number;
  delay: number;
  color: string;
  size: number;
  rotation: number;
}

const ConfettiParticle: React.FC<{ particle: Particle }> = ({ particle }) => {
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const translateY = useSharedValue(-50);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      particle.delay,
      withTiming(SCREEN_HEIGHT + 100, {
        duration: 2500 + Math.random() * 1500,
        easing: Easing.out(Easing.quad),
      }),
    );
    opacity.value = withDelay(
      particle.delay + 2000,
      withTiming(0, { duration: 1000 }),
    );
    rotate.value = withDelay(
      particle.delay,
      withTiming(particle.rotation * 360, { duration: 3000 }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: particle.x,
          top: -20,
          width: particle.size,
          height: particle.size * 0.6,
          backgroundColor: particle.color,
          borderRadius: 2,
        },
        style,
      ]}
    />
  );
};

export const PRCelebration: React.FC = () => {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * SCREEN_WIDTH,
        delay: Math.random() * 500,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 8 + Math.random() * 8,
        rotation: 2 + Math.random() * 4,
      })),
    [],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => (
        <ConfettiParticle key={i} particle={p} />
      ))}
    </View>
  );
};
