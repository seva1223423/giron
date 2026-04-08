import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../store';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';

interface Props {
  workout: Workout;
  elapsed: number;
  totalCompletedSets: number;
  totalSets: number;
  onCancel: () => void;
  onFinish: () => void;
}

export const WorkoutHeader: React.FC<Props> = ({ workout, elapsed, totalCompletedSets, totalSets, onCancel, onFinish }) => {
  const { colors } = useThemeStore();
  const { workoutDurationGoal } = useSettingsStore();
  const safeTop = useSafeTop();

  const goalText = workoutDurationGoal > 0 ? (() => {
    const remaining = workoutDurationGoal - elapsed;
    if (remaining > 0) {
      return { text: `осталось ${remaining} мин`, color: colors.success };
    }
    return { text: `\u2212${Math.abs(remaining)} мин (перебор)`, color: '#F59E0B' };
  })() : null;

  return (
    <View style={{
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingTop: safeTop, paddingBottom: spacing.md, paddingHorizontal: spacing.xl,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    }}>
      <TouchableOpacity onPress={onCancel}>
        <Text style={[typography.bodySemibold, { color: colors.error }]}>Отмена</Text>
      </TouchableOpacity>
      <View style={{ alignItems: 'center', flex: 1 }}>
        <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
          {workout.name}
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
          {elapsed} мин {'\u2022'} {totalCompletedSets}/{totalSets} подходов
          {goalText ? ` \u2022 ` : ''}
          {goalText && <Text style={{ color: goalText.color }}>{goalText.text}</Text>}
        </Text>
      </View>
      <TouchableOpacity onPress={onFinish}>
        <Text style={[typography.bodySemibold, { color: colors.success }]}>Готово</Text>
      </TouchableOpacity>
    </View>
  );
};
