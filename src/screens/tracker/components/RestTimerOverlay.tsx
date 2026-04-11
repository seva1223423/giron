import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
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

  if (!isResting) return null;

  const progress = restTotal > 0 ? restTime / restTotal : 0;

  // Circular progress ring dimensions
  const ringSize = 180;
  const ringStrokeWidth = 6;
  const ringRadius = (ringSize - ringStrokeWidth) / 2;
  const ringCircumference = ringRadius * 2 * Math.PI;
  const ringDashoffset = ringCircumference - Math.min(Math.max(progress, 0), 1) * ringCircumference;

  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
      backgroundColor: colors.primary, alignItems: 'center',
      paddingTop: safeTop + 20, paddingBottom: spacing.xxxl,
    }}>
      <Text style={[typography.captionMedium, { color: 'rgba(255,255,255,0.7)', letterSpacing: 2 }]}>{'\u041E\u0422\u0414\u042B\u0425'}</Text>

      <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center', marginVertical: spacing.xl }}>
        {/* SVG circular progress ring */}
        <Svg width={ringSize} height={ringSize} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={ringSize / 2} cy={ringSize / 2} r={ringRadius}
            stroke="rgba(255,255,255,0.15)" strokeWidth={ringStrokeWidth} fill="none"
          />
          <Circle
            cx={ringSize / 2} cy={ringSize / 2} r={ringRadius}
            stroke="#FFF" strokeWidth={ringStrokeWidth} fill="none"
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
              backgroundColor: isActive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.1)',
            }} />
          );
        })}

        <Text style={{ fontSize: 48, fontWeight: '800', color: '#FFF' }}>
          {formatTime(restTime)}
        </Text>
      </View>

      <Text style={[typography.caption, { color: 'rgba(255,255,255,0.5)', marginTop: spacing.xs }]}>
        {Math.round((1 - progress) * 100)}% {'\u043E\u0442\u0434\u044B\u0445\u0430'}
      </Text>

      {/* Next exercise hint when resting between exercises */}
      {isLastSetOfExercise && nextExerciseName && (
        <Text style={[typography.bodySemibold, { color: 'rgba(255,255,255,0.8)', marginTop: spacing.md }]}>
          {'\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u0443\u043F\u0440\u0430\u0436\u043D\u0435\u043D\u0438\u0435: '}{nextExerciseName}
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        <TouchableOpacity
          onPress={() => onAddTime(15)}
          style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, backgroundColor: 'rgba(255,255,255,0.2)' }}
        >
          <Text style={[typography.buttonSmall, { color: '#FFF' }]}>+15{'\u0441'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onAddTime(30)}
          style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, backgroundColor: 'rgba(255,255,255,0.2)' }}
        >
          <Text style={[typography.buttonSmall, { color: '#FFF' }]}>+30{'\u0441'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSkip}
          style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, backgroundColor: '#FFF' }}
        >
          <Text style={[typography.buttonSmall, { color: colors.primary }]}>{'\u041F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
