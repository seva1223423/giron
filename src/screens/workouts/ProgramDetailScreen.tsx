import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { BuiltInProgram } from '../../data/programs';
import { Workout, WorkoutExercise, WorkoutSet } from '../../types';
import { ProgramDayCard } from './program';

const WEEK_SLOTS: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
const DAY_LABELS_FULL = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const GOAL_LABELS: Record<string, string> = { strength: 'Сила', muscle: 'Масса', fat_loss: 'Похудение', endurance: 'Выносливость' };
const GOAL_COLORS: Record<string, string> = { strength: '#3B6BF0', muscle: '#9C27B0', fat_loss: '#FF5722', endurance: '#4CAF50' };
const LEVEL_LABELS: Record<string, string> = { beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый' };

export const ProgramDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const program: BuiltInProgram = route.params?.program;
  const { colors } = useThemeStore();
  const { startWorkout, setWeekPlanDay } = useWorkoutStore();
  const [expandedDay, setExpandedDay] = useState<number | null>(0);

  useEffect(() => { if (!program) navigation.goBack(); }, [program, navigation]);
  if (!program) return null;

  const goalColor = GOAL_COLORS[program.goal] || colors.primary;

  const addProgramToWeeklyPlan = () => {
    const slots = WEEK_SLOTS[program.daysPerWeek] || WEEK_SLOTS[Math.min(program.daysPerWeek, 6)];
    const daysToAssign = program.days.slice(0, slots.length);
    const dayNames = slots.map((d) => DAY_LABELS_FULL[d]).join(', ');
    Alert.alert('Добавить в план недели', `Программа «${program.name}» будет назначена на: ${dayNames}. Текущие тренировки на этих днях будут заменены.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Добавить', onPress: () => {
        haptic.success();
        daysToAssign.forEach((day, i) => setWeekPlanDay(slots[i], { name: `${program.name} — ${day.name}`, emoji: program.emoji, exercises: day.exercises.map((e) => e.exerciseId) }));
        Alert.alert('Добавлено', `${program.name} добавлена в план недели на ${dayNames}.`);
      }},
    ]);
  };

  const startProgramDay = (day: typeof program.days[0]) => {
    haptic.medium();
    const workoutExercises: WorkoutExercise[] = day.exercises.map((item, index) => {
      const ex = localExercises.find((e) => e.id === item.exerciseId);
      if (!ex) return null;
      const sets: WorkoutSet[] = Array.from({ length: item.sets }, (_, i) => ({ id: `set-${Date.now()}-${index}-${i}`, setNumber: i + 1, type: 'normal' as const, reps: parseInt(item.reps) || 10, weight: 0, completed: false }));
      return { id: `we-${Date.now()}-${index}`, exerciseId: ex.id, exercise: ex, order: index, sets, restSeconds: item.rest };
    }).filter(Boolean) as WorkoutExercise[];
    startWorkout({ id: `workout-${Date.now()}`, name: `${program.name} — ${day.name}`, exercises: workoutExercises });
    navigation.navigate('ActiveWorkout');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.content, { paddingTop: safeTop }]} showsVerticalScrollIndicator={false}>
      <FadeIn delay={0} from="top">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[typography.h3, { color: colors.primary }]}>{'‹'} </Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '12', borderWidth: 1.5, borderColor: colors.primary + '40', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs }}><Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>{program.emoji}</Text></View>
            <Text style={[typography.h2, { color: colors.text }]}>{program.name}</Text>
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={80}>
        <View style={styles.tagsRow}>
          {[
            { label: GOAL_LABELS[program.goal], bg: goalColor + '20', color: goalColor, border: goalColor + '40' },
            { label: LEVEL_LABELS[program.level], bg: colors.primary + '15', color: colors.primary, border: colors.primary + '40' },
            { label: `${program.daysPerWeek}д/нед`, bg: colors.surface, color: colors.textSecondary, border: colors.border },
            { label: `${program.durationWeeks} нед`, bg: colors.surface, color: colors.textSecondary, border: colors.border },
          ].map(({ label, bg, color, border }) => (
            <View key={label} style={[styles.tag, { backgroundColor: bg, borderWidth: 1, borderColor: border }]}>
              <Text style={[typography.captionMedium, { color }]}>{label}</Text>
            </View>
          ))}
        </View>
      </FadeIn>

      <FadeIn delay={160}>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>{program.description}</Text>
      </FadeIn>

      <FadeIn delay={200}>
        <Card style={{ marginBottom: spacing.xl }}>
          <View style={styles.statsRow}>
            {[
              { value: program.daysPerWeek, label: 'дней/неделю', color: goalColor },
              { value: program.durationWeeks, label: 'недель', color: colors.primary },
              { value: program.days.length, label: 'вариантов', color: colors.accent },
            ].map(({ value, label, color }, i) => (
              <React.Fragment key={label}>
                {i > 0 && <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />}
                <View style={styles.statItem}>
                  <Text style={[typography.number, { color }]}>{value}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={2}>{label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
          <Text style={[typography.captionMedium, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md }]}>{program.split}</Text>
        </Card>
      </FadeIn>

      <FadeIn delay={240}>
        <TouchableOpacity onPress={addProgramToWeeklyPlan} style={[styles.weekPlanBtn, { backgroundColor: goalColor + '15', borderColor: goalColor + '50' }]}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>+</Text>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodySemibold, { color: goalColor }]}>Добавить в план недели</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={2}>Расставить тренировки по дням автоматически</Text>
          </View>
          <Text style={[typography.captionMedium, { color: goalColor }]}>›</Text>
        </TouchableOpacity>
      </FadeIn>

      <FadeIn delay={280}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Тренировочные дни</Text>
        {program.days.map((day, dayIndex) => (
          <ProgramDayCard
            key={dayIndex}
            day={day}
            dayIndex={dayIndex}
            goalColor={goalColor}
            isExpanded={expandedDay === dayIndex}
            onToggle={() => setExpandedDay(expandedDay === dayIndex ? null : dayIndex)}
            onStart={() => startProgramDay(day)}
          />
        ))}
      </FadeIn>

      <FadeIn delay={400}>
        <Button title={`Начать ${program.days[0].name}`} onPress={() => startProgramDay(program.days[0])} fullWidth size="lg" style={{ marginBottom: spacing.huge }} />
      </FadeIn>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg, gap: spacing.sm },
  tagsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  tag: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap' },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 40 },
  weekPlanBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: borderRadius.lg, borderWidth: 1, marginBottom: spacing.xl },
});
