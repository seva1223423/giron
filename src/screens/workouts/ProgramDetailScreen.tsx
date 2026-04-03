import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { BuiltInProgram } from '../../data/programs';
import { Workout, WorkoutExercise, WorkoutSet } from '../../types';

// Map daysPerWeek → weekday indices (0=Mon…6=Sun)
const WEEK_SLOTS: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
};
const DAY_LABELS_FULL = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const GOAL_LABELS: Record<string, string> = {
  strength: 'Сила', muscle: 'Масса', fat_loss: 'Похудение', endurance: 'Выносливость',
};
const GOAL_COLORS: Record<string, string> = {
  strength: '#3B6BF0', muscle: '#9C27B0', fat_loss: '#FF5722', endurance: '#4CAF50',
};
const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый',
};

export const ProgramDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const haptic = useHaptic();
  const program: BuiltInProgram = route.params?.program;
  const { colors } = useThemeStore();
  const { startWorkout, setWeekPlanDay } = useWorkoutStore();
  const [expandedDay, setExpandedDay] = useState<number | null>(0);

  if (!program) {
    navigation.goBack();
    return null;
  }

  const goalColor = GOAL_COLORS[program.goal] || colors.primary;

  const addProgramToWeeklyPlan = () => {
    const slots = WEEK_SLOTS[program.daysPerWeek] || WEEK_SLOTS[Math.min(program.daysPerWeek, 6)];
    const daysToAssign = program.days.slice(0, slots.length);
    const dayNames = slots.map((d) => DAY_LABELS_FULL[d]).join(', ');

    Alert.alert(
      'Добавить в план недели',
      `Программа «${program.name}» будет назначена на: ${dayNames}. Текущие тренировки на этих днях будут заменены.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Добавить',
          onPress: () => {
            haptic.success();
            daysToAssign.forEach((day, i) => {
              setWeekPlanDay(slots[i], {
                name: `${program.name} — ${day.name}`,
                emoji: program.emoji,
                exercises: day.exercises.map((e) => e.exerciseId),
              });
            });
            Alert.alert('✅ Добавлено!', `${program.name} добавлена в план недели на ${dayNames}.`);
          },
        },
      ]
    );
  };

  const startProgramDay = (day: typeof program.days[0]) => {
    haptic.medium();

    const workoutExercises: WorkoutExercise[] = day.exercises
      .map((item, index) => {
        const ex = localExercises.find((e) => e.id === item.exerciseId);
        if (!ex) return null;
        const sets: WorkoutSet[] = Array.from({ length: item.sets }, (_, i) => ({
          id: `set-${Date.now()}-${index}-${i}`,
          setNumber: i + 1,
          type: 'normal' as const,
          reps: parseInt(item.reps) || 10,
          weight: 0,
          completed: false,
        }));
        return {
          id: `we-${Date.now()}-${index}`,
          exerciseId: ex.id,
          exercise: ex,
          order: index,
          sets,
          restSeconds: item.rest,
        };
      })
      .filter(Boolean) as WorkoutExercise[];

    const workout: Workout = {
      id: `workout-${Date.now()}`,
      name: `${program.name} — ${day.name}`,
      exercises: workoutExercises,
    };

    startWorkout(workout);
    navigation.navigate('ActiveWorkout');
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <FadeIn delay={0} from="top">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[typography.h3, { color: colors.primary }]}>{'‹'} </Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 32, marginBottom: spacing.xs }}>{program.emoji}</Text>
            <Text style={[typography.h2, { color: colors.text }]}>{program.name}</Text>
          </View>
        </View>
      </FadeIn>

      {/* Tags */}
      <FadeIn delay={80}>
        <View style={styles.tagsRow}>
          <View style={[styles.tag, { backgroundColor: goalColor + '20' }]}>
            <Text style={[typography.captionMedium, { color: goalColor }]}>
              {GOAL_LABELS[program.goal]}
            </Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[typography.captionMedium, { color: colors.primary }]}>
              {LEVEL_LABELS[program.level]}
            </Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.surface }]}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
              {program.daysPerWeek}д/нед
            </Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.surface }]}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
              {program.durationWeeks} нед
            </Text>
          </View>
        </View>
      </FadeIn>

      {/* Description */}
      <FadeIn delay={160}>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
          {program.description}
        </Text>
      </FadeIn>

      {/* Stats row */}
      <FadeIn delay={200}>
        <Card style={{ marginBottom: spacing.xl }}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: goalColor }]}>{program.daysPerWeek}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>дней/неделю</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.primary }]}>{program.durationWeeks}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>недель</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.accent }]}>{program.days.length}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>вариантов</Text>
            </View>
          </View>
          <Text style={[typography.captionMedium, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md }]}>
            {program.split}
          </Text>
        </Card>
      </FadeIn>

      {/* Add to weekly plan */}
      <FadeIn delay={240}>
        <TouchableOpacity
          onPress={addProgramToWeeklyPlan}
          style={[styles.weekPlanBtn, { backgroundColor: goalColor + '15', borderColor: goalColor + '50' }]}
        >
          <Text style={{ fontSize: 18 }}>📅</Text>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodySemibold, { color: goalColor }]}>Добавить в план недели</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Расставить тренировки по дням автоматически
            </Text>
          </View>
          <Text style={[typography.captionMedium, { color: goalColor }]}>›</Text>
        </TouchableOpacity>
      </FadeIn>

      {/* Program days */}
      <FadeIn delay={280}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
          Тренировочные дни
        </Text>
        {program.days.map((day, dayIndex) => (
          <Card key={dayIndex} style={{ marginBottom: spacing.md }}>
            <TouchableOpacity
              onPress={() => {
                haptic.selection();
                setExpandedDay(expandedDay === dayIndex ? null : dayIndex);
              }}
            >
              <View style={styles.dayHeader}>
                <View style={[styles.dayBadge, { backgroundColor: goalColor + '20' }]}>
                  <Text style={[typography.captionMedium, { color: goalColor }]}>{dayIndex + 1}</Text>
                </View>
                <Text style={[typography.bodySemibold, { color: colors.text, flex: 1 }]}>
                  {day.name}
                </Text>
                <Text style={[typography.small, { color: colors.textTertiary }]}>
                  {day.exercises.length} упр {expandedDay === dayIndex ? '▲' : '▼'}
                </Text>
              </View>
            </TouchableOpacity>

            {expandedDay === dayIndex && (
              <>
                <View style={[styles.dayDivider, { backgroundColor: colors.divider }]} />
                {day.exercises.map((item, exIndex) => {
                  const ex = localExercises.find((e) => e.id === item.exerciseId);
                  return (
                    <View
                      key={exIndex}
                      style={[
                        styles.exerciseRow,
                        exIndex < day.exercises.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                      ]}
                    >
                      <View style={[styles.exNumber, { backgroundColor: colors.surface }]}>
                        <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
                          {exIndex + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.small, { color: colors.text }]}>
                          {ex?.name || item.exerciseId}
                        </Text>
                      </View>
                      <Text style={[typography.captionMedium, { color: colors.primary }]}>
                        {item.sets}×{item.reps}
                      </Text>
                    </View>
                  );
                })}
                <Button
                  title={`Начать: ${day.name}`}
                  onPress={() => startProgramDay(day)}
                  fullWidth
                  style={{ marginTop: spacing.md }}
                />
              </>
            )}
          </Card>
        ))}
      </FadeIn>

      {/* Start first day CTA */}
      <FadeIn delay={400}>
        <Button
          title={`Начать ${program.days[0].name}`}
          onPress={() => startProgramDay(program.days[0])}
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
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  tag: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: { alignItems: 'center' },
  statDivider: { width: 1, height: 40 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dayBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDivider: { height: 1, marginVertical: spacing.md },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  exNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.xl,
  },
});
