import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';

interface Props { workout: Workout }

export const ExercisesCard: React.FC<Props> = ({ workout }) => {
  const { colors } = useThemeStore();

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Упражнения</Text>
      {workout.exercises.map((ex, i) => {
        const completedSets = ex.sets.filter((s) => s.completed);
        const exVolume = completedSets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0);
        const nextEx = workout.exercises[i + 1];
        const isSuperset = ex.supersetGroupId && nextEx?.supersetGroupId === ex.supersetGroupId;
        return (
          <View key={ex.id}>
            <View style={[{ flexDirection: 'row', paddingVertical: spacing.md }, i < workout.exercises.length - 1 && !isSuperset && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodySemibold, { color: colors.text }]}>{ex.exercise.name}</Text>
                <Text style={[typography.small, { color: colors.textSecondary }]}>
                  {completedSets.length} подх. • {Math.round(exVolume)} кг
                </Text>
                {ex.notes ? (
                  <Text style={[typography.small, { color: colors.textTertiary, marginTop: 2, fontStyle: 'italic' }]} numberOfLines={2}>
                    📝 {ex.notes}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {completedSets.map((s, si) => (
                  <Text key={si} style={[typography.caption, { color: colors.textTertiary }]}>
                    {s.weight || 0}x{s.reps || 0}
                  </Text>
                ))}
              </View>
            </View>
            {isSuperset && (
              <View style={{ alignItems: 'center', marginVertical: -4 }}>
                <View style={{ backgroundColor: colors.accent + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.accent }}>⚡ СУПЕРСЕТ</Text>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </Card>
  );
};
