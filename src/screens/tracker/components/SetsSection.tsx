import React, { useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert, useWindowDimensions } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore } from '../../../store';
import { Card, Button, AnimatedPressable } from '../../../components';
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
  onRpeSelected?: (rpe: number) => void;
}

export const SetsSection: React.FC<Props> = ({
  currentExercise, currentExerciseIndex, workout, previousSets, navigation, onCompleteSet, onRpeSelected,
}) => {
  const { width: screenW } = useWindowDimensions();
  const SHOW_PLATE_CALC = screenW > 360;
  const haptic = useHaptic();
  const { colors } = useThemeStore();

  // Progressive overload suggestion: if all prev sets hit target reps, suggest +2.5kg
  const overloadSuggestion = useMemo(() => {
    if (!previousSets || previousSets.sets.length === 0) return null;
    const completedPrev = previousSets.sets.filter((s) => s.weight && s.reps);
    if (completedPrev.length === 0) return null;
    const firstWorking = currentExercise.sets.find((s) => s.type !== 'warmup');
    const targetReps = firstWorking?.reps || 8;
    const allHitTarget = completedPrev.every((s) => (s.reps || 0) >= targetReps);
    const prevMaxWeight = Math.max(...completedPrev.map((s) => s.weight || 0));
    if (allHitTarget && prevMaxWeight > 0) return prevMaxWeight + 2.5;
    return null;
  }, [previousSets, currentExercise.sets]);

  // Suggested weights per set from previous session + overload
  const suggestedWeights = useMemo(() => {
    if (!previousSets) return null;
    return currentExercise.sets.map((_, i) => {
      const prev = previousSets.sets[i];
      if (!prev?.weight) return null;
      if (overloadSuggestion !== null) {
        return { weight: prev.weight + 2.5, reps: prev.reps || 0, isOverload: true };
      }
      return { weight: prev.weight, reps: prev.reps || 0, isOverload: false };
    });
  }, [previousSets, overloadSuggestion, currentExercise.sets]);

  const suggestedRpe = useMemo(() => {
    const { workoutHistory } = useWorkoutStore.getState();
    const exId = currentExercise.exerciseId;
    const rpes: number[] = [];
    const relevantWorkouts = workoutHistory
      .filter((w) => w.exercises.some((e) => e.exerciseId === exId))
      .slice(0, 3);
    relevantWorkouts.forEach((w) => {
      w.exercises
        .filter((e) => e.exerciseId === exId)
        .forEach((e) => {
          e.sets.filter((s) => s.completed && s.rpe).forEach((s) => rpes.push(s.rpe!));
        });
    });
    if (rpes.length === 0) return undefined;
    const avg = rpes.reduce((a, b) => a + b, 0) / rpes.length;
    return Math.round(avg * 2) / 2; // round to nearest 0.5
  }, [currentExercise.exerciseId]);

  const {
    addSet, removeSet, updateSetData, setExerciseNotes, setWorkoutNotes,
    toggleSuperset, generateWarmupSets, removeExerciseFromWorkout,
  } = useWorkoutStore();

  // "Copy from last" handler
  const handleCopyFromLast = () => {
    if (!previousSets) return;
    haptic.medium();
    previousSets.sets.forEach((prev, i) => {
      if (i < currentExercise.sets.length && !currentExercise.sets[i].completed) {
        updateSetData(currentExerciseIndex, i, {
          weight: prev.weight || 0,
          reps: prev.reps || 0,
        });
      }
    });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge * 2 }} showsVerticalScrollIndicator={false}>
      {/* Previous session summary */}
      {previousSets && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1,
          backgroundColor: colors.surface, borderColor: colors.border, marginBottom: spacing.sm,
          borderLeftWidth: 3, borderLeftColor: colors.success + '80',
        }}>
          <Text style={[typography.captionMedium, { color: colors.textTertiary, marginRight: spacing.sm }]}>
            {'\u21A9 '}
            {previousSets.date ? new Date(previousSets.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}:
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {previousSets.sets.slice(0, 6).map((s, i) => (
                <Text key={i} style={[typography.captionMedium, { color: colors.textSecondary }]}>
                  {s.weight ? `${s.weight}\u00D7${s.reps}` : `${s.reps} \u043F\u0432\u0442`}
                </Text>
              ))}
              {previousSets.sets.length > 6 && (
                <Text style={[typography.caption, { color: colors.textTertiary }]}>+{previousSets.sets.length - 6}</Text>
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Suggested weights per set from previous session */}
      {suggestedWeights && suggestedWeights.some((s) => s !== null) && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
          paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
          borderRadius: borderRadius.md, borderWidth: 1,
          backgroundColor: colors.primary + '08', borderColor: colors.primary + '30',
          marginBottom: spacing.sm,
        }}>
          <Text style={[typography.caption, { color: colors.primary }]} numberOfLines={2}>
            {'\u{1F3AF} '}
            {suggestedWeights.map((s, i) => {
              if (!s) return null;
              return `${i + 1}: ${s.weight}\u043A\u0433`;
            }).filter(Boolean).join(' \u2022 ')}
            {overloadSuggestion !== null ? ' (+2.5)' : ''}
          </Text>
        </View>
      )}

      {/* Progressive overload suggestion */}
      {overloadSuggestion !== null && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
          paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
          borderRadius: borderRadius.md, borderWidth: 1,
          backgroundColor: colors.success + '12', borderColor: colors.success + '40',
          marginBottom: spacing.sm,
        }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.success + '18', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '700', color: colors.success }}>{'\u25B2'}</Text></View>
          <Text style={[typography.caption, { color: colors.success, flex: 1 }]} numberOfLines={2}>
            {'\u0412 \u043F\u0440\u043E\u0448\u043B\u044B\u0439 \u0440\u0430\u0437 \u0432\u0441\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u044B \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u044B \u2014 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 '}
            <Text style={{ fontWeight: '700' }}>{overloadSuggestion} {'\u043A\u0433'}</Text> {'\u0441\u0435\u0433\u043E\u0434\u043D\u044F (+2.5)'}
          </Text>
        </View>
      )}

      {/* Copy from last button */}
      {previousSets && previousSets.sets.length > 0 && currentExercise.sets.some((s) => !s.completed) && (
        <AnimatedPressable
          onPress={handleCopyFromLast}
          haptic={false}
          scaleDown={0.97}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
            borderRadius: borderRadius.md, borderWidth: 1, borderStyle: 'dashed',
            borderColor: colors.primary + '60', marginBottom: spacing.md,
          }}
        >
          <Text style={[typography.smallMedium, { color: colors.primary }]} numberOfLines={1}>
            {'↩ Копировать из прошлого раза'}
          </Text>
        </AnimatedPressable>
      )}

      {/* Table header — columns must mirror SetRow layout exactly */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, paddingHorizontal: spacing.sm, gap: spacing.md }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, width: 40 }]}>{'\u0421\u0435\u0442'}</Text>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, flex: 1, textAlign: 'center' }]}>{'\u0412\u0435\u0441 (\u043A\u0433)'}</Text>
        {SHOW_PLATE_CALC && <View style={{ width: 28 }} />}
        <Text style={[typography.captionMedium, { color: colors.textSecondary, flex: 1, textAlign: 'center' }]}>{'\u041F\u043E\u0432\u0442.'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Sets */}
      {currentExercise.sets.map((set, setIndex) => (
        <SetRow
          key={set.id}
          set={set}
          setIndex={setIndex}
          prevSet={previousSets?.sets[setIndex] ?? null}
          suggestedRpe={suggestedRpe}
          onComplete={(reps, weight) => onCompleteSet(setIndex, reps, weight)}
          onRpeChange={(rpe) => { updateSetData(currentExerciseIndex, setIndex, { rpe }); onRpeSelected?.(rpe); }}
          onRemove={currentExercise.sets.length > 1 ? () => { haptic.medium(); removeSet(currentExerciseIndex, setIndex); } : undefined}
          onTypeChange={(type) => updateSetData(currentExerciseIndex, setIndex, { type: type as any })}
          onOpenPlates={(w) => navigation.navigate('PlateCalculator', { initialWeight: w })}
          colors={colors}
        />
      ))}

      {/* Mini-summary of completed sets */}
      {(() => {
        const completedSets = currentExercise.sets.filter((s) => s.completed && s.weight && s.reps);
        if (completedSets.length === 0) return null;
        const totalVol = completedSets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0);
        const maxWeight = Math.max(...completedSets.map((s) => s.weight || 0));
        const avgRpe = completedSets.filter((s) => s.rpe).reduce((sum, s, _, arr) => sum + (s.rpe || 0) / arr.length, 0);
        // Rest recommendation based on RPE: high RPE → longer rest
        let restRec = '';
        if (avgRpe > 0) {
          if (avgRpe >= 9) restRec = '3–5 мин отдыха';
          else if (avgRpe >= 7.5) restRec = '2–3 мин отдыха';
          else restRec = '1–2 мин отдыха';
        }
        return (
          <View style={{
            marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
            borderRadius: borderRadius.md, backgroundColor: colors.primary + '08',
            borderWidth: 1, borderColor: colors.primary + '20',
            flexDirection: 'row', alignItems: 'center', gap: spacing.md,
          }}>
            <Text style={[typography.captionMedium, { color: colors.primary }]}>
              {completedSets.length} подх. · {Math.round(totalVol)} кг · макс {maxWeight} кг
            </Text>
            {restRec !== '' && (
              <Text style={[typography.caption, { color: colors.textTertiary }]}>
                · {restRec}
              </Text>
            )}
          </View>
        );
      })()}

      {/* Quick set templates */}
      {currentExercise.sets.length <= 1 && (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          {[
            { label: '3×10', sets: 3, reps: 10 },
            { label: '4×8', sets: 4, reps: 8 },
            { label: '5×5', sets: 5, reps: 5 },
          ].map((template) => (
            <AnimatedPressable
              key={template.label}
              onPress={() => {
                haptic.selection();
                const currentSets = currentExercise.sets.length;
                for (let i = currentSets; i < template.sets; i++) {
                  addSet(currentExerciseIndex);
                }
                currentExercise.sets.forEach((_, idx) => {
                  updateSetData(currentExerciseIndex, idx, { reps: template.reps });
                });
              }}
              haptic={false}
              scaleDown={0.94}
              style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>{template.label}</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}

      {/* Add set + warmup */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <Button
          title="+ \u041F\u043E\u0434\u0445\u043E\u0434"
          variant="ghost"
          size="sm"
          onPress={() => addSet(currentExerciseIndex)}
          style={{ flex: 1 }}
        />
        {!currentExercise.sets.some((s) => s.type === 'warmup') &&
          currentExercise.sets.some((s) => (s.weight || 0) > 0) && (
            <Button
              title="Разминка"
              variant="secondary"
              size="sm"
              onPress={() => {
                const workingSet = currentExercise.sets.find((s) => (s.weight || 0) > 0);
                if (workingSet?.weight) generateWarmupSets(currentExerciseIndex, workingSet.weight);
              }}
              style={{ flex: 1 }}
            />
          )}
      </View>

      {/* Exercise notes */}
      <TextInput
        style={{ marginTop: spacing.xl, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, minHeight: 40, maxHeight: 80, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }}
        value={currentExercise.notes || ''}
        onChangeText={(text) => setExerciseNotes(currentExerciseIndex, text)}
        placeholder={'\u0417\u0430\u043C\u0435\u0442\u043A\u0438 \u043A \u0443\u043F\u0440\u0430\u0436\u043D\u0435\u043D\u0438\u044E...'}
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
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center', marginRight: spacing.xs }}><Text style={{ fontSize: 10, fontWeight: '800', color: colors.accent }}>SS</Text></View>
          <Text style={[typography.small, { color: currentExercise.supersetGroupId ? colors.accent : colors.textSecondary }]}>
            {currentExercise.supersetGroupId
              ? `\u0421\u0443\u043F\u0435\u0440\u0441\u0435\u0442 \u0441\u043E \u00AB${workout.exercises[currentExerciseIndex + 1]?.exercise.name}\u00BB \u2014 \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C`
              : `\u0421\u0443\u043F\u0435\u0440\u0441\u0435\u0442 \u0441\u043E \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u043C: ${workout.exercises[currentExerciseIndex + 1]?.exercise.name}`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Remove exercise */}
      {workout.exercises.length > 1 && (
        <TouchableOpacity
          onPress={() => {
            haptic.medium();
            Alert.alert(
              '\u0423\u0431\u0440\u0430\u0442\u044C \u0443\u043F\u0440\u0430\u0436\u043D\u0435\u043D\u0438\u0435?',
              `\u00AB${currentExercise.exercise.name}\u00BB \u0431\u0443\u0434\u0435\u0442 \u0443\u0434\u0430\u043B\u0435\u043D\u043E \u0438\u0437 \u0442\u0440\u0435\u043D\u0438\u0440\u043E\u0432\u043A\u0438.`,
              [
                { text: '\u041E\u0442\u043C\u0435\u043D\u0430', style: 'cancel' },
                { text: '\u0423\u0431\u0440\u0430\u0442\u044C', style: 'destructive', onPress: () => { haptic.warning(); removeExerciseFromWorkout(currentExerciseIndex); } },
              ]
            );
          }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.error + '50' }}
        >
          <Text style={{ fontSize: 14, marginRight: spacing.xs }}>{'\uD83D\uDDD1'}</Text>
          <Text style={[typography.small, { color: colors.error }]}>{'\u0423\u0431\u0440\u0430\u0442\u044C \u0443\u043F\u0440\u0430\u0436\u043D\u0435\u043D\u0438\u0435'}</Text>
        </TouchableOpacity>
      )}

      {/* Workout notes */}
      <TextInput
        style={{ marginTop: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, minHeight: 40, maxHeight: 80, backgroundColor: colors.inputBackground, borderColor: colors.primary + '30', color: colors.text }}
        value={workout.notes || ''}
        onChangeText={(text) => setWorkoutNotes(text)}
        placeholder={'\u041E\u0431\u0449\u0438\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u043A \u0442\u0440\u0435\u043D\u0438\u0440\u043E\u0432\u043A\u0435...'}
        placeholderTextColor={colors.inputPlaceholder}
        multiline
        maxLength={500}
      />

      {/* Exercise instructions */}
      <Card style={{ marginTop: spacing.md }}>
        <Text style={[typography.smallMedium, { color: colors.text, marginBottom: spacing.sm }]}>{'\u0422\u0435\u0445\u043D\u0438\u043A\u0430:'}</Text>
        {currentExercise.exercise.instructions.map((inst, i) => (
          <Text key={i} style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
            {i + 1}. {inst}
          </Text>
        ))}
      </Card>
    </ScrollView>
  );
};
