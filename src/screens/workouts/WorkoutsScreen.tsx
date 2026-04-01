import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { builtInPrograms } from '../../data/programs';
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

const EQUIPMENT_FILTERS = [
  { key: 'all', label: 'Любое' },
  { key: 'barbell', label: '🏋️ Штанга' },
  { key: 'dumbbell', label: '💪 Гантели' },
  { key: 'cable', label: '🔗 Блок' },
  { key: 'machine', label: '⚙️ Тренажёр' },
  { key: 'bodyweight', label: '🤸 Вес тела' },
  { key: 'cardio', label: '🏃 Кардио' },
];

export const WorkoutsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { programs, startWorkout, activeWorkout, fetchPrograms, isLoadingPrograms } = useWorkoutStore();
  const [tab, setTab] = useState<'quick' | 'programs' | 'exercises'>('quick');
  const [exerciseList, setExerciseList] = useState<Exercise[]>(localExercises);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [equipmentFilter, setEquipmentFilter] = useState('all');
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

  const filteredExercises = useMemo(() =>
    exerciseList.filter((ex) => {
      const matchesSearch = searchQuery
        ? ex.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesMuscle = muscleFilter === 'all'
        ? true
        : ex.primaryMuscles.includes(muscleFilter as any);
      const matchesEquipment = equipmentFilter === 'all'
        ? true
        : ex.type === equipmentFilter;
      return matchesSearch && matchesMuscle && matchesEquipment;
    }),
    [exerciseList, searchQuery, muscleFilter, equipmentFilter]
  );

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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.lg }}>
        <Text style={[typography.h2, { color: colors.text }]}>Тренировки</Text>
        <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); navigation.navigate('WeeklyPlan'); }}
          >
            <Text style={[typography.small, { color: colors.textSecondary }]}>📅 План</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); navigation.navigate('PlateCalculator'); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
          >
            <Text style={{ fontSize: 18 }}>🏋️</Text>
            <Text style={[typography.small, { color: colors.primary }]}>Блины</Text>
          </TouchableOpacity>
        </View>
      </View>

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
              onPress={() => navigation.navigate('CustomWorkout')}
              fullWidth
              style={{ marginTop: spacing.md }}
            />
          </>
        )}

        {tab === 'programs' && (
          <>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
              Готовые программы от лучших методистов мира
            </Text>
            {builtInPrograms.map((program, i) => (
              <FadeIn key={program.id} delay={i * 60}>
                <Card
                  style={{ marginBottom: spacing.md }}
                  onPress={() => navigation.navigate('ProgramDetail', { program })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 32, marginRight: spacing.md }}>{program.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodySemibold, { color: colors.text }]}>{program.name}</Text>
                      <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                        {program.daysPerWeek} дн/нед • {program.durationWeeks} нед • {program.split}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                        <View style={[styles.miniTag, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={[typography.captionMedium, { color: colors.primary, fontSize: 10 }]}>
                            {program.level === 'beginner' ? 'Новичок' : program.level === 'intermediate' ? 'Средний' : 'Продвинутый'}
                          </Text>
                        </View>
                        <View style={[styles.miniTag, { backgroundColor: colors.surface }]}>
                          <Text style={[typography.captionMedium, { color: colors.textSecondary, fontSize: 10 }]}>
                            {program.goal === 'strength' ? 'Сила' : program.goal === 'muscle' ? 'Масса' : program.goal === 'fat_loss' ? 'Похудение' : 'Выносливость'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Text style={[typography.body, { color: colors.textTertiary }]}>{'>'}</Text>
                  </View>
                </Card>
              </FadeIn>
            ))}
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
              contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.sm }}
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
                  <Text style={[typography.captionMedium, { color: muscleFilter === f.key ? '#FFF' : colors.text }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Equipment filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.lg }}
            >
              {EQUIPMENT_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => { Haptics.selectionAsync(); setEquipmentFilter(f.key); }}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: equipmentFilter === f.key ? colors.accent : colors.surface,
                      borderColor: equipmentFilter === f.key ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text style={[typography.captionMedium, { color: equipmentFilter === f.key ? '#FFF' : colors.text }]}>
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
                  onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: ex.id })}
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
  miniTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
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
