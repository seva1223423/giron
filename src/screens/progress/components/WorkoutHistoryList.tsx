import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import type { Workout } from '../../../types';

interface Props {
  workouts: Workout[];
  delay?: number;
}

export const WorkoutHistoryList: React.FC<Props> = ({ workouts, delay = 600 }) => {
  const { colors } = useThemeStore();
  return (
    <FadeIn delay={delay}>
      <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>Последние тренировки</Text>
      {workouts.length === 0 ? (
        <Card>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Нет завершённых тренировок. Начни первую!
          </Text>
        </Card>
      ) : (
        workouts.slice(0, 10).map((workout, i) => (
          <FadeIn key={workout.id} delay={delay + 50 + i * 50}>
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>{workout.name}</Text>
                  <Text style={[typography.small, { color: colors.textSecondary }]}>
                    {workout.exercises.length} упр. {'\u2022'} {workout.durationMinutes || 0} мин
                    {workout.totalVolume ? ` \u2022 ${Math.round(workout.totalVolume)} кг` : ''}
                  </Text>
                </View>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>
                  {workout.completedAt
                    ? new Date(workout.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                    : ''}
                </Text>
              </View>
            </Card>
          </FadeIn>
        ))
      )}
    </FadeIn>
  );
};
