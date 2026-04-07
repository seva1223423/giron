import React from 'react';
import { Text } from 'react-native';
import { useThemeStore, useWorkoutStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

export const WorkoutStatusCard: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { activeWorkout, programs } = useWorkoutStore();
  const activeProgram = programs.find((p) => p.isActive);

  if (activeWorkout) {
    return (
      <Card
        style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.success }}
        onPress={() => navigation.navigate('WorkoutsTab', { screen: 'ActiveWorkout' })}
      >
        <Text style={[typography.captionMedium, { color: colors.success }]}>АКТИВНАЯ ТРЕНИРОВКА</Text>
        <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>
          {activeWorkout.workout.name}
        </Text>
        <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
          Нажми, чтобы продолжить
        </Text>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: spacing.lg }} onPress={() => navigation.navigate('WorkoutsTab')}>
      <Text style={[typography.h4, { color: colors.text }]}>Начать тренировку</Text>
      <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
        {activeProgram ? `Программа: ${activeProgram.name}` : 'Выбери программу или создай свою'}
      </Text>
    </Card>
  );
};
