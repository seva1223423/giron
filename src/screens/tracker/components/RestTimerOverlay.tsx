import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SEGMENTS = 60;

export const RestTimerOverlay: React.FC<Props> = ({ isResting, restTime, restTotal, onSkip, onAddTime }) => {
  const { colors } = useThemeStore();
  const safeTop = useSafeTop();

  if (!isResting) return null;

  const progress = restTotal > 0 ? restTime / restTotal : 0;

  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
      backgroundColor: colors.primary, alignItems: 'center',
      paddingTop: safeTop + 20, paddingBottom: spacing.xxxl,
    }}>
      <Text style={[typography.captionMedium, { color: 'rgba(255,255,255,0.7)', letterSpacing: 2 }]}>ОТДЫХ</Text>

      <View style={{ width: 180, height: 180, alignItems: 'center', justifyContent: 'center', marginVertical: spacing.xl }}>
        {/* Background ring */}
        <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 8, borderColor: 'rgba(255,255,255,0.2)' }} />

        {/* Progress dots */}
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const angle = (i / SEGMENTS) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const isActive = i / SEGMENTS <= progress;
          const cx = 90 + Math.cos(rad) * 82;
          const cy = 90 + Math.sin(rad) * 82;
          return (
            <View key={i} style={{
              position: 'absolute', left: cx - 3, top: cy - 3,
              width: 6, height: 6, borderRadius: 3,
              backgroundColor: isActive ? '#FFF' : 'rgba(255,255,255,0.15)',
            }} />
          );
        })}

        <Text style={{ fontSize: 48, fontWeight: '800', color: '#FFF' }}>
          {formatTime(restTime)}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <TouchableOpacity
          onPress={() => onAddTime(30)}
          style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, backgroundColor: 'rgba(255,255,255,0.2)' }}
        >
          <Text style={[typography.buttonSmall, { color: '#FFF' }]}>+30с</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSkip}
          style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, backgroundColor: '#FFF' }}
        >
          <Text style={[typography.buttonSmall, { color: colors.primary }]}>Пропустить</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
