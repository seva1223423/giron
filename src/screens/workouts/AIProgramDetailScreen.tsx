import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import type { Program, Workout, WorkoutExercise, WorkoutSet } from '../../types';

const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'Похудение', muscle_gain: 'Набор массы', strength: 'Сила',
  endurance: 'Выносливость', flexibility: 'Гибкость', general_fitness: 'Общая форма',
};
const GOAL_COLORS: Record<string, string> = {
  weight_loss: '#FF5722', muscle_gain: '#9C27B0', strength: '#3B6BF0',
  endurance: '#4CAF50', flexibility: '#00BCD4', general_fitness: '#FF9800',
};
const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый', expert: 'Эксперт',
};
const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Compute muscle groups hit by a workout
function getTopMuscles(workout: Workout): string[] {
  const counts: Record<string, number> = {};
  workout.exercises.forEach((ex) => {
    ex.exercise?.primaryMuscles?.forEach((m) => { counts[m] = (counts[m] || 0) + 2; });
    ex.exercise?.secondaryMuscles?.forEach((m) => { counts[m] = (counts[m] || 0) + 1; });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m);
}

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
  triceps: 'Трицепс', quadriceps: 'Квадр.', hamstrings: 'Бицепс б.', glutes: 'Ягодицы',
  calves: 'Икры', abs: 'Пресс', lats: 'Широч.', traps: 'Трапеции', lower_back: 'Поясница',
};

interface WorkoutCardProps {
  workout: Workout;
  dayIndex: number;
  goalColor: string;
  isExpanded: boolean;
  onToggle: () => void;
  onStart: () => void;
  completedToday: boolean;
}

