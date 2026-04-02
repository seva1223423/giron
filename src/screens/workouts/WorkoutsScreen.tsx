import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore, useSubscriptionStore } from '../../store';
import { Card, Button, FadeIn, PaywallModal } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { builtInPrograms } from '../../data/programs';
import { Workout, WorkoutExercise, WorkoutSet, Exercise } from '../../types';
import { workoutService } from '../../services';

const FAVORITES_KEY = 'iron_gym_exercise_favorites';

const QUICK_WORKOUTS = [
  { name: 'Грудь + Трицепс', emoji: '💪', exercises: ['bench-press', 'incline-bench-press', 'dumbbell-fly', 'tricep-pushdown'] },
  { name: 'Спина + Бицепс', emoji: '🔥', exercises: ['barbell-row', 'lat-pulldown', 'pull-ups', 'barbell-curl'] },
  { name: 'Ноги', emoji: '🦵', exercises: ['squat', 'leg-press', 'romanian-deadlift', 'leg-curl', 'calf-raise'] },
  { name: 'Плечи + Пресс', emoji: '🎯', exercises: ['overhead-press', 'lateral-raise', 'plank', 'cable-crunch'] },
  { name: 'Фулбоди', emoji: '⚡', exercises: ['squat', 'bench-press', 'barbell-row', 'overhead-press', 'barbell-curl'] },
];

const MUSCLE_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'favorites', label: '❤️ Избранное' },
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
  { key: 'traps', label: 'Трапеции' },
  { key: 'forearms', label: 'Предплечья' },
];

const EQUIPMENT_FILTERS = [
  { key: 'all', label: 'Любое' },
  { key: 'barbell', label: '🏋️ Штанга' },
  { key: 'dumbbell', label: '💪 Гантели' },
  { key: 'cable', label: '🔗 Блок' },
  { key: 'machine', label: '⚙️ Тренажёр' },
  { key: 'bodyweight', label: '🤸 Вес тела' },
  { key: 'cardio', label: '🏃 Кардио' },
  { key: 'stretching', label: '🧘 Растяжка' },
];

