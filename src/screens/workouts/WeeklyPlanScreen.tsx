import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore } from '../../store';
import { WeekPlanEntry } from '../../store/useWorkoutStore';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { Workout, WorkoutExercise, WorkoutSet } from '../../types';

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_LABELS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

const TEMPLATES: WeekPlanEntry[] = [
  { name: 'Грудь + Трицепс', emoji: '💪', exercises: ['bench-press', 'incline-bench-press', 'dumbbell-fly', 'tricep-pushdown'] },
  { name: 'Спина + Бицепс', emoji: '🔥', exercises: ['barbell-row', 'lat-pulldown', 'pull-ups', 'barbell-curl'] },
  { name: 'Ноги', emoji: '🦵', exercises: ['squat', 'leg-press', 'romanian-deadlift', 'leg-curl', 'calf-raise'] },
  { name: 'Плечи + Пресс', emoji: '🎯', exercises: ['overhead-press', 'lateral-raise', 'plank', 'cable-crunch'] },
  { name: 'Фулбоди', emoji: '⚡', exercises: ['squat', 'bench-press', 'barbell-row', 'overhead-press', 'barbell-curl'] },
  { name: 'Кардио', emoji: '🏃', exercises: [] },
  { name: 'Тяжёлая спина', emoji: '🏋️', exercises: ['deadlift', 'barbell-row', 'lat-pulldown', 'pull-ups'] },
  { name: 'Руки', emoji: '💪', exercises: ['barbell-curl', 'hammer-curl', 'tricep-pushdown', 'skull-crushers'] },
];

export const WeeklyPlanScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { weekPlan, setWeekPlanDay, startWorkout } = useWorkoutStore();
  const [pickerDay, setPickerDay] = useState<number | null>(null);

  const todayDow = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1; // convert Sun=0 → Mon=0 format
  })();

  const handleSelectTemplate = (template: WeekPlanEntry | null) => {
    if (pickerDay === null) return;
    Haptics.selectionAsync();
    setWeekPlanDay(pickerDay, template);
    setPickerDay(null);
  };

  const handleStartWorkout = (entry: WeekPlanEntry) => {
    if (entry.exercises.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const workoutExercises: WorkoutExercise[] = entry.exercises
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
        return { id: `we-${Date.now()}-${index}`, exerciseId: ex.id, exercise: ex, order: index, sets, restSeconds: 90 };
      })
      .filter(Boolean) as WorkoutExercise[];

    const workout: Workout = {
      id: `workout-${Date.now()}`,
      name: entry.name,
      exercises: workoutExercises,
    };
    startWorkout(workout);
    navigation.navigate('ActiveWorkout');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
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
            <Card
              key={dow}
              style={[
                { marginBottom: spacing.sm },
                isToday && { borderWidth: 1.5, borderColor: colors.primary },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {/* Day label */}
                <View style={[styles.dayBadge, { backgroundColor: isToday ? colors.primary : colors.surface }]}>
                  <Text style={[typography.captionMedium, { color: isToday ? '#fff' : colors.textSecondary }]}>
                    {label}
                  </Text>
                </View>

                {/* Workout info or empty */}
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  {entry ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Text style={{ fontSize: 16 }}>{entry.emoji}</Text>
                        <Text style={[typography.bodySemibold, { color: colors.text }]}>{entry.name}</Text>
                      </View>
                      {entry.exercises.length > 0 && (
                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
                          {entry.exercises
                            .slice(0, 3)
                            .map((id) => localExercises.find((e) => e.id === id)?.name)
                            .filter(Boolean)
                            .join(', ')}
                          {entry.exercises.length > 3 ? ` +${entry.exercises.length - 3}` : ''}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[typography.body, { color: colors.textTertiary }]}>Отдых</Text>
                  )}
                </View>

                {/* Actions */}
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {isToday && entry && entry.exercises.length > 0 && (
                    <TouchableOpacity
                      onPress={() => handleStartWorkout(entry)}
                      style={[styles.actionBtn, { backgroundColor: colors.success }]}
                    >
                      <Text style={[typography.captionMedium, { color: '#fff' }]}>▶ Старт</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => { Haptics.selectionAsync(); setPickerDay(dow); }}
                    style={[styles.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                  >
                    <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>✎</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          );
        })}

        {/* Preset splits */}
        <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md }]}>
          Готовые сплиты
        </Text>

        {[
          { name: 'PPL 3 дня', plan: [0, 2, 4], templates: [1, 0, 2] }, // Mon=Back, Wed=Chest, Fri=Legs
          { name: 'Upper / Lower 4 дня', plan: [0, 1, 3, 4], templates: [4, 2, 4, 2] },
          { name: 'Бро-сплит 5 дней', plan: [0, 1, 2, 3, 4], templates: [0, 1, 2, 3, 7] },
        ].map((preset) => (
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
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  // Clear all days first
                  for (let d = 0; d < 7; d++) setWeekPlanDay(d, null);
                  // Apply preset
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

      {/* Day picker modal */}
      <Modal visible={pickerDay !== null} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
              {pickerDay !== null ? DAY_LABELS_FULL[pickerDay] : ''}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              <TouchableOpacity
                onPress={() => handleSelectTemplate(null)}
                style={[styles.templateRow, { borderBottomColor: colors.divider }]}
              >
                <Text style={[typography.body, { color: colors.textSecondary }]}>😴 Отдых</Text>
                {pickerDay !== null && !weekPlan[pickerDay] && (
                  <Text style={{ color: colors.primary }}>✓</Text>
                )}
              </TouchableOpacity>

              {TEMPLATES.map((t) => {
                const isActive = pickerDay !== null && weekPlan[pickerDay]?.name === t.name;
                return (
                  <TouchableOpacity
                    key={t.name}
                    onPress={() => handleSelectTemplate(t)}
                    style={[styles.templateRow, { borderBottomColor: colors.divider }]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Text style={{ fontSize: 18 }}>{t.emoji}</Text>
                        <Text style={[typography.body, { color: isActive ? colors.primary : colors.text }]}>{t.name}</Text>
                      </View>
                      {t.exercises.length > 0 && (
                        <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                          {t.exercises
                            .slice(0, 3)
                            .map((id) => localExercises.find((e) => e.id === id)?.name)
                            .filter(Boolean)
                            .join(', ')}
                        </Text>
                      )}
                    </View>
                    {isActive && <Text style={{ color: colors.primary }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Button
              title="Отмена"
              variant="ghost"
              onPress={() => setPickerDay(null)}
              fullWidth
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.huge,
  },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: 48,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
});