function WorkoutCard({ workout, dayIndex, goalColor, isExpanded, onToggle, onStart, completedToday }: WorkoutCardProps) {
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  const muscles = useMemo(() => getTopMuscles(workout), [workout]);

  const totalSets = workout.exercises.reduce((s, ex) => s + ex.sets.length, 0);
  const totalVol = workout.exercises.reduce((s, ex) =>
    s + ex.sets.reduce((ss, set) => ss + (set.completed ? (set.weight || 0) * (set.reps || 0) : 0), 0), 0);

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <TouchableOpacity onPress={() => { haptic.selection(); onToggle(); }}>
        <View style={styles.dayHeader}>
          <View style={[styles.dayBadge, { backgroundColor: completedToday ? colors.success + '20' : goalColor + '20' }]}>
            <Text style={[typography.captionMedium, { color: completedToday ? colors.success : goalColor, fontSize: 11 }]}>
              {completedToday ? '✓' : `Д${dayIndex + 1}`}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{workout.name}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              {muscles.map((m) => (
                <Text key={m} style={[typography.caption, { color: colors.textTertiary }]}>
                  {MUSCLE_LABELS[m] || m}
                </Text>
              ))}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
              {workout.exercises.length} упр · {totalSets} подх
            </Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>
              {isExpanded ? '▲' : '▼'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
          {workout.exercises.map((ex, i) => {
            const completedSets = ex.sets.filter((s) => s.completed);
            const bestSet = [...ex.sets].sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];
            return (
              <View
                key={ex.id || i}
                style={[
                  styles.exRow,
                  i < workout.exercises.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                ]}
              >
                <View style={[styles.exNum, { backgroundColor: colors.surface }]}>
                  <Text style={[typography.captionMedium, { color: colors.textSecondary, fontSize: 10 }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.smallMedium, { color: colors.text }]}>
                    {ex.exercise?.name || 'Упражнение'}
                  </Text>
                  {ex.exercise?.primaryMuscles?.length > 0 && (
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>
                      {ex.exercise.primaryMuscles.slice(0, 2).map((m) => MUSCLE_LABELS[m] || m).join(' · ')}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={[typography.captionMedium, { color: colors.primary }]}>
                    {ex.sets.length} × {ex.sets[0]?.reps || '—'}
                  </Text>
                  {bestSet?.weight ? (
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>
                      {bestSet.weight} кг
                    </Text>
                  ) : null}
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>
                    {ex.restSeconds}с отдых
                  </Text>
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.startDayBtn, { backgroundColor: goalColor }]}
            onPress={onStart}
            activeOpacity={0.8}
          >
            <Text style={styles.startDayText}>Начать тренировку</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}

// Week schedule visual
function WeekSchedule({ program, colors, goalColor }: { program: Program; colors: any; goalColor: string }) {
  const assigned = useMemo(() => {
    // Distribute workouts evenly across week
    const slots: Record<number, number> = {}; // dayOfWeek → workoutIndex
    const n = Math.min(program.workouts.length, 7);
    const gaps = [
      [], [0], [0, 3], [0, 2, 4], [0, 1, 3, 5], [0, 1, 2, 4, 5], [0, 1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4, 5, 6],
    ];
    const days = gaps[n] || [0, 1, 2, 3, 4];
    days.forEach((d, i) => { slots[d] = i; });
    return slots;
  }, [program.workouts.length]);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Расписание недели</Text>
      <View style={styles.weekRow}>
        {DAY_LABELS.map((day, i) => {
          const workoutIdx = assigned[i];
          const isTraining = workoutIdx !== undefined;
          return (
            <View key={i} style={styles.weekDay}>
              <View style={[
                styles.weekCircle,
                { backgroundColor: isTraining ? goalColor : colors.surface, borderWidth: 1, borderColor: isTraining ? goalColor : colors.border },
              ]}>
                {isTraining && (
                  <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700' }}>
                    Д{workoutIdx + 1}
                  </Text>
                )}
              </View>
              <Text style={[typography.caption, { color: isTraining ? colors.text : colors.textTertiary, fontSize: 10, marginTop: 4 }]}>{day}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export const AIProgramDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const program: Program = route.params?.program;
  const { colors } = useThemeStore();
  const { startWorkout, updateProgram, workoutHistory, setWeekPlanDay } = useWorkoutStore();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  if (!program) { navigation.goBack(); return null; }

  const goalColor = GOAL_COLORS[program.goal] || colors.primary;

  // Check which workouts were done in last 7 days
  const recentlyCompleted = useMemo(() => {
    const week = new Date(); week.setDate(week.getDate() - 7);
    return new Set(
      workoutHistory
        .filter((w) => w.completedAt && new Date(w.completedAt) >= week)
        .map((w) => w.name)
    );
  }, [workoutHistory]);

  const totalVolume = useMemo(() =>
    program.workouts.reduce((s, w) =>
      s + w.exercises.reduce((es, ex) =>
        es + ex.sets.reduce((ss, set) => ss + (set.weight || 0) * (set.reps || 0), 0), 0), 0),
  [program.workouts]);

  const activateProgram = useCallback(() => {
    Alert.alert(
      'Активировать программу?',
      `«${program.name}» станет активной. Текущая активная программа будет деактивирована.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Активировать',
          onPress: () => {
            haptic.success();
            updateProgram(program.id, { isActive: true });

            // Auto-assign to weekly plan
            const n = Math.min(program.workouts.length, 6);
            const gaps: number[][] = [[], [0], [0, 3], [0, 2, 4], [0, 1, 3, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5]];
            const slots = gaps[n] || [0, 1, 2];
            program.workouts.slice(0, slots.length).forEach((w, i) => {
              const muscles = getTopMuscles(w);
              setWeekPlanDay(slots[i], {
                name: w.name,
                emoji: '◎',
                exercises: w.exercises.map((e) => e.exerciseId),
              });
            });

            Alert.alert('Активировано', `${program.name} добавлена в план недели.`);
          },
        },
      ]
    );
  }, [program, haptic, updateProgram, setWeekPlanDay]);

  const startWorkoutDay = useCallback((workout: Workout) => {
    haptic.medium();
    // Build fresh workout from program template (reset completed/weights)
    const freshExercises = workout.exercises.map((ex, i) => ({
      ...ex,
      id: `we-${Date.now()}-${i}`,
      sets: ex.sets.map((s, si) => ({
        ...s,
        id: `set-${Date.now()}-${i}-${si}`,
        completed: false,
        weight: s.weight || 0,
      })),
    }));
    startWorkout({
      id: `workout-${Date.now()}`,
      name: workout.name,
      exercises: freshExercises,
    });
    navigation.navigate('WorkoutsTab', { screen: 'ActiveWorkout' });
  }, [haptic, startWorkout, navigation]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: safeTop }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <FadeIn delay={0} from="top">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[typography.h3, { color: colors.primary }]}>{'‹'} </Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
              <View style={[styles.aiBadge, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[typography.captionMedium, { color: colors.primary }]}>
                  {program.createdBy === 'ai' ? 'AI' : 'Моя'}
                </Text>
              </View>
              {program.isActive && (
                <View style={[styles.activeBadge, { backgroundColor: colors.success + '20' }]}>
                  <Text style={[typography.captionMedium, { color: colors.success }]}>Активная</Text>
                </View>
              )}
            </View>
            <Text style={[typography.h2, { color: colors.text }]}>{program.name}</Text>
            {program.description ? (
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]} numberOfLines={3}>
                {program.description}
              </Text>
            ) : null}
          </View>
        </View>
      </FadeIn>

      {/* Tags */}
      <FadeIn delay={60}>
        <View style={styles.tagsRow}>
          {[
            { label: GOAL_LABELS[program.goal] || program.goal, bg: goalColor + '20', color: goalColor },
            { label: LEVEL_LABELS[program.level] || program.level, bg: colors.primary + '15', color: colors.primary },
            { label: `${program.daysPerWeek} дн/нед`, bg: colors.surface, color: colors.textSecondary },
            { label: `${program.workouts.length} тренировок`, bg: colors.surface, color: colors.textSecondary },
          ].map(({ label, bg, color }) => label ? (
            <View key={label} style={[styles.tag, { backgroundColor: bg }]}>
              <Text style={[typography.captionMedium, { color }]}>{label}</Text>
            </View>
          ) : null)}
        </View>
      </FadeIn>

      {/* Stats */}
      <FadeIn delay={120}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.statsRow}>
            {[
              { value: program.workouts.length, label: 'тренировок', color: goalColor },
              { value: program.workouts.reduce((s, w) => s + w.exercises.length, 0), label: 'упражнений', color: colors.primary },
              { value: program.workouts.reduce((s, w) => s + w.exercises.reduce((es, ex) => es + ex.sets.length, 0), 0), label: 'подходов', color: colors.accent },
            ].map(({ value, label, color }, i) => (
              <React.Fragment key={label}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: colors.divider }]} />}
                <View style={styles.statItem}>
                  <Text style={[typography.number, { color }]}>{value}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </Card>
      </FadeIn>

      {/* Week schedule */}
      <FadeIn delay={160}>
        <WeekSchedule program={program} colors={colors} goalColor={goalColor} />
      </FadeIn>

      {/* Activate button */}
      {!program.isActive && (
        <FadeIn delay={200}>
          <TouchableOpacity
            style={[styles.activateBtn, { backgroundColor: goalColor + '15', borderColor: goalColor + '50' }]}
            onPress={activateProgram}
            activeOpacity={0.7}
          >
            <Text style={[styles.activateBtnText, { color: goalColor }]}>
              Активировать программу и добавить в план недели
            </Text>
          </TouchableOpacity>
        </FadeIn>
      )}

      {/* Workout days */}
      <FadeIn delay={240}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
          Тренировочные дни
        </Text>
        {program.workouts.map((workout, i) => (
          <WorkoutCard
            key={workout.id || i}
            workout={workout}
            dayIndex={i}
            goalColor={goalColor}
            isExpanded={expandedIdx === i}
            onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            onStart={() => startWorkoutDay(workout)}
            completedToday={recentlyCompleted.has(workout.name)}
          />
        ))}
      </FadeIn>

      {/* Quick start first workout */}
      <FadeIn delay={320}>
        <Button
          title={`Начать: ${program.workouts[0]?.name || 'День 1'}`}
          onPress={() => startWorkoutDay(program.workouts[0])}
          fullWidth
          size="lg"
          style={{ marginBottom: spacing.huge }}
        />
      </FadeIn>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg, gap: spacing.sm },
  aiBadge: { borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  activeBadge: { borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  tagsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  tag: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  statItem: { alignItems: 'center' },
  divider: { width: 1, height: 40 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', flex: 1 },
  weekCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  activateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: spacing.lg, borderRadius: borderRadius.lg, borderWidth: 1, marginBottom: spacing.xl,
  },
  activateBtnText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  exRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
  exNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  startDayBtn: { marginTop: spacing.md, borderRadius: borderRadius.md, paddingVertical: 14, alignItems: 'center' },
  startDayText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
