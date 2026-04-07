import React, { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const PR_EMOJIS = ['🏆', '🎉', '⭐', '💪', '🔥', '✨', '🥇', '💫'];
const PARTICLE_COUNT = 18;

export const PRCelebration: React.FC = () => {
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
      return {
        anim: new Animated.Value(0),
        angle,
        distance: 90 + Math.floor(i * 17 % 100),
        emoji: PR_EMOJIS[i % PR_EMOJIS.length],
        size: 18 + (i % 3) * 6,
      };
    })
  ).current;

  useEffect(() => {
    Animated.parallel(
      particles.map((p) =>
        Animated.timing(p.anim, {
          toValue: 1,
          duration: 900 + (p.size % 4) * 150,
          useNativeDriver: true,
        })
      )
    ).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => {
        const destX = Math.cos(p.angle) * p.distance;
        const destY = Math.sin(p.angle) * p.distance;
        const translateX = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, destX] });
        const translateY = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, destY] });
        const opacity = p.anim.interpolate({ inputRange: [0, 0.15, 0.65, 1], outputRange: [0, 1, 1, 0] });
        const scale = p.anim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.4, 1.4, 0.7] });
        return (
          <Animated.Text
            key={i}
            style={{ position: 'absolute', top: '25%', left: '50%', fontSize: p.size, transform: [{ translateX }, { translateY }, { scale }], opacity }}
          >
            {p.emoji}
          </Animated.Text>
        );
      })}
    </View>
  );
};
