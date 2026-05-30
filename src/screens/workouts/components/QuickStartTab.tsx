import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeColors, useWorkoutStore } from '../../../store';
import { Card, Button, FadeIn, Icon, type IconName } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { exercises as localExercises } from '../../../data/exercises';
import { Routine, Workout, WorkoutExercise, WorkoutSet } from '../../../types';
import { startWorkoutSafe } from '../../../utils/startWorkoutSafe';

const QUICK_WORKOUTS: { name: string; iconName: IconName; exercises: string[] }[] = [
  { name: 'Грудь + Трицепс', iconName: 'dumbbell', exercises: ['bench-press', 'incline-bench-press', 'dumbbell-fly', 'tricep-pushdown', 'overhead-tricep-ext'] },
  { name: 'Спина + Бицепс', iconName: 'dumbbell', exercises: ['deadlift', 'barbell-row', 'lat-pulldown', 'pull-ups', 'barbell-curl', 'hammer-curl'] },
  { name: 'Ноги', iconName: 'flame', exercises: ['squat', 'leg-press', 'romanian-deadlift', 'leg-curl', 'leg-extension', 'calf-raise'] },
  { name: 'Плечи + Пресс', iconName: 'bolt', exercises: ['overhead-press', 'lateral-raise', 'arnold-press', 'face-pull', 'plank', 'cable-crunch'] },
  { name: 'Фулбоди', iconName: 'spark', exercises: ['squat', 'bench-press', 'barbell-row', 'overhead-press', 'barbell-curl'] },
  { name: 'Руки', iconName: 'dumbbell', exercises: ['barbell-curl', 'hammer-curl', 'preacher-curl', 'tricep-pushdown', 'french-press', 'close-grip-bench'] },
  { name: 'Базовая тройка', iconName: 'trophy', exercises: ['squat', 'bench-press', 'deadlift'] },
  { name: 'Пресс + Кор', iconName: 'target', exercises: ['plank', 'cable-crunch', 'hanging-leg-raise', 'bicycle-crunch', 'russian-twist', 'side-plank'] },
  { name: 'Кардио', iconName: 'heart', exercises: ['treadmill', 'jump-rope', 'cycling'] },
  { name: 'Тяжёлая спина', iconName: 'dumbbell', exercises: ['deadlift', 'barbell-row', 'pull-ups', 'lat-pulldown', 'seated-row', 'dumbbell-row'] },
  { name: 'Ноги (гантели)', iconName: 'flame', exercises: ['goblet-squat', 'lunges', 'romanian-deadlift', 'bulgarian-split-squat', 'leg-curl'] },
  { name: 'Жим + Грудь', iconName: 'dumbbell', exercises: ['bench-press', 'incline-bench-press', 'dumbbell-bench-press', 'cable-fly', 'dips'] },
];

interface Props {
  navigation: any;
}

/**
 * Unified "saved workout" card item — covers both server-side Routines and
 * client-side Workout templates. After Phase 3 restructure, the user sees
 * a single list "Мои шаблоны" instead of two parallel sections.
 *
 * `kind` is preserved internally for handlers (start/delete behave
 * differently for routine vs. local template) but is intentionally NOT
 * shown in the UI — the user's mental model is one entity: "сохранённая
 * тренировка которую можно повторить".
 */
type SavedItem =
  | { kind: 'routine'; id: string; name: string; exerciseCount: number; source: Routine }
  | { kind: 'template'; id: string; name: string; exerciseCount: number; source: Workout };

