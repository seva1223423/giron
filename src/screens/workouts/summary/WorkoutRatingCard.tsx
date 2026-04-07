import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore, useWorkoutStore } from '../../../store';
import { Card } from '../../../components';
import { useHaptic } from '../../../hooks/useHaptic';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';

const RATING_LABELS: Record<number, string> = {
  1: 'Тяжело, еле добрался',
  2: 'Средне, бывало лучше',
  3: 'Нормально',
  4: 'Хорошая тренировка',
  5: 'Огонь! Всё по максимуму 🔥',
};

interface Props { workout: Workout }

export const WorkoutRatingCard: React.FC<Props> = ({ workout }) => {
  const { colors } = useThemeStore();
  const { updateWorkoutInHistory } = useWorkoutStore();
  const haptic = useHaptic();
  const [rating, setRating] = useState<number>(workout.rating ?? 0);

  return (
    <Card style={{ marginBottom: spacing.lg, alignItems: 'center' }}>
      <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>
        КАК ПРОШЛА ТРЕНИРОВКА?
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => {
              haptic.light();
              const newRating = rating === star ? 0 : star;
              setRating(newRating);
              updateWorkoutInHistory(workout.id, { rating: newRating });
            }}
            style={{ padding: spacing.xs }}
          >
            <Text style={{ fontSize: 32, opacity: star <= rating ? 1 : 0.25 }}>⭐</Text>
          </TouchableOpacity>
        ))}
      </View>
      {rating > 0 && (
        <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          {RATING_LABELS[rating]}
        </Text>
      )}
    </Card>
  );
};
