import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises } from '../../data/exercises';
import { Workout, WorkoutExercise, WorkoutSet } from '../../types';

const QUICK_WORKOUTS = [
  { name: 'Грудь + Трицепс', exercises: ['bench-press', 'incline-bench-press', 'dumbbell-fly', 'tricep-pushdown'] },
  { name: 'Спина + Бицепс', exercises: ['barbell-row', 'lat-pulldown', 'pull-ups', 'barbell-curl'] },
  { name: 'Ноги', exercises: ['squat', 'leg-press', 'romanian-deadlift', 'leg-curl', 'calf-raise'] },
  { name: 'Плечи + Пресс', exercises: ['overhead-press', 'lateral-raise', 'plank', 'cable-crunch'] },
  { name: 'Фулбоди', exercises: ['squat', 'bench-press', 'barbell-row', 'overhead-press', 'barbell-curl'] },
];

export const WorkoutsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { programs, startWorkout, activeWorkout } = useWorkoutStore();
  const [tab, setTab] = useState<'quick' | 'programs' | 'exercises'>('quick');

  const createWorkoutFromTemplate = (template: typeof QUICK_WORKOUTS[0]) => {
    const workoutExercises: WorkoutExercise[] = template.exercises
      .map((exId, index) => {
        const ex = exercises.find((e) => e.id === exId);
        if (!ex) return null;
        const sets: WorkoutSet[] = Array.from({ length: 4 }, (_, i) => ({
          id: `set-${Date.now()}-${index}-${i}`,
          setNumber: i + 1,
          type: 'normal' as const,
          reps: 10,
          weight: 0,
          completed: false,
        }));
        return {
          id: `we-${Date.now()}-${index}`,
          exerciseId: ex.id,
          exercise: ex,
          order: index,
          sets,
          restSeconds: 90,
        };
      })
      .filter(Boolean) as WorkoutExercise[];

    const workout: Workout = {
      id: `workout-${Date.now()}`,
      name: template.name,
      exercises: workoutExercises,
    };

    startWorkout(workout);
    navigation.navigate('ActiveWorkout');
  };

  const tabs = [
    { key: 'quick', label: 'Быстрый старт' },
    { key: 'programs', label: 'Программы' },
    { key: 'exercises', label: 'Упражнения' },
  ] as const;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.h2, { color: colors.text, paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.lg }]}>
        Тренировки
      </Text>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[
              styles.tab,
              tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
          >
            <Text
              style={[
                typography.smallMedium,
                { color: tab === t.key ? colors.primary : colors.textSecondary },
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'quick' && (
          <>
            {activeWorkout && (
              <Card
                style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.success }}
                onPress={() => navigation.navigate('ActiveWorkout')}
              >
                <Text style={[typography.captionMedium, { color: colors.success }]}>ПРОДОЛЖИТЬ</Text>
                <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>
                  {activeWorkout.workout.name}
                </Text>
              </Card>
            )}

            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
              Шаблоны тренировок
            </Text>
            {QUICK_WORKOUTS.map((template, i) => (
              <Card
                key={i}
                style={{ marginBottom: spacing.md }}
                onPress={() => createWorkoutFromTemplate(template)}
              >
                <Text style={[typography.bodySemibold, { color: colors.text }]}>{template.name}</Text>
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                  {template.exercises.length} упражнений •{' '}
                  {template.exercises
                    .map((id) => exercises.find((e) => e.id === id)?.name)
                    .filter(Boolean)
                    .join(', ')}
                </Text>
              </Card>
            ))}

            <Button
              title="Создать свою тренировку"
              variant="outline"
              onPress={() => setTab('exercises')}
              fullWidth
              style={{ marginTop: spacing.md }}
            />
          </>
        )}

        {tab === 'programs' && (
          <>
            {programs.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 48, marginBottom: spacing.lg }}>📋</Text>
                <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>
                  Нет программ
                </Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>
                  Попроси ИИ-тренера составить программу под твои цели
                </Text>
                <Button
                  title="Спросить ИИ-тренера"
                  onPress={() => navigation.navigate('AITab')}
                />
              </View>
            ) : (
              programs.map((program) => (
                <Card key={program.id} style={{ marginBottom: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodySemibold, { color: colors.text }]}>{program.name}</Text>
                      <Text style={[typography.small, { color: colors.textSecondary }]}>
                        {program.daysPerWeek} дней/нед • {program.level}
                      </Text>
                    </View>
                    {program.isActive && (
                      <View style={[styles.activeBadge, { backgroundColor: colors.success + '20' }]}>
                        <Text style={[typography.captionMedium, { color: colors.success }]}>Активна</Text>
                      </View>
                    )}
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {tab === 'exercises' && (
          <>
            {exercises.map((ex) => (
              <Card
                key={ex.id}
                style={{ marginBottom: spacing.sm }}
                onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: ex.id })}
                padding={spacing.md}
              >
                <Text style={[typography.bodySemibold, { color: colors.text }]}>{ex.name}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                  {ex.primaryMuscles.join(', ')} • {ex.type}
                </Text>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
  },
  tab: {
    paddingVertical: spacing.md,
    marginRight: spacing.xl,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.huge,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.huge,
  },
  activeBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
});
