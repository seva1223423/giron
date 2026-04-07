import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';
import { PersonalRecordCard, StrengthStandardsCard, ClubLeaderboard } from './records';

interface RecordsTabProps {
  colors: any;
  workoutHistory: Workout[];
  user: any;
}

export const RecordsTab: React.FC<RecordsTabProps> = ({ colors, workoutHistory, user }) => {
  const haptic = useHaptic();
  const [recordsView, setRecordsView] = useState<'mine' | 'club'>('mine');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  const personalRecords = useMemo(() => {
    const records: Record<string, { exerciseId: string; name: string; maxWeight: number; maxReps: number; estimated1RM: number }> = {};
    workoutHistory.forEach((workout) => {
      workout.exercises.forEach((ex) => {
        ex.sets.filter((s) => s.completed && s.weight && s.reps).forEach((set) => {
          const key = ex.exerciseId;
          const estimated1RM = (set.weight || 0) * (1 + (set.reps || 0) / 30);
          if (!records[key] || estimated1RM > records[key].estimated1RM) {
            records[key] = { exerciseId: ex.exerciseId, name: ex.exercise.name, maxWeight: set.weight || 0, maxReps: set.reps || 0, estimated1RM: Math.round(estimated1RM) };
          }
        });
      });
    });
    return Object.values(records).sort((a, b) => b.estimated1RM - a.estimated1RM);
  }, [workoutHistory]);

  const oneRMHistory = useMemo(() => {
    if (!selectedExerciseId) return [];
    const byDate = new Map<string, number>();
    [...workoutHistory].filter((w) => w.completedAt).sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime()).forEach((workout) => {
      workout.exercises.filter((ex) => ex.exerciseId === selectedExerciseId).forEach((ex) => {
        ex.sets.filter((s) => s.completed && s.weight && s.reps).forEach((set) => {
          const date = workout.completedAt!.split('T')[0];
          const est1rm = Math.round((set.weight || 0) * (1 + (set.reps || 0) / 30));
          if (!byDate.has(date) || est1rm > byDate.get(date)!) byDate.set(date, est1rm);
        });
      });
    });
    return Array.from(byDate.entries()).map(([date, value]) => ({
      label: new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''),
      value,
    }));
  }, [selectedExerciseId, workoutHistory]);

  return (
    <>
      <FadeIn delay={0}>
        <View style={[styles.segmentControl, { backgroundColor: colors.surface }]}>
          {(['mine', 'club'] as const).map((v) => (
            <TouchableOpacity key={v} onPress={() => { haptic.selection(); setRecordsView(v); }} style={[styles.segmentBtn, recordsView === v && { backgroundColor: colors.primary }]}>
              <Text style={[typography.smallMedium, { color: recordsView === v ? '#fff' : colors.textSecondary }]}>
                {v === 'mine' ? 'Мои рекорды' : '🏆 Клуб'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </FadeIn>

      {recordsView === 'mine' && (
        personalRecords.length === 0
          ? <FadeIn><Card style={{ marginTop: spacing.lg }}><Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>Рекорды появятся после первых тренировок</Text></Card></FadeIn>
          : <>
              {personalRecords.map((record, i) => (
                <PersonalRecordCard
                  key={record.exerciseId}
                  record={record}
                  topRM={personalRecords[0].estimated1RM}
                  isSelected={selectedExerciseId === record.exerciseId}
                  onPress={() => { haptic.selection(); setSelectedExerciseId(selectedExerciseId === record.exerciseId ? null : record.exerciseId); }}
                  oneRMHistory={selectedExerciseId === record.exerciseId ? oneRMHistory : []}
                  animDelay={i === 0 ? spacing.lg : i * 60}
                />
              ))}
              <StrengthStandardsCard personalRecords={personalRecords} bodyWeightKg={user?.weightKg || 80} delay={200} />
            </>
      )}

      {recordsView === 'club' && <ClubLeaderboard />}
    </>
  );
};

const styles = StyleSheet.create({
  segmentControl: { flexDirection: 'row', borderRadius: 16, padding: 3, marginBottom: 8 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 12 },
});

export default RecordsTab;
