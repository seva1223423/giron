import React from 'react';
import { Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';

interface Props { workout: Workout }

export const BestSetCard: React.FC<Props> = ({ workout }) => {
  const { colors } = useThemeStore();

  let bestName = '';
  let bestWeight = 0;
  let bestReps = 0;
  workout.exercises.forEach((ex) => {
    ex.sets.filter((s) => s.completed).forEach((s) => {
      const v = (s.weight || 0) * (s.reps || 0);
      if (v > bestWeight * bestReps) {
        bestName = ex.exercise?.name;
        bestWeight = s.weight || 0;
        bestReps = s.reps || 0;
      }
    });
  });

  if (!bestName) return null;

  return (
    <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent }}>
      <Text style={[typography.captionMedium, { color: colors.accent }]}>ЛУЧШИЙ ПОДХОД</Text>
      <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>{bestName}</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
        {bestWeight} кг x {bestReps} повт.
      </Text>
    </Card>
  );
};
