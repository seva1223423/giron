import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { WorkoutExercise, WorkoutSet } from '../../../types';

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
  triceps: 'Трицепс', quadriceps: 'Ноги', hamstrings: 'Задняя', glutes: 'Ягодицы',
  abs: 'Пресс', calves: 'Икры', lats: 'Широчайшие',
};

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}ч ${m}мин` : `${h}ч`;
}

interface Props {
  workout: any;
  isExpanded: boolean;
  onToggle: () => void;
  navigation: any;
}

export const WorkoutCard: React.FC<Props> = ({ workout, isExpanded, onToggle, navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { activeWorkout, startWorkout } = useWorkoutStore();

  const completedSets = workout.exercises.reduce((s: number, e: any) => s + e.sets.filter((set: any) => set.completed).length, 0);
  const prCount = workout.exercises.reduce((s: number, e: any) => s + e.sets.filter((set: any) => set.isPR).length, 0);
  const muscleSet = new Set<string>();
  workout.exercises.forEach((ex: any) => (ex.exercise?.primaryMuscles ?? []).slice(0, 1).forEach((m: string) => muscleSet.add(m)));
  const muscles = Array.from(muscleSet).slice(0, 3);

  const handleRepeat = () => {
    if (activeWorkout) return;
    haptic.medium();
    const exercises: WorkoutExercise[] = workout.exercises.map((we: any, index: number) => {
      const sets: WorkoutSet[] = we.sets.map((s: any, i: number) => ({
        id: `set-${Date.now()}-${index}-${i}`, setNumber: i + 1, type: s.type, reps: s.reps, weight: s.weight, completed: false,
      }));
      return { ...we, id: `we-${Date.now()}-${index}`, sets };
    });
    startWorkout({ id: `workout-${Date.now()}`, name: workout.name, exercises });
    navigation.navigate('ActiveWorkout');
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => { haptic.selection(); onToggle(); }}>
      <Card style={{ marginBottom: spacing.sm }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{workout.name}</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
              {formatDate(workout.completedAt || workout.startedAt || '')}
            </Text>
            {muscles.length > 0 && (
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' }}>
                {muscles.map((m) => (
                  <View key={m} style={[styles.muscleTag, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '35' }]}>
                    <Text style={[typography.captionMedium, { color: colors.primary, fontSize: 10 }]}>{MUSCLE_LABELS[m] || m}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
            {!!workout.durationMinutes && <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>{formatDuration(workout.durationMinutes)}</Text>}
            {workout.totalVolume > 0 && <Text style={[typography.captionMedium, { color: colors.primary }]}>{Math.round(workout.totalVolume)} кг</Text>}
            {workout.rating > 0 && <Text style={{ fontSize: 10, color: colors.accent, fontWeight: '700' }}>{'★'.repeat(workout.rating)}</Text>}
            {prCount > 0 && (
              <View style={[styles.prBadge, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '60' }]}>
                <Text style={{ fontSize: 10, color: colors.warning, fontWeight: '700' }}>PR {prCount}</Text>
              </View>
            )}
            <Text style={[typography.caption, { color: colors.textTertiary }]}>{completedSets} подх. {isExpanded ? '▲' : '▼'}</Text>
          </View>
        </View>

        {isExpanded && (
          <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
            {workout.notes ? (
              <Text style={[typography.small, { color: colors.textSecondary, fontStyle: 'italic', marginBottom: spacing.md }]} numberOfLines={3}>
                {workout.notes}
              </Text>
            ) : null}
            {!activeWorkout && (
              <TouchableOpacity
                onPress={handleRepeat}
                style={[{ backgroundColor: colors.primary + '15', borderRadius: borderRadius.sm, paddingVertical: spacing.sm, alignItems: 'center', marginBottom: spacing.md, borderWidth: 1, borderColor: colors.primary + '35' }]}
              >
                <Text style={[typography.captionMedium, { color: colors.primary }]}>Повторить тренировку</Text>
              </TouchableOpacity>
            )}
            {workout.exercises.map((ex: any, ei: number) => {
              const doneSets = ex.sets.filter((s: any) => s.completed);
              const vol = doneSets.reduce((s: number, set: any) => s + (set.weight || 0) * (set.reps || 0), 0);
              const bestSet = [...doneSets].sort((a: any, b: any) => (b.weight || 0) - (a.weight || 0))[0];
              const hasPR = doneSets.some((s: any) => s.isPR);
              return (
                <View key={ex.id} style={[styles.exRow, ei < workout.exercises.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <Text style={[typography.small, { color: colors.text, flex: 1 }]} numberOfLines={1}>{ex.exercise?.name ?? ''}</Text>
                      {hasPR && (
                        <View style={[styles.prBadge, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '60' }]}>
                          <Text style={{ fontSize: 9, color: colors.warning, fontWeight: '700' }}>PR</Text>
                        </View>
                      )}
                    </View>
                    {ex.notes ? <Text style={[typography.small, { color: colors.textTertiary, fontStyle: 'italic' }]} numberOfLines={1}>{ex.notes}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[typography.captionMedium, { color: hasPR ? colors.warning : colors.textSecondary }]}>
                      {doneSets.length}×{bestSet ? `${bestSet.weight}кг` : '-'}
                    </Text>
                    {vol > 0 && <Text style={[typography.caption, { color: colors.textTertiary }]}>{Math.round(vol)} кг</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  muscleTag: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: 'transparent' },
  prBadge: { borderWidth: 1, borderRadius: borderRadius.sm, paddingHorizontal: spacing.xs, paddingVertical: 1 },
  exRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
});
