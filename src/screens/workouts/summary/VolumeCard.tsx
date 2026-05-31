import React from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';
import { formatNum } from '../../../utils/date';

interface Props { workout: Workout }

export const VolumeCard: React.FC<Props> = ({ workout }) => {
  const colors = useThemeColors();

  const rpeValues = workout.exercises
    .flatMap((e) => e.sets.filter((s) => s.completed && s.rpe))
    .map((s) => s.rpe as number);
  const avgRpeNum = rpeValues.length > 0
    ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
    : null;
  const avgRpe = avgRpeNum !== null ? formatNum(avgRpeNum) : null;

  return (
    <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.primary + '10', borderLeftWidth: 4, borderLeftColor: colors.primary }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={[typography.captionMedium, { color: colors.primary }]}>ОБЩИЙ ОБЪЁМ</Text>
          <Text style={[typography.h1, { color: colors.primary, marginTop: spacing.xs }]}>
            {Math.round(workout.totalVolume || 0).toLocaleString()} кг
          </Text>
          <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            {formatNum((workout.totalVolume || 0) / 1000)} тонн
          </Text>
        </View>
        {avgRpe && (
          <View style={{ alignItems: 'center' }}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Ср. RPE</Text>
            <Text style={[typography.numberSmall, {
              color: avgRpeNum! >= 9 ? colors.error : avgRpeNum! >= 8 ? colors.accent : colors.success,
            }]}>
              {avgRpe}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
};
