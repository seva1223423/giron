import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AccessibilityInfo } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, cancelAnimation } from 'react-native-reanimated';
import { useThemeColors } from '../store/useThemeStore';
import { useOnboardingTipsStore } from '../store/useOnboardingTipsStore';
import { useReducedMotion } from '../hooks/useAccessibility';

interface Props {
  tipId: string;
  text: string;
  position?: 'top' | 'bottom';
  delay?: number;
}

// Round 233 (2026-05-02 audit):
//  - color '#FFF' on colors.primary (gold) was 2.8:1 contrast — WCAG AA FAIL.
//    Direction A rule: gold backgrounds always pair with DARK text. Switched
//    to colors.textInverse (dark graphite on light gold).
//  - Added useThemeColors selector to avoid full-store re-renders.
//  - Added accessibilityRole='alert' + announceForAccessibility so VoiceOver
//    users actually hear the tip (was silently invisible to AT before).
//  - Added useReducedMotion gate (vestibular-safe).
//  - Added cancelAnimation cleanup on unmount.
export const Tooltip: React.FC<Props> = ({ tipId, text, position = 'bottom', delay = 500 }) => {
  const colors = useThemeColors();
  const reduce = useReducedMotion();
  const { hasShown, markShown } = useOnboardingTipsStore();
  const opacity = useSharedValue(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasShown(tipId)) {
      opacity.value = reduce
        ? withDelay(delay, withTiming(1, { duration: 0 }))
        : withDelay(delay, withTiming(1, { duration: 300 }));
      // a11y: announce to screen reader (Wave 3 finding A33)
      const t = setTimeout(() => AccessibilityInfo.announceForAccessibility(text), delay);
      return () => {
        clearTimeout(t);
        cancelAnimation(opacity);
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      };
    }
    return () => {
      cancelAnimation(opacity);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (hasShown(tipId)) return null;

  const dismiss = () => {
    opacity.value = withTiming(0, { duration: reduce ? 0 : 200 });
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => markShown(tipId), reduce ? 0 : 200);
  };

  return (
    <Animated.View
      style={[
        styles.container,
        position === 'top' ? styles.top : styles.bottom,
        { backgroundColor: colors.primary },
        style,
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.text, { color: colors.textInverse }]}>{text}</Text>
      <TouchableOpacity
        onPress={dismiss}
        style={[styles.closeBtn, { backgroundColor: colors.textInverse + '20' }]}
        accessibilityRole="button"
        accessibilityLabel="Понятно, скрыть подсказку"
      >
        <Text style={[styles.closeText, { color: colors.textInverse }]}>OK</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', zIndex: 100, elevation: 10 },
  top: { top: 8 },
  bottom: { bottom: 8 },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
  closeBtn: { marginLeft: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  closeText: { fontWeight: '700', fontSize: 12 },
});
