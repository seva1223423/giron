import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../store';
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

  return (
    <View style={{
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingTop: 56, paddingBottom: spacing.md, paddingHorizontal: spacing.xl,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    }}>
      <TouchableOpacity onPress={onCancel}>
        <Text style={[typography.bodySemibold, { color: colors.error }]}>Отмена</Text>
      </TouchableOpacity>
      <View style={{ alignItems: 'center', flex: 1 }}>
        <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
          {workout.name}
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>
          {elapsed} мин {'\u2022'} {totalCompletedSets}/{totalSets} подходов
        </Text>
      </View>
      <TouchableOpacity onPress={onFinish}>
        <Text style={[typography.bodySemibold, { color: colors.success }]}>Готово</Text>
      </TouchableOpacity>
    </View>
  );
};
