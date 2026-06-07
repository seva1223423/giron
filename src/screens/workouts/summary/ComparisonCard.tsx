import React from 'react';
import { View, Text } from 'react-native';
import { useThemeColors, useWorkoutStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';

interface Props { workout: Workout }

export const ComparisonCard: React.FC<Props> = ({ workout }) => {
  const colors = useThemeColors();
  const { workoutHistory } = useWorkoutStore();

  const prevSameWorkout = workoutHistory.find(
    (w) => w.id !== workout.id && w.name === workout.name && w.completedAt
  );
  const volumeDiff = prevSameWorkout && workout.totalVolume && prevSameWorkout.totalVolume
    ? Math.round(workout.totalVolume - prevSameWorkout.totalVolume) : null;
  const durationDiff = prevSameWorkout && workout.durationMinutes && prevSameWorkout.durationMinutes
    ? workout.durationMinutes - prevSameWorkout.durationMinutes : null;

  if (!prevSameWorkout || volumeDiff === null) return null;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
        VS ПРОШЛЫЙ РАЗ ({new Date(prevSameWorkout.completedAt!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })})
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: '40%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text style={[typography.numberSmall, { fontSize: 22, color: volumeDiff > 0 ? colors.success : volumeDiff < 0 ? colors.error : colors.textSecondary }]}>
              {volumeDiff > 0 ? '+' : ''}{volumeDiff}
            </Text>
            <Text style={[typography.caption, { color: volumeDiff > 0 ? colors.success : volumeDiff < 0 ? colors.error : colors.textSecondary }]}>
              {volumeDiff > 0 ? '▲' : volumeDiff < 0 ? '▼' : '—'}
            </Text>
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>кг объём</Text>
        </View>
        {durationDiff !== null && (
          <View style={{ flex: 1, minWidth: '40%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text style={[typography.numberSmall, { fontSize: 22, color: durationDiff < 0 ? colors.success : durationDiff > 5 ? colors.error : colors.textSecondary }]}>
                {durationDiff > 0 ? '+' : ''}{durationDiff}
              </Text>
              <Text style={[typography.caption, { color: durationDiff < 0 ? colors.success : durationDiff > 5 ? colors.error : colors.textSecondary }]}>
                {durationDiff < 0 ? '▲' : durationDiff > 0 ? '▼' : '—'}
              </Text>
            </View>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>мин</Text>
          </View>
        )}
      </View>
    </Card>
  );
};
