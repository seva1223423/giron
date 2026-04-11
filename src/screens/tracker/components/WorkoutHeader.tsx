import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useThemeStore, useWorkoutStore } from '../../../store';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';

interface Props {
  workout: Workout;
  elapsed: number;
  totalCompletedSets: number;
  totalSets: number;
  onCancel: () => void;
  onFinish: () => void;
}

const MiniProgressRing: React.FC<{ progress: number; color: string; bgColor: string }> = ({ progress, color, bgColor }) => {
  const size = 24;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - Math.min(Math.max(progress, 0), 1) * circumference;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={bgColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={{ position: 'absolute', fontSize: 8, fontWeight: '800', color }}>
        {Math.round(progress * 100)}
      </Text>
    </View>
  );
};

export const WorkoutHeader: React.FC<Props> = ({ workout, elapsed, totalCompletedSets, totalSets, onCancel, onFinish }) => {
  const { colors } = useThemeStore();
  const { workoutDurationGoal } = useSettingsStore();
  const safeTop = useSafeTop();

  const completionProgress = totalSets > 0 ? totalCompletedSets / totalSets : 0;

  // Compute total volume from completed sets in real-time
  const totalVolume = useMemo(() => {
    return workout.exercises.reduce((vol, ex) => {
      return vol + ex.sets
        .filter((s) => s.completed && s.weight && s.reps)
        .reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
    }, 0);
  }, [workout.exercises]);

  const goalText = workoutDurationGoal > 0 ? (() => {
    const remaining = workoutDurationGoal - elapsed;
    if (remaining > 0) {
      return { text: `\u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C ${remaining} \u043C\u0438\u043D`, color: colors.success };
    }
    return { text: `\u2212${Math.abs(remaining)} \u043C\u0438\u043D (\u043F\u0435\u0440\u0435\u0431\u043E\u0440)`, color: colors.warning };
  })() : null;

  const formatVolume = (kg: number) => {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
    return `${Math.round(kg)}`;
  };

  return (
    <View style={{
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingTop: safeTop, paddingBottom: spacing.md, paddingHorizontal: spacing.xl,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    }}>
      <TouchableOpacity onPress={onCancel}>
        <Text style={[typography.bodySemibold, { color: colors.error }]}>{'\u041E\u0442\u043C\u0435\u043D\u0430'}</Text>
      </TouchableOpacity>

      <View style={{ alignItems: 'center', flex: 1 }}>
        <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
          {workout.name}
        </Text>

        {/* Elapsed time - more prominent */}
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.primary, marginTop: 2 }}>
          {elapsed} {'\u043C\u0438\u043D'}
        </Text>

        {/* Stats row with progress ring */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 }}>
          <MiniProgressRing progress={completionProgress} color={colors.primary} bgColor={colors.border} />
          <Text style={[typography.caption, { color: colors.textSecondary }]}>
            {totalCompletedSets}/{totalSets} {'\u043F\u043E\u0434\u0445.'} {'\u2022'} {formatVolume(totalVolume)} {'\u043A\u0433'}
          </Text>
        </View>

        {goalText && (
          <Text style={[typography.caption, { color: goalText.color, marginTop: 1 }]}>
            {goalText.text}
          </Text>
        )}
      </View>

      <TouchableOpacity onPress={onFinish}>
        <Text style={[typography.bodySemibold, {
          color: colors.success,
          fontSize: totalCompletedSets === totalSets && totalSets > 0 ? 18 : 16,
          fontWeight: totalCompletedSets === totalSets && totalSets > 0 ? '800' : '600',
        }]}>
          {totalCompletedSets === totalSets && totalSets > 0 ? '\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u25C9' : '\u0413\u043E\u0442\u043E\u0432\u043E'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
