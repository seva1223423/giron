import React, { useRef, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  toast: { name: string; rm: number } | null;
}

export const PRToast: React.FC<Props> = ({ toast }) => {
  const { colors } = useThemeStore();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [toast]);

  if (!toast) return null;

  return (
    <Animated.View style={{
      position: 'absolute', top: 110, left: spacing.xl, right: spacing.xl, zIndex: 20,
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.xl, backgroundColor: colors.accent,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }],
      opacity: anim,
    }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>PR</Text></View>
      <View style={{ marginLeft: spacing.sm }}>
        <Text style={[typography.captionMedium, { color: '#fff', letterSpacing: 1 }]}>ЛИЧНЫЙ РЕКОРД!</Text>
        <Text style={[typography.small, { color: 'rgba(255,255,255,0.85)' }]}>
          {toast.name} — ~{toast.rm} кг 1ПМ
        </Text>
      </View>
    </Animated.View>
  );
};
