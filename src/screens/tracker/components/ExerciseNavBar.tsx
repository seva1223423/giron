import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { WorkoutExercise } from '../../../types';

interface Props {
  currentExercise: WorkoutExercise;
  currentExerciseIndex: number;
  totalExercises: number;
  onPrev: () => void;
  onNext: () => void;
  onSubstitute?: () => void;
}

export const ExerciseNavBar: React.FC<Props> = ({ currentExercise, currentExerciseIndex, totalExercises, onPrev, onNext, onSubstitute }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.xl, backgroundColor: colors.surface }}>
      <TouchableOpacity
        onPress={() => { haptic.selection(); onPrev(); }}
        disabled={currentExerciseIndex === 0}
        style={{ opacity: currentExerciseIndex === 0 ? 0.3 : 1 }}
      >
        <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
      </TouchableOpacity>

      <View style={{ alignItems: 'center', flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
            {currentExerciseIndex + 1} из {totalExercises}
          </Text>
          {currentExercise.supersetGroupId && (
            <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: borderRadius.sm, backgroundColor: colors.accent + '20', borderWidth: 1, borderColor: colors.accent + '60' }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: colors.accent, letterSpacing: 0.5 }}>SS</Text>
            </View>
          )}
        </View>
        <Text style={[typography.h4, { color: colors.text }]} numberOfLines={1}>
          {currentExercise.exercise.name}
        </Text>
        {onSubstitute && (
          <TouchableOpacity onPress={onSubstitute} style={{ marginTop: 2, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>замена</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        onPress={() => { haptic.selection(); onNext(); }}
        disabled={currentExerciseIndex === totalExercises - 1}
        style={{ opacity: currentExerciseIndex === totalExercises - 1 ? 0.3 : 1 }}
      >
        <Text style={[typography.h3, { color: colors.primary }]}>{'›'}</Text>
      </TouchableOpacity>
    </View>
  );
};
