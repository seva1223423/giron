import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';

interface Props { workout: Workout }

export const ProgressionCard: React.FC<Props> = ({ workout }) => {
  const { colors } = useThemeStore();

  const suggestions = workout.exercises.flatMap((ex) => {
    const completedSets = ex.sets.filter((s) => s.completed && s.weight && s.reps);
    if (completedSets.length === 0 || completedSets.length < ex.sets.length) return [];
    const avgReps = completedSets.reduce((s, set) => s + (set.reps || 0), 0) / completedSets.length;
    const maxWeight = Math.max(...completedSets.map((s) => s.weight || 0));
    if (avgReps < 10) return [];
    const increment = maxWeight >= 100 ? 5 : 2.5;
    return [{ name: ex.exercise.name, currentWeight: maxWeight, nextWeight: maxWeight + increment }];
  });

  if (suggestions.length === 0) return null;

  return (
    <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.success }}>
      <Text style={[typography.captionMedium, { color: colors.success }]}>ПРОГРЕССИВНАЯ НАГРУЗКА</Text>
      <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md }]}>
        Все подходы выполнены — попробуй прибавить вес в следующий раз:
      </Text>
      {suggestions.map((s, i) => (
        <View key={i} style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }, i < suggestions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
          <Text style={[typography.small, { color: colors.text, flex: 1 }]} numberOfLines={1}>{s.name}</Text>
          <Text style={[typography.smallMedium, { color: colors.success }]} numberOfLines={1}>{s.currentWeight} → {s.nextWeight} кг</Text>
        </View>
      ))}
    </Card>
  );
};
