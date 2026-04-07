import React from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore } from '../../../store';
import { Card, Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { Workout, WorkoutExercise } from '../../../types';
import { SetRow } from './SetRow';

interface PreviousSets {
  date: string | null | undefined;
  sets: Array<{ weight?: number; reps?: number }>;
}

interface Props {
  currentExercise: WorkoutExercise;
  currentExerciseIndex: number;
  workout: Workout;
  previousSets: PreviousSets | null;
  navigation: any;
  onCompleteSet: (setIndex: number, reps: number, weight: number) => void;
}

export const SetsSection: React.FC<Props> = ({
  currentExercise, currentExerciseIndex, workout, previousSets, navigation, onCompleteSet,
}) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const {
    addSet, removeSet, updateSetData, setExerciseNotes, setWorkoutNotes,
    toggleSuperset, generateWarmupSets, removeExerciseFromWorkout,
  } = useWorkoutStore();

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge * 2 }} showsVerticalScrollIndicator={false}>
      {/* Previous session summary */}
      {previousSets && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1,
          backgroundColor: colors.surface, borderColor: colors.border, marginBottom: spacing.sm,
        }}>
          <Text style={[typography.captionMedium, { color: colors.textTertiary, marginRight: spacing.sm }]}>
            {'↩ '}
            {new Date(previousSets.date!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}:
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {previousSets.sets.slice(0, 6).map((s, i) => (
                <Text key={i} style={[typography.captionMedium, { color: colors.textSecondary }]}>
                  {s.weight ? `${s.weight}×${s.reps}` : `${s.reps} пвт`}
                </Text>
              ))}
              {previousSets.sets.length > 6 && (
                <Text style={[typography.caption, { color: colors.textTertiary }]}>+{previousSets.sets.length - 6}</Text>
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Table header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, paddingHorizontal: spacing.sm, gap: spacing.md }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, width: 40 }]}>Сет</Text>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, flex: 1, textAlign: 'center' }]}>Вес (кг)</Text>
        <View style={{ width: 28 }} />
        <Text style={[typography.captionMedium, { color: colors.textSecondary, flex: 1, textAlign: 'center' }]}>Повт.</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Sets */}
      {currentExercise.sets.map((set, setIndex) => (
        <SetRow
          key={set.id}
          set={set}
          setIndex={setIndex}
          prevSet={previousSets?.sets[setIndex] ?? null}
          onComplete={(reps, weight) => onCompleteSet(setIndex, reps, weight)}
          onRpeChange={(rpe) => updateSetData(currentExerciseIndex, setIndex, { rpe })}
          onRemove={currentExercise.sets.length > 1 ? () => { haptic.medium(); removeSet(currentExerciseIndex, setIndex); } : undefined}
          onTypeChange={(type) => updateSetData(currentExerciseIndex, setIndex, { type: type as any })}
          onOpenPlates={(w) => navigation.navigate('PlateCalculator', { initialWeight: w })}
          colors={colors}
        />
      ))}

      {/* Add set + warmup */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <Button
          title="+ Подход"
          variant="ghost"
          size="sm"
          onPress={() => addSet(currentExerciseIndex)}
          style={{ flex: 1 }}
        />
        {!currentExercise.sets.some((s) => s.type === 'warmup') &&
          currentExercise.sets.some((s) => (s.weight || 0) > 0) && (
            <TouchableOpacity
              onPress={() => {
                haptic.selection();
                const workingSet = currentExercise.sets.find((s) => (s.weight || 0) > 0);
                if (workingSet?.weight) generateWarmupSets(currentExerciseIndex, workingSet.weight);
              }}
              style={{ flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>🔥 Разминка</Text>
            </TouchableOpacity>
          )}
      </View>

      {/* Exercise notes */}
      <TextInput
        style={{ marginTop: spacing.xl, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, minHeight: 40, maxHeight: 80, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }}
        value={currentExercise.notes || ''}
        onChangeText={(text) => setExerciseNotes(currentExerciseIndex, text)}
        placeholder="Заметки к упражнению..."
        placeholderTextColor={colors.inputPlaceholder}
        multiline
        maxLength={300}
      />

      {/* Superset toggle */}
      {currentExerciseIndex < workout.exercises.length - 1 && (
        <TouchableOpacity
          onPress={() => { haptic.selection(); toggleSuperset(currentExerciseIndex); }}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, backgroundColor: currentExercise.supersetGroupId ? colors.accent + '15' : colors.surface, borderColor: currentExercise.supersetGroupId ? colors.accent + '80' : colors.border }}
        >
          <Text style={{ fontSize: 14, marginRight: spacing.xs }}>⚡</Text>
          <Text style={[typography.small, { color: currentExercise.supersetGroupId ? colors.accent : colors.textSecondary }]}>
            {currentExercise.supersetGroupId
              ? `Суперсет со «${workout.exercises[currentExerciseIndex + 1]?.exercise.name}» — отменить`
              : `Суперсет со следующим: ${workout.exercises[currentExerciseIndex + 1]?.exercise.name}`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Remove exercise */}
      {workout.exercises.length > 1 && (
        <TouchableOpacity
          onPress={() => {
            haptic.medium();
            Alert.alert(
              'Убрать упражнение?',
              `«${currentExercise.exercise.name}» будет удалено из тренировки.`,
              [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Убрать', style: 'destructive', onPress: () => { haptic.warning(); removeExerciseFromWorkout(currentExerciseIndex); } },
              ]
            );
          }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.error + '50' }}
        >
          <Text style={{ fontSize: 14, marginRight: spacing.xs }}>🗑</Text>
          <Text style={[typography.small, { color: colors.error }]}>Убрать упражнение</Text>
        </TouchableOpacity>
      )}

      {/* Workout notes */}
      <TextInput
        style={{ marginTop: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, minHeight: 40, maxHeight: 80, backgroundColor: colors.inputBackground, borderColor: colors.primary + '30', color: colors.text }}
        value={workout.notes || ''}
        onChangeText={(text) => setWorkoutNotes(text)}
        placeholder="Общие заметки к тренировке..."
        placeholderTextColor={colors.inputPlaceholder}
        multiline
        maxLength={500}
      />

      {/* Exercise instructions */}
      <Card style={{ marginTop: spacing.md }}>
        <Text style={[typography.smallMedium, { color: colors.text, marginBottom: spacing.sm }]}>Техника:</Text>
        {currentExercise.exercise.instructions.map((inst, i) => (
          <Text key={i} style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
            {i + 1}. {inst}
          </Text>
        ))}
      </Card>
    </ScrollView>
  );
};
