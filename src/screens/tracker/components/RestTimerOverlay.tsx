import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../../../store';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  isResting: boolean;
  restTime: number;
  restTotal: number;
  onSkip: () => void;
  onAddTime: (seconds: number) => void;
  nextExerciseName?: string | null;
  isLastSetOfExercise?: boolean;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SEGMENTS = 60;

export const RestTimerOverlay: React.FC<Props> = ({ isResting, restTime, restTotal, onSkip, onAddTime, nextExerciseName, isLastSetOfExercise }) => {
  const { colors } = useThemeStore();
  const safeTop = useSafeTop();
  const lastVibrationRef = useRef<number>(-1);
  const lastTapRef = useRef<number>(0);

  // Vibration every 10s + final countdown at 5/4/3/2/1
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

  // Double-tap to skip
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      onSkip();
    }
    lastTapRef.current = now;
  }, [onSkip]);

  if (!isResting) return null;

  const progress = restTotal > 0 ? restTime / restTotal : 0;
  // Color shifts to warning/amber when ≤ 5s
  const isUrgent = restTime <= 5 && restTime > 0;
  const ringColor = isUrgent ? '#F59E0B' : '#FFF';
  const bgColor = isUrgent ? '#D97706' : colors.primary;

  // Circular progress ring dimensions
  const ringSize = 180;
  const ringStrokeWidth = 6;
  const ringRadius = (ringSize - ringStrokeWidth) / 2;
  const ringCircumference = ringRadius * 2 * Math.PI;
  const ringDashoffset = ringCircumference - Math.min(Math.max(progress, 0), 1) * ringCircumference;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handleDoubleTap}
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        backgroundColor: bgColor, alignItems: 'center',
        paddingTop: safeTop + 20, paddingBottom: spacing.xxxl,
      }}
    >
      <Text style={[typography.captionMedium, { color: 'rgba(255,255,255,0.7)', letterSpacing: 2 }]}>
        ОТДЫХ{isUrgent ? ' — ГОТОВЬСЯ!' : ''}
      </Text>
      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
        двойной тап — пропустить
      </Text>

      <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center', marginVertical: spacing.xl }}>
        {/* SVG circular progress ring */}
        <Svg width={ringSize} height={ringSize} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={ringSize / 2} cy={ringSize / 2} r={ringRadius}
            stroke="rgba(255,255,255,0.15)" strokeWidth={ringStrokeWidth} fill="none"
          />
          <Circle
            cx={ringSize / 2} cy={ringSize / 2} r={ringRadius}
            stroke={ringColor} strokeWidth={ringStrokeWidth} fill="none"
            strokeDasharray={ringCircumference} strokeDashoffset={ringDashoffset}
            strokeLinecap="round"
          />
        </Svg>

        {/* Progress dots (inner, decorative) */}
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const angle = (i / SEGMENTS) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const isActive = i / SEGMENTS <= progress;
          const cx = ringSize / 2 + Math.cos(rad) * 68;
          const cy = ringSize / 2 + Math.sin(rad) * 68;
          return (
            <View key={i} style={{
              position: 'absolute', left: cx - 2, top: cy - 2,
              width: 4, height: 4, borderRadius: 2,
              backgroundColor: isActive ? (isUrgent ? 'rgba(251,191,36,0.8)' : 'rgba(255,255,255,0.6)') : 'rgba(255,255,255,0.1)',
            }} />
          );
        })}

        <Text style={{ fontSize: 48, fontWeight: '800', color: isUrgent ? '#FEF3C7' : '#FFF' }}>
          {formatTime(restTime)}
        </Text>
      </View>

      <Text style={[typography.caption, { color: 'rgba(255,255,255,0.5)', marginTop: spacing.xs }]}>
        {Math.round((1 - progress) * 100)}% отдыха
      </Text>

      {/* Next exercise hint when resting between exercises */}
      {isLastSetOfExercise && nextExerciseName && (
        <Text style={[typography.bodySemibold, { color: 'rgba(255,255,255,0.8)', marginTop: spacing.md }]}>
          {'\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u0443\u043F\u0440\u0430\u0436\u043D\u0435\u043D\u0438\u0435: '}{nextExerciseName}
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAddTime(15); }}
          style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, backgroundColor: 'rgba(255,255,255,0.2)' }}
        >
          <Text style={[typography.buttonSmall, { color: '#FFF' }]}>+15с</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAddTime(30); }}
          style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, backgroundColor: 'rgba(255,255,255,0.2)' }}
        >
          <Text style={[typography.buttonSmall, { color: '#FFF' }]}>+30с</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onSkip(); }}
          style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, backgroundColor: '#FFF' }}
        >
          <Text style={[typography.buttonSmall, { color: colors.primary }]}>Пропустить</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};
