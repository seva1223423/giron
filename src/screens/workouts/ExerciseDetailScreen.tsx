import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn, AnimatedPressable } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { ExerciseVideoCard, ExerciseStatsCard } from './exercise';
import { exerciseVideoSource, exerciseThumbSource } from '../../config/store';

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
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { exerciseId } = route.params ?? {};
  const colors = useThemeColors();
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
      .sort((a, b) => (b.date ? new Date(b.date).getTime() : 0) - (a.date ? new Date(a.date).getTime() : 0)),
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
    return sessions.map((h, i) => {
      const d = h.date ? new Date(h.date) : null;
      const validDate = d && !isNaN(d.getTime());
      return {
        label: sessions.length <= 10 || i % Math.ceil(sessions.length / 10) === 0
          ? validDate ? d!.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(' ', '') : ''
          : '',
        value: Math.round(h.bestWeight * (1 + h.bestReps / 30)),
      };
    });
  }, [exerciseHistory]);

  // Similar exercises: same primary muscle, different exercise, same category
  const similarExercises = useMemo(() =>
    allExercises
      .filter((e) =>
        e.id !== exerciseId &&
        e.category === exercise.category &&
        e.primaryMuscles.some((m) => exercise.primaryMuscles.includes(m))
      )
      .slice(0, 5),
  [allExercises, exerciseId, exercise]);

  const difficultyColor = DIFFICULTY_COLORS[exercise.difficulty] || colors.textSecondary;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: safeTop }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <FadeIn delay={0} from="top">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[typography.h3, { color: colors.primary }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[typography.h2, { color: colors.text, flex: 1 }]} numberOfLines={2}>{exercise.name}</Text>
        </View>
      </FadeIn>

      {/* Tags */}
      <FadeIn delay={60}>
        <View style={styles.tagsRow}>
          <View style={[styles.tag, { backgroundColor: difficultyColor + '20', borderWidth: 1, borderColor: difficultyColor + '40' }]}>
            <Text style={[typography.captionMedium, { color: difficultyColor }]}>{DIFFICULTY_LABELS[exercise.difficulty] || exercise.difficulty}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40' }]}>
            <Text style={[typography.captionMedium, { color: colors.primary }]}>{TYPE_LABELS[exercise.type] || exercise.type}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.info + '15', borderWidth: 1, borderColor: colors.info + '40' }]}>
            <Text style={[typography.captionMedium, { color: colors.info }]}>
              {exercise.category === 'strength' ? 'Силовое' : exercise.category === 'cardio' ? 'Кардио' : exercise.category === 'functional' ? 'Функционал' : exercise.category}
            </Text>
          </View>
        </View>
      </FadeIn>

      {/* Add to workout button */}
      {activeWorkout && (
        <FadeIn delay={100}>
          <TouchableOpacity
            onPress={() => {
              haptic.success();
              const added = addExerciseToWorkout(exercise);
              if (!added) {
                // Store returns false on dupe (or if active workout disappeared between
                // render and tap). Both are user-visible failures.
                Alert.alert('Уже добавлено', 'Это упражнение уже есть в текущей тренировке.');
                return;
              }
              Alert.alert('Добавлено!', `${exercise.name} добавлено в тренировку.`, [
                { text: 'Продолжить просмотр' },
                { text: 'К тренировке', onPress: () => navigation.navigate('ActiveWorkout') },
              ]);
            }}
            style={[{
              backgroundColor: colors.success + '18', borderWidth: 1,
              borderColor: colors.success + '50', borderRadius: borderRadius.md,
              paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
              flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg,
            }]}
          >
            <Text style={{ fontSize: 18 }}>➕</Text>
            <Text style={[typography.bodySemibold, { color: colors.success }]} numberOfLines={1}>Добавить в текущую тренировку</Text>
          </TouchableOpacity>
        </FadeIn>
      )}

      {/* ── VIDEO (always shown first, prominently) ── */}
      <FadeIn delay={140}>
        <ExerciseVideoCard
          exerciseName={exercise.name}
          inlineVideoSource={exercise.videoUrl ?? exerciseVideoSource(exercise.id)}
          inlineVideoPoster={exerciseThumbSource(exercise.id)}
          youtubeId={exercise.youtubeId}
          rutubeId={exercise.rutubeId}
          primaryMuscles={exercise.primaryMuscles}
          muscleLabels={MUSCLE_LABELS}
          description={exercise.description}
          instructions={exercise.instructions}
          tips={exercise.tips}
          commonMistakes={exercise.commonMistakes}
        />
      </FadeIn>

      {/* ── DESCRIPTION ── */}
      <FadeIn delay={180}>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>{exercise.description}</Text>
      </FadeIn>

      {/* ── MUSCLES ── */}
      <FadeIn delay={220}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Задействованные мышцы</Text>
          <Text style={[typography.smallMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Основные:</Text>
          <View style={styles.muscleRow}>
            {exercise.primaryMuscles.map((m) => (
              <View key={m} style={[styles.muscleChip, { backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '35' }]}>
                <Text style={[typography.captionMedium, { color: colors.primary }]}>{MUSCLE_LABELS[m] || m}</Text>
              </View>
            ))}
          </View>
          {exercise.secondaryMuscles.length > 0 && (
            <>
              <Text style={[typography.smallMedium, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}>Вспомогательные:</Text>
              <View style={styles.muscleRow}>
                {exercise.secondaryMuscles.map((m) => (
                  <View key={m} style={[styles.muscleChip, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                    <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>{MUSCLE_LABELS[m] || m}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>
      </FadeIn>

      {/* ── INSTRUCTIONS ── */}
      <FadeIn delay={260}>
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

      {/* ── TIPS & MISTAKES ── */}
      {((exercise.tips?.length ?? 0) > 0 || (exercise.commonMistakes?.length ?? 0) > 0) && (
        <FadeIn delay={290}>
          <Card style={{ marginBottom: spacing.lg }}>
            {(exercise.tips?.length ?? 0) > 0 && (
              <>
                <Text style={[typography.h4, { color: colors.success, marginBottom: spacing.sm }]}>Советы</Text>
                {exercise.tips!.map((tip, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                    <Text style={{ fontSize: 13, color: colors.success, marginTop: 1 }}>✓</Text>
                    <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{tip}</Text>
                  </View>
                ))}
              </>
            )}
            {(exercise.commonMistakes?.length ?? 0) > 0 && (
              <>
                <Text style={[typography.h4, { color: colors.error, marginBottom: spacing.sm, marginTop: (exercise.tips?.length ?? 0) > 0 ? spacing.md : 0 }]}>Типичные ошибки</Text>
                {exercise.commonMistakes!.map((m, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                    <Text style={{ fontSize: 13, color: colors.error, marginTop: 1 }}>✕</Text>
                    <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{m}</Text>
                  </View>
                ))}
              </>
            )}
          </Card>
        </FadeIn>
      )}

      {/* ── STATS ── */}
      <ExerciseStatsCard exerciseHistory={exerciseHistory} maxWeight={maxWeight} estimated1RM={estimated1RM} oneRMTrend={oneRMTrend} />

      {/* ── HISTORY ── */}
      {exerciseHistory.length > 0 && (
        <FadeIn delay={320}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
              История ({exerciseHistory.length} тренировок)
            </Text>
            {exerciseHistory.slice(0, 10).map((h, i) => (
              <View key={i} style={[
                { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
                i < Math.min(exerciseHistory.length, 10) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
              ]}>
                <View>
                  <Text style={[typography.small, { color: colors.textSecondary }]}>
                    {h.date && !isNaN(new Date(h.date).getTime()) ? new Date(h.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </Text>
                  <Text style={[typography.captionMedium, { color: colors.textTertiary }]}>
                    {h.sets.length} подходов · {Math.round(h.totalVolume)} кг объём
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[typography.bodySemibold, { color: colors.primary }]}>
                    {h.bestWeight} кг × {h.bestReps}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>
                    ~{Math.round(h.bestWeight * (1 + h.bestReps / 30))} кг 1ПМ
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </FadeIn>
      )}

      {/* ── SIMILAR EXERCISES ── */}
      {similarExercises.length > 0 && (
        <FadeIn delay={360}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Похожие упражнения</Text>
            {similarExercises.map((ex, i) => (
              <AnimatedPressable
                key={ex.id}
                onPress={() => { haptic.selection(); navigation.push('ExerciseDetail', { exerciseId: ex.id }); }}
                haptic={false}
                scaleDown={0.98}
                style={[
                  { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md } as any,
                  i < similarExercises.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                ]}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: borderRadius.sm,
                  backgroundColor: (DIFFICULTY_COLORS[ex.difficulty] || colors.primary) + '15',
                  borderWidth: 1.5, borderColor: (DIFFICULTY_COLORS[ex.difficulty] || colors.primary) + '40',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: DIFFICULTY_COLORS[ex.difficulty] || colors.primary }}>
                    {TYPE_LABELS[ex.type]?.slice(0, 3) || ex.type.slice(0, 3)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { color: colors.text }]} numberOfLines={1}>{ex.name}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    {ex.primaryMuscles.map((m) => MUSCLE_LABELS[m] || m).join(', ')}
                  </Text>
                </View>
                <Text style={{ color: colors.textTertiary, fontSize: 16 }}>›</Text>
              </AnimatedPressable>
            ))}
          </Card>
        </FadeIn>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, gap: spacing.sm },
  tagsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  tag: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm },
  muscleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muscleChip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.full },
  instructionRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md, gap: spacing.md },
  stepNumber: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
});
