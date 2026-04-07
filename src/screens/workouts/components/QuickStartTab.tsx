import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore } from '../../../store';
import { Card, Button, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { exercises as localExercises } from '../../../data/exercises';
import { Workout, WorkoutExercise, WorkoutSet } from '../../../types';

const QUICK_WORKOUTS = [
  { name: 'Грудь + Трицепс', emoji: '💪', exercises: ['bench-press', 'incline-bench-press', 'dumbbell-fly', 'tricep-pushdown', 'overhead-tricep-ext'] },
  { name: 'Спина + Бицепс', emoji: '🔥', exercises: ['deadlift', 'barbell-row', 'lat-pulldown', 'pull-ups', 'barbell-curl', 'hammer-curl'] },
  { name: 'Ноги', emoji: '🦵', exercises: ['squat', 'leg-press', 'romanian-deadlift', 'leg-curl', 'leg-extension', 'calf-raise'] },
  { name: 'Плечи + Пресс', emoji: '🎯', exercises: ['overhead-press', 'lateral-raise', 'arnold-press', 'face-pull', 'plank', 'cable-crunch'] },
  { name: 'Фулбоди', emoji: '⚡', exercises: ['squat', 'bench-press', 'barbell-row', 'overhead-press', 'barbell-curl'] },
  { name: 'Руки', emoji: '💪', exercises: ['barbell-curl', 'hammer-curl', 'preacher-curl', 'tricep-pushdown', 'french-press', 'close-grip-bench'] },
  { name: 'Базовая тройка', emoji: '🏆', exercises: ['squat', 'bench-press', 'deadlift'] },
  { name: 'Пресс + Кор', emoji: '🔩', exercises: ['plank', 'cable-crunch', 'hanging-leg-raise', 'bicycle-crunch', 'russian-twist', 'side-plank'] },
  { name: 'Кардио', emoji: '🏃', exercises: ['treadmill', 'jump-rope', 'cycling'] },
  { name: 'Тяжёлая спина', emoji: '🏋️', exercises: ['deadlift', 'barbell-row', 'pull-ups', 'lat-pulldown', 'seated-row', 'dumbbell-row'] },
  { name: 'Ноги (гантели)', emoji: '🦵', exercises: ['goblet-squat', 'lunges', 'romanian-deadlift', 'bulgarian-split-squat', 'leg-curl'] },
  { name: 'Жим + Грудь', emoji: '🎯', exercises: ['bench-press', 'incline-bench-press', 'dumbbell-bench-press', 'cable-fly', 'dips'] },
];

interface Props {
  navigation: any;
}

export const QuickStartTab: React.FC<Props> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { activeWorkout, savedTemplates, startWorkout, deleteTemplate } = useWorkoutStore();

  const createWorkoutFromTemplate = (template: typeof QUICK_WORKOUTS[0]) => {
    haptic.medium();
    const workoutExercises: WorkoutExercise[] = template.exercises
      .map((exId, index) => {
        const ex = localExercises.find((e) => e.id === exId);
        if (!ex) return null;
        const sets: WorkoutSet[] = Array.from({ length: 4 }, (_, i) => ({
          id: `set-${Date.now()}-${index}-${i}`,
          setNumber: i + 1,
          type: 'normal' as const,
          reps: 10,
          weight: 0,
          completed: false,
        }));
        return { id: `we-${Date.now()}-${index}`, exerciseId: ex.id, exercise: ex, order: index, sets, restSeconds: 0 };
      })
      .filter(Boolean) as WorkoutExercise[];

    const workout: Workout = { id: `workout-${Date.now()}`, name: template.name, exercises: workoutExercises };
    startWorkout(workout);
    navigation.navigate('ActiveWorkout');
  };

  return (
    <>
      {activeWorkout && (
        <FadeIn delay={0}>
          <Card
            style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.success }}
            onPress={() => navigation.navigate('ActiveWorkout')}
          >
            <Text style={[typography.captionMedium, { color: colors.success }]}>ПРОДОЛЖИТЬ</Text>
            <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>
              {activeWorkout.workout.name}
            </Text>
          </Card>
        </FadeIn>
      )}

      {savedTemplates.length > 0 && (
        <>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Мои шаблоны</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.sm }}
            style={{ marginBottom: spacing.xl }}
          >
            {savedTemplates.map((tpl, i) => (
              <FadeIn key={tpl.id} delay={i * 60}>
                <TouchableOpacity
                  onPress={() => {
                    haptic.medium();
                    const workout: Workout = {
                      ...tpl,
                      id: `workout-${Date.now()}`,
                      exercises: tpl.exercises.map((ex, ei) => ({
                        ...ex,
                        id: `we-${Date.now()}-${ei}`,
                        sets: ex.sets.map((s, si) => ({ ...s, id: `set-${Date.now()}-${ei}-${si}`, completed: false })),
                      })),
                    };
                    startWorkout(workout);
                    navigation.navigate('ActiveWorkout');
                  }}
                  onLongPress={() => {
                    haptic.heavy();
                    Alert.alert('Удалить шаблон?', `"${tpl.name}" будет удалён из сохранённых`, [
                      { text: 'Отмена', style: 'cancel' },
                      { text: 'Удалить', style: 'destructive', onPress: () => deleteTemplate(tpl.id) },
                    ]);
                  }}
                  style={[styles.templateCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={{ fontSize: 28, marginBottom: spacing.sm }}>⭐</Text>
                  <Text style={[typography.bodySemibold, { color: colors.text, marginBottom: spacing.xs }]} numberOfLines={2}>{tpl.name}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>{tpl.exercises.length} упр.</Text>
                </TouchableOpacity>
              </FadeIn>
            ))}
          </ScrollView>
        </>
      )}

      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Шаблоны тренировок</Text>
      {QUICK_WORKOUTS.map((template, i) => (
        <FadeIn key={i} delay={i * 80}>
          <Card style={{ marginBottom: spacing.md }} onPress={() => createWorkoutFromTemplate(template)}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 28, marginRight: spacing.md }}>{template.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodySemibold, { color: colors.text }]}>{template.name}</Text>
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                  {template.exercises.length} упражнений
                </Text>
              </View>
              <Text style={[typography.body, { color: colors.textTertiary }]}>{'>'}</Text>
            </View>
          </Card>
        </FadeIn>
      ))}

      <Button
        title="Создать свою тренировку"
        variant="outline"
        onPress={() => navigation.navigate('CustomWorkout')}
        fullWidth
        style={{ marginTop: spacing.md }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  templateCard: {
    width: 140,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
  },
});
