import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { Workout } from '../../../types';

interface Props {
  lastWorkout: Workout;
  daysSinceLastWorkout: number;
  activeWorkout: any | null;
  onRepeat: () => void;
}

export const LastWorkoutCard: React.FC<Props> = ({ lastWorkout, daysSinceLastWorkout, activeWorkout, onRepeat }) => {
  const { colors } = useThemeStore();

  const label =
    daysSinceLastWorkout === 0 ? 'СЕГОДНЯ' :
    daysSinceLastWorkout === 1 ? 'ВЧЕРА' :
    `${daysSinceLastWorkout} ДНЯ НАЗАД`;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
        <Text style={[typography.captionMedium, { color: colors.textTertiary }]}>{label}</Text>
        {!activeWorkout && (
          <TouchableOpacity
            onPress={onRepeat}
            style={{ backgroundColor: colors.primary + '15', paddingVertical: 4, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm }}
          >
            <Text style={[typography.captionMedium, { color: colors.primary }]}>🔁 Повторить</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.xs }]} numberOfLines={1}>
        {lastWorkout.name}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
        {lastWorkout.exercises.length > 0 && (
          <View>
            <Text style={[typography.numberSmall, { color: colors.primary, fontSize: 18 }]}>
              {lastWorkout.exercises.length}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>упр.</Text>
          </View>
        )}
        {!!lastWorkout.durationMinutes && (
          <View>
            <Text style={[typography.numberSmall, { color: colors.accent, fontSize: 18 }]}>
              {lastWorkout.durationMinutes}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>мин</Text>
          </View>
        )}
        {!!lastWorkout.totalVolume && (
          <View>
            <Text style={[typography.numberSmall, { color: colors.success, fontSize: 18 }]}>
              {Math.round(lastWorkout.totalVolume)}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>кг объём</Text>
          </View>
        )}
      </View>
    </Card>
  );
};
