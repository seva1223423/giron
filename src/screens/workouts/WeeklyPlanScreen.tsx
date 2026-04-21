import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useWorkoutStore } from '../../store';
import { WeekPlanEntry } from '../../store/useWorkoutStore';
import { Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { Workout, WorkoutExercise, WorkoutSet } from '../../types';
import { DayPickerModal, TEMPLATES } from './weekly';
import { startWorkoutSafe } from '../../utils/startWorkoutSafe';

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const PRESET_SPLITS = [
  { name: 'Толчок-Тяга-Ноги 3 дня', plan: [0, 2, 4], templates: [1, 0, 2] },
  { name: 'Верх / Низ 4 дня', plan: [0, 1, 3, 4], templates: [4, 2, 4, 2] },
  { name: 'Бро-сплит 5 дней', plan: [0, 1, 2, 3, 4], templates: [0, 1, 2, 3, 7] },
];

export const WeeklyPlanScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { weekPlan, setWeekPlanDay, savedTemplates, customExercises } = useWorkoutStore();
  const [pickerDay, setPickerDay] = useState<number | null>(null);

  const allExercises = [...customExercises, ...localExercises];

  const userTemplateEntries: WeekPlanEntry[] = savedTemplates.map((tpl) => ({
    name: tpl.name,
    emoji: '◫',
    exercises: tpl.exercises.map((e) => e.exerciseId),
  }));

  const todayDow = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  })();

  const handleSelectTemplate = (template: WeekPlanEntry | null) => {
    if (pickerDay === null) return;
    haptic.selection();
    setWeekPlanDay(pickerDay, template);
    setPickerDay(null);
  };

  const handleStartWorkout = (entry: WeekPlanEntry) => {
    if (entry.exercises.length === 0) return;
    haptic.medium();
    const workoutExercises: WorkoutExercise[] = entry.exercises
      .map((exId, index) => {
        const ex = allExercises.find((e) => e.id === exId);
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

    const workout: Workout = { id: `workout-${Date.now()}`, name: entry.name, exercises: workoutExercises };
    startWorkoutSafe(workout, navigation);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: safeTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>План недели</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
          Нажми на день чтобы назначить тренировку. В день тренировки можно запустить её прямо отсюда.
        </Text>

        {DAY_LABELS.map((label, dow) => {
          const entry = weekPlan[dow] ?? null;
          const isToday = dow === todayDow;
          return (
            <Card key={dow} style={[{ marginBottom: spacing.sm }, isToday && { borderWidth: 1.5, borderColor: colors.primary }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.dayBadge, { backgroundColor: isToday ? colors.primary : colors.surface, borderWidth: 1.5, borderColor: isToday ? colors.primary : colors.border }]}>
                  <Text style={[typography.captionMedium, { color: isToday ? '#fff' : colors.textSecondary }]}>{label}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  {entry ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Text style={{ fontSize: 16 }}>{entry.emoji}</Text>
                        <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{entry.name}</Text>
                      </View>
                      {entry.exercises.length > 0 && (
                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
                          {entry.exercises.slice(0, 3).map((id) => allExercises.find((e) => e.id === id)?.name).filter(Boolean).join(', ')}
                          {entry.exercises.length > 3 ? ` +${entry.exercises.length - 3}` : ''}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[typography.body, { color: colors.textTertiary }]}>Отдых</Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {isToday && entry && entry.exercises.length > 0 && (
                    <TouchableOpacity onPress={() => handleStartWorkout(entry)} style={[styles.actionBtn, { backgroundColor: colors.success }]}>
                      <Text style={[typography.captionMedium, { color: '#fff' }]}>▶ Старт</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => { haptic.selection(); setPickerDay(dow); }}
                    style={[styles.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                  >
                    <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>✎</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          );
        })}

        <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md }]}>Готовые сплиты</Text>
        {PRESET_SPLITS.map((preset) => (
          <Card key={preset.name} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={[typography.bodySemibold, { color: colors.text }]}>{preset.name}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                  {preset.plan.map((d) => DAY_LABELS[d]).join(', ')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  haptic.medium();
                  for (let d = 0; d < 7; d++) setWeekPlanDay(d, null);
                  preset.plan.forEach((dow, i) => setWeekPlanDay(dow, TEMPLATES[preset.templates[i]]));
                }}
                style={[styles.actionBtn, { backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40' }]}
              >
                <Text style={[typography.captionMedium, { color: colors.primary }]}>Применить</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}
      </ScrollView>

      <DayPickerModal
        pickerDay={pickerDay}
        weekPlan={weekPlan}
        allExercises={allExercises}
        userTemplateEntries={userTemplateEntries}
        onSelect={handleSelectTemplate}
        onClose={() => setPickerDay(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  dayBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actionBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.md },
});
