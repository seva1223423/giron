import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { useThemeStore } from '../store';
import { useOnboardingTipsStore } from '../store/useOnboardingTipsStore';

interface Props {
  tipId: string;
  text: string;
  position?: 'top' | 'bottom';
  delay?: number;
}

export const Tooltip: React.FC<Props> = ({ tipId, text, position = 'bottom', delay = 500 }) => {
  const { colors } = useThemeStore();
  const { hasShown, markShown } = useOnboardingTipsStore();
  const opacity = useSharedValue(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasShown(tipId)) {
      opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    }
    return () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current); };
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (hasShown(tipId)) return null;

  const dismiss = () => {
    opacity.value = withTiming(0, { duration: 200 });
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => markShown(tipId), 200);
  };

  return (
    <Animated.View style={[styles.container, position === 'top' ? styles.top : styles.bottom, { backgroundColor: colors.primary }, style]}>
      <Text style={styles.text}>{text}</Text>
      <TouchableOpacity onPress={dismiss} style={styles.closeBtn}>
        <Text style={styles.closeText}>OK</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', zIndex: 100, elevation: 10 },
  top: { top: 8 },
  bottom: { bottom: 8 },
  text: { flex: 1, color: '#FFF', fontSize: 13, lineHeight: 18 },
  closeBtn: { marginLeft: 12, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8 },
  closeText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
});