export const WorkoutsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { programs, startWorkout, activeWorkout, fetchPrograms, isLoadingPrograms, savedTemplates, saveAsTemplate, deleteTemplate } = useWorkoutStore();
  const { isPremiumActive } = useSubscriptionStore();
  const [showPaywall, setShowPaywall] = useState(false);
  const [tab, setTab] = useState<'quick' | 'programs' | 'exercises'>('quick');
  const [exerciseList, setExerciseList] = useState<Exercise[]>(localExercises);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [equipmentFilter, setEquipmentFilter] = useState('all');
  const [programGoalFilter, setProgramGoalFilter] = useState<'all' | 'strength' | 'muscle' | 'fat_loss' | 'endurance'>('all');
  const [programLevelFilter, setProgramLevelFilter] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY).then((raw) => {
      if (raw) {
        try { setFavoriteIds(new Set(JSON.parse(raw))); } catch {}
      }
    });
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

  const toggleFavorite = useCallback((exerciseId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) {
        next.delete(exerciseId);
      } else {
        next.add(exerciseId);
      }
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const filteredExercises = useMemo(() =>
    exerciseList.filter((ex) => {
      const matchesSearch = searchQuery
        ? ex.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesMuscle = muscleFilter === 'all'
        ? true
        : muscleFilter === 'favorites'
        ? favoriteIds.has(ex.id)
        : ex.primaryMuscles.includes(muscleFilter as any);
      const matchesEquipment = equipmentFilter === 'all'
        ? true
        : equipmentFilter === 'stretching'
        ? (ex as any).category === 'stretching'
        : ex.type === equipmentFilter;
      return matchesSearch && matchesMuscle && matchesEquipment;
    }),
    [exerciseList, searchQuery, muscleFilter, equipmentFilter, favoriteIds]
  );

  const filteredPrograms = useMemo(() =>
    builtInPrograms.filter((p) => {
      const matchesGoal = programGoalFilter === 'all' || p.goal === programGoalFilter;
      const matchesLevel = programLevelFilter === 'all' || p.level === programLevelFilter;
      return matchesGoal && matchesLevel;
    }),
    [programGoalFilter, programLevelFilter]
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
            onPress={() => { Haptics.selectionAsync(); navigation.navigate('PersonalRecords'); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
          >
            <Text style={{ fontSize: 18 }}>🏆</Text>
            <Text style={[typography.small, { color: colors.primary }]}>ПР</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); navigation.navigate('WorkoutCalendar'); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
          >
            <Text style={{ fontSize: 18 }}>🗓</Text>
            <Text style={[typography.small, { color: colors.primary }]}>Календарь</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); navigation.navigate('OneRMCalculator'); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
          >
            <Text style={{ fontSize: 18 }}>📊</Text>
            <Text style={[typography.small, { color: colors.primary }]}>1ПМ</Text>
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

            {savedTemplates.length > 0 && (
              <>
                <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                  Мои шаблоны
                </Text>
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
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          const workout: Workout = {
                            ...tpl,
                            id: `workout-${Date.now()}`,
                            exercises: tpl.exercises.map((ex, ei) => ({
                              ...ex,
                              id: `we-${Date.now()}-${ei}`,
                              sets: ex.sets.map((s, si) => ({
                                ...s,
                                id: `set-${Date.now()}-${ei}-${si}`,
                                completed: false,
                              })),
                            })),
                          };
                          startWorkout(workout);
                          navigation.navigate('ActiveWorkout');
                        }}
                        onLongPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                          Alert.alert(
                            'Удалить шаблон?',
                            `"${tpl.name}" будет удалён из сохранённых`,
                            [
                              { text: 'Отмена', style: 'cancel' },
                              { text: 'Удалить', style: 'destructive', onPress: () => deleteTemplate(tpl.id) },
                            ]
                          );
                        }}
                        style={[
                          styles.templateCard,
                          { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                      >
                        <Text style={{ fontSize: 28, marginBottom: spacing.sm }}>⭐</Text>
                        <Text style={[typography.bodySemibold, { color: colors.text, marginBottom: spacing.xs }]} numberOfLines={2}>
                          {tpl.name}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                          {tpl.exercises.length} упр.
                        </Text>
                      </TouchableOpacity>
                    </FadeIn>
                  ))}
                </ScrollView>
              </>
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
            {/* Goal filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xs }}>
              {([
                { key: 'all', label: 'Все' },
                { key: 'strength', label: '💪 Сила' },
                { key: 'muscle', label: '📈 Масса' },
                { key: 'fat_loss', label: '🔥 Похудение' },
                { key: 'endurance', label: '🏃 Выносливость' },
              ] as const).map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => { Haptics.selectionAsync(); setProgramGoalFilter(f.key); }}
                  style={[styles.filterChip, { backgroundColor: programGoalFilter === f.key ? colors.primary : colors.surface, borderColor: programGoalFilter === f.key ? colors.primary : colors.border }]}
                >
                  <Text style={[typography.captionMedium, { color: programGoalFilter === f.key ? '#FFF' : colors.text }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Level filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xs }}>
              {([
                { key: 'all', label: 'Любой уровень' },
                { key: 'beginner', label: 'Новичок' },
                { key: 'intermediate', label: 'Средний' },
                { key: 'advanced', label: 'Продвинутый' },
              ] as const).map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => { Haptics.selectionAsync(); setProgramLevelFilter(f.key); }}
                  style={[styles.filterChip, { backgroundColor: programLevelFilter === f.key ? colors.accent : colors.surface, borderColor: programLevelFilter === f.key ? colors.accent : colors.border }]}
                >
                  <Text style={[typography.captionMedium, { color: programLevelFilter === f.key ? '#FFF' : colors.text }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {!isPremiumActive() && (
              <TouchableOpacity
                onPress={() => setShowPaywall(true)}
                style={[styles.proBanner, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '40' }]}
              >
                <Text style={{ fontSize: 18 }}>👑</Text>
                <Text style={[typography.small, { color: colors.accent, flex: 1 }]}>
                  3 из {builtInPrograms.length} программ бесплатно — <Text style={{ fontWeight: '700' }}>получи все с Pro</Text>
                </Text>
                <Text style={[typography.caption, { color: colors.accent }]}>›</Text>
              </TouchableOpacity>
            )}
            {filteredPrograms.length === 0 && (
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl }]}>
                Нет программ с такими фильтрами
              </Text>
            )}
            {filteredPrograms.map((program, i) => {
              // Free users get first 3 programs; Pro unlocks all
              const allPrograms = builtInPrograms;
              const globalIndex = allPrograms.findIndex((p) => p.id === program.id);
              const isLocked = !isPremiumActive() && globalIndex >= 3;
              return (
                <FadeIn key={program.id} delay={i * 60}>
                  <Card
                    style={{ marginBottom: spacing.md, opacity: isLocked ? 0.7 : 1 }}
                    onPress={() => {
                      if (isLocked) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); setShowPaywall(true); }
                      else navigation.navigate('ProgramDetail', { program });
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 32, marginRight: spacing.md }}>{isLocked ? '🔒' : program.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodySemibold, { color: isLocked ? colors.textSecondary : colors.text }]}>{program.name}</Text>
                        <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                          {program.daysPerWeek} дн/нед • {program.durationWeeks} нед • {program.split}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                          <View style={[styles.miniTag, { backgroundColor: isLocked ? colors.border : colors.primary + '15' }]}>
                            <Text style={[typography.captionMedium, { color: isLocked ? colors.textTertiary : colors.primary, fontSize: 10 }]}>
                              {program.level === 'beginner' ? 'Новичок' : program.level === 'intermediate' ? 'Средний' : 'Продвинутый'}
                            </Text>
                          </View>
                          <View style={[styles.miniTag, { backgroundColor: colors.surface }]}>
                            <Text style={[typography.captionMedium, { color: colors.textSecondary, fontSize: 10 }]}>
                              {program.goal === 'strength' ? 'Сила' : program.goal === 'muscle' ? 'Масса' : program.goal === 'fat_loss' ? 'Похудение' : 'Выносливость'}
                            </Text>
                          </View>
                          {isLocked && (
                            <View style={[styles.miniTag, { backgroundColor: colors.accent + '20' }]}>
                              <Text style={[typography.captionMedium, { color: colors.accent, fontSize: 10 }]}>Pro</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Text style={[typography.body, { color: colors.textTertiary }]}>{isLocked ? '›' : '>'}</Text>
                    </View>
                  </Card>
                </FadeIn>
              );
            })}
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

            {muscleFilter === 'favorites' && filteredExercises.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 40, marginBottom: spacing.md }}>❤️</Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Нажмите ❤️ на упражнении, чтобы добавить в избранное
                </Text>
              </View>
            )}
            {loadingExercises ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : (
              filteredExercises.map((ex, i) => {
                const isFav = favoriteIds.has(ex.id);
                return (
                  <Card
                    key={ex.id}
                    style={{ marginBottom: spacing.sm }}
                    padding={spacing.md}
                    onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: ex.id })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodySemibold, { color: colors.text }]}>{ex.name}</Text>
                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                          {ex.primaryMuscles.join(', ')} {ex.type ? `\u2022 ${ex.type}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); toggleFavorite(ex.id); }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ paddingLeft: spacing.md }}
                      >
                        <Text style={{ fontSize: 18, color: isFav ? '#FF3B55' : colors.textTertiary }}>
                          {isFav ? '❤️' : '🤍'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason="programs_limit"
        navigation={navigation}
      />
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
  proBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
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
  templateCard: {
    width: 140,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
  },
});
