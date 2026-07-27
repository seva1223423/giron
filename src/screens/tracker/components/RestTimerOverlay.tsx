import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSpring, Easing, cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '../../../store';
import { useSafeBottom } from '../../../hooks/useSafeBottom';
import { AnimatedPressable, Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

/**
 * Rest between sets — a bar at the bottom, not a wall over the screen.
 *
 * It used to be a full-width gold panel pinned to the top with a 180pt ring
 * and a 48pt countdown, covering the set list entirely. For one to three
 * minutes, several times per exercise, the app showed nothing but a number.
 * You could not check what you just lifted, see what was coming, or fix a
 * mistyped set — and the only way out was a double tap nobody was told about.
 *
 * The bar keeps what mattered — a countdown readable from a bench, the pulse
 * and haptics in the last five seconds — and gives back the screen. When the
 * rest is between exercises it also shows what is next, with a way to swap it,
 * because that is exactly the minute in which you decide.
 */

interface Props {
  isResting: boolean;
  restTime: number;
  restTotal: number;
  onSkip: () => void;
  onAddTime: (seconds: number) => void;
  nextExerciseName?: string | null;
  isLastSetOfExercise?: boolean;
  /** Offered only between exercises, where changing the plan makes sense. */
  onSubstitute?: () => void;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const RestTimerOverlay: React.FC<Props> = ({
  isResting, restTime, restTotal, onSkip, onAddTime,
  nextExerciseName, isLastSetOfExercise, onSubstitute,
}) => {
  const colors = useThemeColors();
  const safeBottom = useSafeBottom();
  const lastVibrationRef = useRef<number>(-1);

  const pulse = useSharedValue(1);
  const slide = useSharedValue(160);
  const isUrgent = restTime <= 5 && restTime > 0;

  // PHILOSOPHY §5 state-as-event: the last five seconds breathe, so you feel
  // the moment to stand up without watching the screen.
  useEffect(() => {
    if (isUrgent) {
      pulse.value = withRepeat(withTiming(1.1, { duration: 500, easing: Easing.inOut(Easing.sin) }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [isUrgent]);

  useEffect(() => {
    slide.value = withSpring(isResting ? 0 : 160, { damping: 18, stiffness: 160 });
  }, [isResting]);

  // Without this, unmounting mid-`withRepeat(-1)` leaks an infinite loop
  // driving an orphaned shared value.
  useEffect(() => () => { cancelAnimation(pulse); cancelAnimation(slide); }, []);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slide.value }] }));

  // Vibration every 10s + final countdown at 5/4/3/2/1.
  useEffect(() => {
    if (!isResting) return;
    const isAlmostDone = restTime <= 5 && restTime > 0;
    const isEvery10 = restTime > 0 && restTime % 10 === 0 && restTime !== lastVibrationRef.current;

    if (isAlmostDone && restTime !== lastVibrationRef.current) {
      lastVibrationRef.current = restTime;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (isEvery10) {
      lastVibrationRef.current = restTime;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (restTime === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [restTime, isResting]);

  const handleAdd = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAddTime(30);
  }, [onAddTime]);

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSkip();
  }, [onSkip]);

  if (!isResting) return null;

  const progress = restTotal > 0 ? Math.min(1, Math.max(0, restTime / restTotal)) : 0;
  const accent = isUrgent ? colors.warning : colors.primary;
  const showNext = !!isLastSetOfExercise && !!nextExerciseName;

  return (
    <Animated.View
      style={[
        styles.dock,
        slideStyle,
        { backgroundColor: colors.surfaceElevated, borderTopColor: colors.border, paddingBottom: safeBottom + spacing.sm },
      ]}
    >
      {/* Time left as a single hairline. The ring was 180pt of screen for
          information a 3pt line carries just as well. */}
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { backgroundColor: accent, width: `${progress * 100}%` }]} />
      </View>

      {showNext && (
        <View style={styles.nextRow}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.metaLabel, { color: colors.textTertiary }]}>СЛЕДУЮЩЕЕ УПРАЖНЕНИЕ</Text>
            <Text style={[typography.bodySemibold, { color: colors.text, marginTop: 1 }]} numberOfLines={1}>
              {nextExerciseName}
            </Text>
          </View>
          {!!onSubstitute && (
            <AnimatedPressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSubstitute(); }}
              haptic={false}
              scaleDown={0.94}
              style={styles.swap as any}
              accessibilityRole="button"
              accessibilityLabel="Заменить следующее упражнение"
            >
              <Text style={[typography.smallMedium, { color: colors.primary }]}>Заменить</Text>
            </AnimatedPressable>
          )}
        </View>
      )}

      <View style={styles.bar}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.metaLabel, { color: colors.textTertiary }]}>
            {isUrgent ? 'ГОТОВЬСЯ' : 'ОТДЫХ'}
          </Text>
          <Animated.Text
            style={[styles.clock, pulseStyle, { color: accent }]}
            allowFontScaling={false}
            numberOfLines={1}
          >
            {formatTime(restTime)}
          </Animated.Text>
        </View>

        <AnimatedPressable
          onPress={handleAdd}
          haptic={false}
          scaleDown={0.92}
          style={[styles.add, { borderColor: colors.border, backgroundColor: colors.surface }] as any}
          accessibilityRole="button"
          accessibilityLabel="Добавить 30 секунд отдыха"
        >
          <Text style={[typography.smallMedium, { color: colors.textSecondary }]} allowFontScaling={false}>+30с</Text>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={handleSkip}
          haptic={false}
          scaleDown={0.96}
          style={[styles.skip, { backgroundColor: accent }] as any}
          accessibilityRole="button"
          accessibilityLabel="Пропустить отдых и перейти дальше"
        >
          <Text style={[typography.bodySemibold, { color: colors.textInverse }]}>Дальше</Text>
          <Icon name="chev" size={16} color={colors.textInverse} />
        </AnimatedPressable>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  dock: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10,
    borderTopWidth: 1, paddingHorizontal: spacing.lg,
  },
  track: { height: 3, marginHorizontal: -spacing.lg },
  fill: { height: 3 },
  nextRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingTop: spacing.md, paddingBottom: spacing.xs,
  },
  swap: { minHeight: 40, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  clock: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: -2 },
  add: {
    minWidth: 56, minHeight: 44, borderRadius: borderRadius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  skip: {
    minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: borderRadius.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2,
  },
});
