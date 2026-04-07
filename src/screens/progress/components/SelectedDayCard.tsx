import React from 'react';
import { View, Text } from 'react-native';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import type { Workout } from '../../../types';

interface Props {
  selectedDay: string;
  workouts: Workout[];
  colors: any;
}

export const SelectedDayCard: React.FC<Props> = ({ selectedDay, workouts, colors }) => {
  if (!workouts.length) return null;
  return (
    <FadeIn delay={0}>
      <Card style={{ marginTop: spacing.xl }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
          {new Date(selectedDay + 'T12:00:00').toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            weekday: 'long',
          })}
        </Text>
        {workouts.map((w, i) => (
          <View
            key={w.id}
            style={[
              { paddingVertical: spacing.md },
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
            ]}
          >
            <Text style={[typography.bodySemibold, { color: colors.text }]}>{w.name}</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
              {w.exercises.length} упр.
              {w.durationMinutes ? ` · ${w.durationMinutes} мин` : ''}
              {w.totalVolume ? ` · ${Math.round(w.totalVolume)} кг` : ''}
            </Text>
            {w.exercises.length > 0 && (
              <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
                {w.exercises.map((ex) => ex.exercise.name).join(', ')}
              </Text>
            )}
          </View>
        ))}
      </Card>
    </FadeIn>
  );
};