export const QuickStartTab: React.FC<Props> = ({ navigation }) => {
  const haptic = useHaptic();
  const colors = useThemeColors();
  const {
    activeWorkout,
    savedTemplates,
    deleteTemplate,
    routines,
    fetchRoutines,
    startWorkoutFromRoutine,
  } = useWorkoutStore();

  useEffect(() => {
    if (routines.length === 0) fetchRoutines().catch(() => {});
  }, []);

  // Merge routines + local templates into a single ordered list.
  // Routines first (server-backed, support auto-progression), then
  // client-side templates. Both render identically.
  const savedItems = useMemo<SavedItem[]>(() => {
    const fromRoutines: SavedItem[] = routines.map((r) => ({
      kind: 'routine',
      id: r.id,
      name: r.name,
      exerciseCount: r.exercises.length,
      source: r,
    }));
    const fromTemplates: SavedItem[] = savedTemplates.map((t) => ({
      kind: 'template',
      id: t.id,
      name: t.name,
      exerciseCount: t.exercises.length,
      source: t,
    }));
    return [...fromRoutines, ...fromTemplates];
  }, [routines, savedTemplates]);

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
    startWorkoutSafe(workout, navigation);
  };

  const handleSavedPress = async (item: SavedItem) => {
    haptic.medium();
    if (item.kind === 'routine') {
      try {
        const workout = await startWorkoutFromRoutine(item.id);
        if (workout) navigation.navigate('ActiveWorkout');
      } catch {
        haptic.error();
        Alert.alert('Ошибка', 'Не удалось запустить шаблон. Проверь соединение.');
      }
      return;
    }
    // Local template — clone with fresh ids
    const tpl = item.source;
    const workout: Workout = {
      ...tpl,
      id: `workout-${Date.now()}`,
      exercises: tpl.exercises.map((ex, ei) => ({
        ...ex,
        id: `we-${Date.now()}-${ei}`,
        sets: ex.sets.map((s, si) => ({ ...s, id: `set-${Date.now()}-${ei}-${si}`, completed: false })),
      })),
    };
    startWorkoutSafe(workout, navigation);
  };

  const handleSavedLongPress = (item: SavedItem) => {
    haptic.heavy();
    if (item.kind === 'template') {
      Alert.alert('Удалить шаблон?', `«${item.name}» будет удалён из сохранённых`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => deleteTemplate(item.id) },
      ]);
    } else {
      navigation.navigate('RoutineDetail', { routineId: item.id });
    }
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

      {savedItems.length > 0 && (
        <FadeIn delay={30}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={[typography.metaLabel, { color: colors.textSecondary, flex: 1 }]}>МОИ ШАБЛОНЫ</Text>
            <TouchableOpacity
              onPress={() => { haptic.selection(); navigation.navigate('Routines'); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Все шаблоны"
            >
              <Text style={[typography.caption, { color: colors.primary }]}>Все</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.sm }}
            style={{ marginBottom: spacing.xl }}
          >
            {savedItems.slice(0, 10).map((item, i) => (
              <FadeIn key={`${item.kind}-${item.id}`} delay={i * 40}>
                <TouchableOpacity
                  onPress={() => handleSavedPress(item)}
                  onLongPress={() => handleSavedLongPress(item)}
                  style={[styles.savedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: colors.primary + '18',
                      borderWidth: 1.5,
                      borderColor: colors.primary + '40',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: spacing.sm,
                    }}
                  >
                    <Icon name="bookmark" size={16} color={colors.primary} />
                  </View>
                  <Text style={[typography.bodySemibold, { color: colors.text, marginBottom: spacing.xs }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    {item.exerciseCount} упр.
                  </Text>
                </TouchableOpacity>
              </FadeIn>
            ))}
          </ScrollView>
        </FadeIn>
      )}

      <Text style={[typography.metaLabel, { color: colors.textSecondary, marginBottom: spacing.md }]}>ГОТОВЫЕ КОМПЛЕКСЫ</Text>
      {QUICK_WORKOUTS.map((template, i) => (
        <FadeIn key={i} delay={i * 80}>
          <Card style={{ marginBottom: spacing.md }} onPress={() => createWorkoutFromTemplate(template)}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: colors.primary + '20',
                  borderWidth: 1.5,
                  borderColor: colors.primary + '40',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: spacing.md,
                }}
              >
                <Icon name={template.iconName} size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
                  {template.name}
                </Text>
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                  {template.exercises.length} упражнений
                </Text>
              </View>
              <Icon name="chev" size={16} color={colors.textTertiary} />
            </View>
          </Card>
        </FadeIn>
      ))}

      <View style={{ height: 1, backgroundColor: colors.primary + '20', marginVertical: spacing.lg }} />

      <Button
        title="Создать свою тренировку"
        variant="outline"
        onPress={() => navigation.navigate('CustomWorkout')}
        fullWidth
        icon={<Icon name="plus" size={18} color={colors.primary} />}
        style={{ marginTop: spacing.xs }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  savedCard: {
    width: 140,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
  },
});
