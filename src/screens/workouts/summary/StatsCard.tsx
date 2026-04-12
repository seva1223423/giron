import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';

interface Props { workout: Workout; totalSets: number; totalReps: number }

export const StatsCard: React.FC<Props> = ({ workout, totalSets, totalReps }) => {
  const { colors } = useThemeStore();

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.xl, textAlign: 'center' }]}>
        {workout.name}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {[
          { value: workout.durationMinutes || 0, label: 'минут', color: colors.primary },
          { value: workout.exercises.length, label: 'упражнений', color: colors.calories },
          { value: totalSets, label: 'подходов', color: colors.protein },
          { value: totalReps, label: 'повторений', color: colors.accent },
        ].map(({ value, label, color }, i) => (
          <View key={label} style={{
            width: '48%', alignItems: 'center', paddingVertical: spacing.md,
            borderTopWidth: i >= 2 ? 1 : 0, borderTopColor: colors.divider,
            borderLeftWidth: i % 2 === 1 ? 1 : 0, borderLeftColor: colors.divider,
          }}>
            <Text style={[typography.number, { color }]}>{value}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
};
