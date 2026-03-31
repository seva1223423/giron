import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { Workout, WorkoutExercise, WorkoutSet, Exercise } from '../../types';
import { workoutService } from '../../services';

const QUICK_WORKOUTS = [
  { name: 'Грудь + Трицепс', emoji: '💪', exercises: ['bench-press', 'incline-bench-press', 'dumbbell-fly', 'tricep-pushdown'] },
  { name: 'Спина + Бицепс', emoji: '🔥', exercises: ['barbell-row', 'lat-pulldown', 'pull-ups', 'barbell-curl'] },
  { name: 'Ноги', emoji: '🦵', exercises: ['squat', 'leg-press', 'romanian-deadlift', 'leg-curl', 'calf-raise'] },
  { name: 'Плечи + Пресс', emoji: '🎯', exercises: ['overhead-press', 'lateral-raise', 'plank', 'cable-crunch'] },
  { name: 'Фулбоди', emoji: '⚡', exercises: ['squat', 'bench-press', 'barbell-row', 'overhead-press', 'barbell-curl'] },
];

const MUSCLE_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'chest', label: 'Грудь' },
  { key: 'back', label: 'Спина' },
  { key: 'shoulders', label: 'Плечи' },
  { key: 'biceps', label: 'Бицепс' },
  { key: 'triceps', label: 'Трицепс' },
  { key: 'quadriceps', label: 'Квадрицепс' },
  { key: 'hamstrings', label: 'Бицепс бедра' },
  { key: 'glutes', label: 'Ягодицы' },
  { key: 'abs', label: 'Пресс' },
  { key: 'calves', label: 'Икры' },
];

export const WorkoutsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { programs, startWorkout, activeWorkout, fetchPrograms, isLoadingPrograms } = useWorkoutStore();
  const [tab, setTab] = useState<'quick' | 'programs' | 'exercises'>('quick');
  const [exerciseList, setExerciseList] = useState<Exercise[]>(localExercises);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [loadingExercises, setLoadingExercises] = useState(false);

  useEffect(() => {
    fetchPrograms();
    // Try loading exercises from server
    const loadServerExercises = async () => {
      setLoadingExercises(true);
      try {
        const serverExercises = await workoutService.getExercises();
        if (serverExercises.length > 0) {
          setExerciseList(serverExercises);
        }
      } catch {
        // Keep local exercises
      } finally {
        setLoadingExercises(false);
      }
    };
    loadServerExercises();
  }, []);

  const filteredExercises = exerciseList.filter((ex) => {
    const matchesSearch = searchQuery
      ? ex.name.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    const matchesMuscle = muscleFilter === 'all'
      ? true
      : ex.primaryMuscles.includes(muscleFilter as any);
    return matchesSearch && matchesMuscle;
  });

  const createWorkoutFromTemplate = (template: typeof QUICK_WORKOUTS[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const workoutExercises: WorkoutExercise[] = template.exercises
      .map((exId, index) => {
        const ex = exerciseList.find((e) => e.id === exId);
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
            onPress={() => { Haptics.selectionAsync(); setTab(t.key); }}
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

            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
              Шаблоны тренировок
            </Text>
            {QUICK_WORKOUTS.map((template, i) => (
              <FadeIn key={i} delay={i * 80}>
                <Card
                  style={{ marginBottom: spacing.md }}
                  onPress={() => createWorkoutFromTemplate(template)}
                >
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
              onPress={() => setTab('exercises')}
              fullWidth
              style={{ marginTop: spacing.md }}
            />
          </>
        )}

        {tab === 'programs' && (
          <>
            {isLoadingPrograms ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.huge }} />
            ) : programs.length === 0 ? (
              <FadeIn>
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
              </FadeIn>
            ) : (
              programs.map((program, i) => (
                <FadeIn key={program.id} delay={i * 80}>
                  <Card style={{ marginBottom: spacing.md }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodySemibold, { color: colors.text }]}>{program.name}</Text>
                        <Text style={[typography.small, { color: colors.textSecondary }]}>
                          {program.daysPerWeek} дней/нед {program.level ? `\u2022 ${program.level}` : ''}
                        </Text>
                      </View>
                      {program.isActive && (
                        <View style={[styles.activeBadge, { backgroundColor: colors.success + '20' }]}>
                          <Text style={[typography.captionMedium, { color: colors.success }]}>Активна</Text>
                        </View>
                      )}
                    </View>
                  </Card>
                </FadeIn>
              ))
            )}
          </>
        )}

        {tab === 'exercises' && (
          <>
            {/* Search bar */}
            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                  color: colors.inputText,
                },
              ]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Поиск упражнений..."
              placeholderTextColor={colors.inputPlaceholder}
            />

            {/* Muscle filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.lg }}
            >
              {MUSCLE_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => { Haptics.selectionAsync(); setMuscleFilter(f.key); }}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: muscleFilter === f.key ? colors.primary : colors.surface,
                      borderColor: muscleFilter === f.key ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.captionMedium,
                      { color: muscleFilter === f.key ? '#FFF' : colors.text },
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Exercise count */}
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.md }]}>
              {filteredExercises.length} упражнений
            </Text>

            {loadingExercises ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : (
              filteredExercises.map((ex, i) => (
                <Card
                  key={ex.id}
                  style={{ marginBottom: spacing.sm }}
                  padding={spacing.md}
                >
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>{ex.name}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                    {ex.primaryMuscles.join(', ')} {ex.type ? `\u2022 ${ex.type}` : ''}
                  </Text>
                </Card>
              ))
            )}
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
  searchInput: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
});
