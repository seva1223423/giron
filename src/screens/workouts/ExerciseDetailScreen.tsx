import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { ExerciseVideoCard, ExerciseStatsCard } from './exercise';

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
  triceps: 'Трицепс', forearms: 'Предплечья', quadriceps: 'Квадрицепс',
  hamstrings: 'Бицепс бедра', glutes: 'Ягодицы', calves: 'Икры',
  abs: 'Пресс', obliques: 'Косые', traps: 'Трапеции', lats: 'Широчайшие',
  lower_back: 'Поясница', hip_flexors: 'Сгибатели бедра',
  adductors: 'Приводящие', abductors: 'Отводящие',
};

const TYPE_LABELS: Record<string, string> = {
  barbell: 'Штанга', dumbbell: 'Гантели', machine: 'Тренажёр',
  cable: 'Блок', bodyweight: 'Своё тело', kettlebell: 'Гиря',
  band: 'Резинка', cardio: 'Кардио', stretch: 'Растяжка',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый', expert: 'Эксперт',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: '#4CAF50', intermediate: '#FF9800', advanced: '#F44336', expert: '#9C27B0',
};

export const ExerciseDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const haptic = useHaptic();
  const { exerciseId } = route.params;
  const { colors } = useThemeStore();
  const { workoutHistory, activeWorkout, addExerciseToWorkout, customExercises } = useWorkoutStore();
  const allExercises = useMemo(() => [...customExercises, ...localExercises], [customExercises]);

  const exercise = allExercises.find((e) => e.id === exerciseId);
  if (!exercise) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[typography.h3, { color: colors.text }]}>Упражнение не найдено</Text>
        <Button title="Назад" onPress={() => navigation.goBack()} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  const exerciseHistory = useMemo(() =>
    workoutHistory
      .filter((w) => w.exercises.some((e) => e.exerciseId === exerciseId))
      .map((w) => {
        const ex = w.exercises.find((e) => e.exerciseId === exerciseId)!;
        const completedSets = ex.sets.filter((s) => s.completed && s.weight && s.reps);
        const bestSet = [...completedSets].sort((a, b) => (b.weight || 0) * (b.reps || 0) - (a.weight || 0) * (a.reps || 0))[0];
        return {
          date: w.completedAt || w.startedAt || '',
          sets: ex.sets.filter((s) => s.completed),
          bestWeight: bestSet?.weight || 0,
          bestReps: bestSet?.reps || 0,
          totalVolume: completedSets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0),
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  [workoutHistory, exerciseId]);

  const maxWeight = Math.max(0, ...exerciseHistory.map((h) => h.bestWeight));

  const estimated1RM = useMemo(() => {
    let best = 0;
    workoutHistory.forEach((w) => {
      w.exercises.filter((e) => e.exerciseId === exerciseId).forEach((e) => {
        e.sets.filter((s) => s.completed && s.weight && s.reps).forEach((s) => {
          const rm = (s.weight || 0) * (1 + (s.reps || 0) / 30);
          if (rm > best) best = rm;
        });
      });
    });
    return best > 0 ? Math.round(best) : 0;
  }, [workoutHistory, exerciseId]);

  const oneRMTrend = useMemo(() => {
    const sessions = [...exerciseHistory].reverse().slice(-30);
    return sessions.map((h, i) => ({
      label: sessions.length <= 10 || i % Math.ceil(sessions.length / 10) === 0
        ? new Date(h.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(' ', '')
        : '',
      value: Math.round(h.bestWeight * (1 + h.bestReps / 30)),
    }));
  }, [exerciseHistory]);

  const difficultyColor = DIFFICULTY_COLORS[exercise.difficulty] || colors.textSecondary;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <FadeIn delay={0} from="top">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[typography.h3, { color: colors.primary }]}>{'‹'} </Text>
          </TouchableOpacity>
          <Text style={[typography.h2, { color: colors.text, flex: 1 }]} numberOfLines={2}>{exercise.name}</Text>
        </View>
      </FadeIn>

      <FadeIn delay={80}>
        <View style={styles.tagsRow}>
          <View style={[styles.tag, { backgroundColor: difficultyColor + '20' }]}>
            <Text style={[typography.captionMedium, { color: difficultyColor }]}>{DIFFICULTY_LABELS[exercise.difficulty] || exercise.difficulty}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[typography.captionMedium, { color: colors.primary }]}>{TYPE_LABELS[exercise.type] || exercise.type}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.info + '15' }]}>
            <Text style={[typography.captionMedium, { color: colors.info }]}>
              {exercise.category === 'strength' ? 'Силовое' : exercise.category === 'cardio' ? 'Кардио' : exercise.category}
            </Text>
          </View>
        </View>
      </FadeIn>

      {activeWorkout && (
        <FadeIn delay={120}>
          <TouchableOpacity
            onPress={() => {
              if (activeWorkout.workout.exercises.some((e) => e.exerciseId === exerciseId)) {
                Alert.alert('Уже добавлено', 'Это упражнение уже есть в текущей тренировке.');
                return;
              }
              haptic.success();
              addExerciseToWorkout(exercise);
              Alert.alert('Добавлено!', `${exercise.name} добавлено в тренировку.`, [
                { text: 'Продолжить просмотр' },
                { text: 'К тренировке', onPress: () => navigation.navigate('ActiveWorkout') },
              ]);
            }}
            style={[{ backgroundColor: colors.success + '18', borderWidth: 1, borderColor: colors.success + '50', borderRadius: borderRadius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }]}
          >
            <Text style={{ fontSize: 18 }}>➕</Text>
            <Text style={[typography.bodySemibold, { color: colors.success }]}>Добавить в текущую тренировку</Text>
          </TouchableOpacity>
        </FadeIn>
      )}

      <FadeIn delay={160}>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>{exercise.description}</Text>
      </FadeIn>

      <FadeIn delay={200}>
        <ExerciseVideoCard exerciseName={exercise.name} youtubeId={exercise.youtubeId} primaryMuscles={exercise.primaryMuscles} muscleLabels={MUSCLE_LABELS} />
      </FadeIn>

      <FadeIn delay={240}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Мышцы</Text>
          <Text style={[typography.smallMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Основные:</Text>
          <View style={styles.muscleRow}>
            {exercise.primaryMuscles.map((m) => (
              <View key={m} style={[styles.muscleChip, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[typography.captionMedium, { color: colors.primary }]}>{MUSCLE_LABELS[m] || m}</Text>
              </View>
            ))}
          </View>
          {exercise.secondaryMuscles.length > 0 && (
            <>
              <Text style={[typography.smallMedium, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}>Вспомогательные:</Text>
              <View style={styles.muscleRow}>
                {exercise.secondaryMuscles.map((m) => (
                  <View key={m} style={[styles.muscleChip, { backgroundColor: colors.surface }]}>
                    <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>{MUSCLE_LABELS[m] || m}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>
      </FadeIn>

      <FadeIn delay={320}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Техника выполнения</Text>
          {exercise.instructions.map((inst, i) => (
            <View key={i} style={styles.instructionRow}>
              <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
              </View>
              <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{inst}</Text>
            </View>
          ))}
        </Card>
      </FadeIn>

      <ExerciseStatsCard exerciseHistory={exerciseHistory} maxWeight={maxWeight} estimated1RM={estimated1RM} oneRMTrend={oneRMTrend} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, gap: spacing.sm },
  tagsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  tag: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm },
  muscleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muscleChip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.full },
  instructionRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md, gap: spacing.md },
  stepNumber: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
});
