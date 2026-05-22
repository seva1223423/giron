import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  toast: { name: string; rm: number; prevRm?: number } | null;
}

// Confetti particle
interface Particle { x: Animated.Value; y: Animated.Value; opacity: Animated.Value; color: string; size: number }

// Round 242: replaced legacy purple confetti with Direction A gold
const CONFETTI_COLORS = ['#F59E0B', '#EF4444', '#D4B07A', '#10B981', '#3B82F6', '#EC4899'];

function useConfetti(active: boolean) {
  const particles = useRef<Particle[]>(
    Array.from({ length: 12 }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 4 + (i % 3) * 2,
    }))
  ).current;

  useEffect(() => {
    if (!active) return;
    const anims = particles.map((p, i) => {
      p.x.setValue(0); p.y.setValue(0); p.opacity.setValue(0);
      const xDir = (i % 2 === 0 ? 1 : -1) * (20 + (i % 4) * 15);
      return Animated.parallel([
        Animated.timing(p.opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(p.x, { toValue: xDir, duration: 600, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(p.y, { toValue: -(30 + (i % 3) * 20), duration: 300, useNativeDriver: true }),
          Animated.timing(p.y, { toValue: 10, duration: 300, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(p.opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]);
    });
    Animated.parallel(anims).start();
  }, [active]);

  return particles;
}

export const PRToast: React.FC<Props> = ({ toast }) => {
  const colors = useThemeColors();
  const anim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const [confettiActive, setConfettiActive] = useState(false);
  const confetti = useConfetti(confettiActive);

  useEffect(() => {
    if (!toast) return;
    setConfettiActive(false);
    anim.setValue(0); scaleAnim.setValue(0.8);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.parallel([
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 7 }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 7 }),
      ]),
      Animated.delay(100),
    ]).start(() => setConfettiActive(true));

    const hideTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 250, useNativeDriver: true }),
      ]).start();
    }, 3000);
    return () => clearTimeout(hideTimer);
  }, [toast]);

  if (!toast) return null;

  const improvement = toast.prevRm && toast.prevRm > 0
    ? `+${Math.round(toast.rm - toast.prevRm)} кг к 1ПМ`
    : `~${toast.rm} кг 1ПМ`;

  return (
    <Animated.View style={{
      position: 'absolute', top: 110, left: spacing.xl, right: spacing.xl, zIndex: 20,
      transform: [
        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) },
        { scale: scaleAnim },
      ],
      opacity: anim,
    }}>
      {/* Confetti particles */}
      <View style={{ position: 'absolute', top: 14, left: '50%' }} pointerEvents="none">
        {confetti.map((p, i) => (
          <Animated.View key={i} style={{
            position: 'absolute',
            width: p.size, height: p.size, borderRadius: p.size / 2,
            backgroundColor: p.color,
            transform: [{ translateX: p.x }, { translateY: p.y }],
            opacity: p.opacity,
          }} />
        ))}
      </View>

      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.xl, backgroundColor: colors.accent,
        shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45, shadowRadius: 12, elevation: 10,
      }}>
        {/* Badge */}
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.5 }}>PR</Text>
          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)' }}>🏆</Text>
        </View>
        <View style={{ marginLeft: spacing.sm, flex: 1 }}>
          <Text style={[typography.captionMedium, { color: '#fff', letterSpacing: 1.2 }]}>ЛИЧНЫЙ РЕКОРД!</Text>
          <Text style={[typography.small, { color: 'rgba(255,255,255,0.9)', marginTop: 1 }]} numberOfLines={1}>
            {toast.name}
          </Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#FEF3C7', marginTop: 1 }} numberOfLines={1}>
            {improvement}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
};
