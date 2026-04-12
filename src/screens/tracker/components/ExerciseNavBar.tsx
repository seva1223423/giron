import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ExerciseVideoModal } from '../../workouts/exercise/ExerciseVideoModal';
import { useThemeStore, useWorkoutStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { WorkoutExercise } from '../../../types';

const MUSCLE_LABELS: Record<string, string> = {
  chest: '\u0413\u0440\u0443\u0434\u044C', back: '\u0421\u043F\u0438\u043D\u0430', shoulders: '\u041F\u043B\u0435\u0447\u0438', biceps: '\u0411\u0438\u0446\u0435\u043F\u0441', triceps: '\u0422\u0440\u0438\u0446\u0435\u043F\u0441',
  forearms: '\u041F\u0440\u0435\u0434\u043F\u043B\u0435\u0447\u044C\u044F', quadriceps: '\u041A\u0432\u0430\u0434\u0440\u0438\u0446\u0435\u043F\u0441', hamstrings: '\u0411\u0438\u0446. \u0431\u0435\u0434\u0440\u0430', glutes: '\u042F\u0433\u043E\u0434\u0438\u0446\u044B',
  calves: '\u0418\u043A\u0440\u044B', abs: '\u041F\u0440\u0435\u0441\u0441', obliques: '\u041A\u043E\u0441\u044B\u0435', traps: '\u0422\u0440\u0430\u043F\u0435\u0446\u0438\u044F', lats: '\u0428\u0438\u0440\u043E\u0447\u0430\u0439\u0448\u0438\u0435',
  lower_back: '\u041F\u043E\u044F\u0441\u043D\u0438\u0446\u0430', hip_flexors: '\u0421\u0433\u0438\u0431. \u0431\u0435\u0434\u0440\u0430', adductors: '\u041F\u0440\u0438\u0432\u043E\u0434\u044F\u0449\u0438\u0435', abductors: '\u041E\u0442\u0432\u043E\u0434\u044F\u0449\u0438\u0435',
};

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: '\u0448\u0442\u0430\u043D\u0433\u0430', dumbbell: '\u0433\u0430\u043D\u0442\u0435\u043B\u0438', machine: '\u0442\u0440\u0435\u043D\u0430\u0436\u0451\u0440',
  cable: '\u0442\u0440\u043E\u0441', bodyweight: '\u0441\u0432\u043E\u0439 \u0432\u0435\u0441', kettlebell: '\u0433\u0438\u0440\u044F',
  band: '\u0440\u0435\u0437\u0438\u043D\u043A\u0430', cardio: '\u043A\u0430\u0440\u0434\u0438\u043E', stretch: '\u0440\u0430\u0441\u0442\u044F\u0436\u043A\u0430',
};

interface Props {
  currentExercise: WorkoutExercise;
  currentExerciseIndex: number;
  totalExercises: number;
  onPrev: () => void;
  onNext: () => void;
  onSubstitute?: () => void;
  hasSessionPR?: boolean;
  navigation?: any;
}

export const ExerciseNavBar: React.FC<Props> = ({ currentExercise, currentExerciseIndex, totalExercises, onPrev, onNext, onSubstitute, hasSessionPR, navigation }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  const [videoVisible, setVideoVisible] = useState(false);

  const muscles = currentExercise.exercise.primaryMuscles || [];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.xl, backgroundColor: colors.surface }}>
      <TouchableOpacity
        onPress={() => { haptic.selection(); onPrev(); }}
        disabled={currentExerciseIndex === 0}
        style={{ opacity: currentExerciseIndex === 0 ? 0.3 : 1, padding: 4 }}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Text style={[typography.h3, { color: colors.primary }]}>{'\u2039'}</Text>
      </TouchableOpacity>

      <View style={{ alignItems: 'center', flex: 1 }}>
        {/* Exercise counter pill + PR badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 }}>
          <View style={{
            paddingHorizontal: spacing.sm, paddingVertical: 2,
            borderRadius: borderRadius.full, backgroundColor: colors.primary + '18',
          }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }} numberOfLines={1}>
              {currentExerciseIndex + 1} / {totalExercises}
            </Text>
          </View>
          {currentExercise.supersetGroupId && (
            <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: borderRadius.sm, backgroundColor: colors.accent + '20', borderWidth: 1, borderColor: colors.accent + '60' }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: colors.accent, letterSpacing: 0.5 }}>SS</Text>
            </View>
          )}
          {hasSessionPR && (
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.sm, backgroundColor: '#FFD700' + '30', borderWidth: 1, borderColor: '#FFD700' + '80' }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#D4A800', letterSpacing: 0.5 }}>PR</Text>
            </View>
          )}
        </View>

        <Text style={[typography.h4, { color: colors.text }]} numberOfLines={1}>
          {currentExercise.exercise.name}
        </Text>

        {/* Muscle group chips */}
        {muscles.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {muscles.slice(0, 3).map((m) => (
              <View key={m} style={{
                paddingHorizontal: 6, paddingVertical: 1,
                borderRadius: borderRadius.full, backgroundColor: colors.border,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textSecondary }}>
                  {MUSCLE_LABELS[m] || m}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Equipment type indicator */}
        {currentExercise.exercise.type && (
          <Text style={{ fontSize: 9, fontWeight: '500', color: colors.textTertiary, marginTop: 2, letterSpacing: 0.3 }}>
            {EQUIPMENT_LABELS[currentExercise.exercise.type] || currentExercise.exercise.type}
          </Text>
        )}

        {/* Actions row: substitute + YouTube */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          {onSubstitute && (
            <TouchableOpacity
              onPress={() => { haptic.selection(); onSubstitute(); }}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[typography.caption, { color: colors.textSecondary }]}>{'замена'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => { haptic.light(); setVideoVisible(true); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 3,
              paddingHorizontal: 6, paddingVertical: 2,
              borderRadius: borderRadius.sm,
              backgroundColor: currentExercise.exercise.youtubeId ? '#FF000015' : colors.border,
            }}
          >
            <Text style={{ fontSize: 10, color: currentExercise.exercise.youtubeId ? '#FF0000' : colors.textTertiary }}>{'\u25B6'}</Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: currentExercise.exercise.youtubeId ? '#FF0000' : colors.textTertiary }}>{'video'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => { haptic.selection(); onNext(); }}
        disabled={currentExerciseIndex === totalExercises - 1}
        style={{ opacity: currentExerciseIndex === totalExercises - 1 ? 0.3 : 1, padding: 4 }}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Text style={[typography.h3, { color: colors.primary }]}>{'\u203A'}</Text>
      </TouchableOpacity>

      <ExerciseVideoModal
        visible={videoVisible}
        onClose={() => setVideoVisible(false)}
        exerciseName={currentExercise.exercise.name}
        youtubeId={currentExercise.exercise.youtubeId}
        primaryMuscles={currentExercise.exercise.primaryMuscles || []}
        muscleLabels={MUSCLE_LABELS}
        description={currentExercise.exercise.description}
        instructions={currentExercise.exercise.instructions}
      />
    </View>
  );
};
