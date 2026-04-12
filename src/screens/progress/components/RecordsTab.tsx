import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';
import { PersonalRecordCard, StrengthStandardsCard, ClubLeaderboard } from './records';
import { ACHIEVEMENT_DEFINITIONS, Achievement } from '../../../utils/achievements';

interface RecordsTabProps {
  colors: any;
  workoutHistory: Workout[];
  user: any;
  achievements?: Achievement[];
  unlockedCount?: number;
}

export const RecordsTab: React.FC<RecordsTabProps> = ({ colors, workoutHistory, user, achievements = [], unlockedCount = 0 }) => {
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
                {v === 'mine' ? 'Мои рекорды' : 'Клуб'}
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

      {/* ── Achievements section ── */}
      {achievements.length > 0 && (
        <FadeIn delay={300}>
          <View style={{ marginTop: spacing.xl }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={[typography.h4, { color: colors.text }]}>Достижения</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>{unlockedCount} из {ACHIEVEMENT_DEFINITIONS.length}</Text>
            </View>
            {/* Progress bar */}
            <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, marginBottom: spacing.lg }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.accent, width: `${(unlockedCount / ACHIEVEMENT_DEFINITIONS.length) * 100}%` as any }} />
            </View>
            {(['workout', 'strength', 'streak', 'exploration', 'nutrition'] as const).map((cat) => {
              const catItems = achievements.filter((a) => a.category === cat);
              const catLabel: Record<string, string> = {
                workout: 'Тренировки', strength: 'Сила', streak: 'Серия', exploration: 'Исследование', nutrition: 'Питание',
              };
              return (
                <View key={cat} style={{ marginBottom: spacing.lg }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: colors.textTertiary, marginBottom: spacing.sm }}>
                    {catLabel[cat].toUpperCase()}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {catItems.map((ach) => (
                      <View
                        key={ach.id}
                        style={{
                          alignItems: 'center', width: 64,
                          opacity: ach.unlockedAt ? 1 : 0.35,
                        }}
                      >
                        <View style={{
                          width: 48, height: 48, borderRadius: 24,
                          backgroundColor: ach.unlockedAt ? colors.accent + '18' : colors.surface,
                          alignItems: 'center', justifyContent: 'center',
                          borderWidth: 1, borderColor: ach.unlockedAt ? colors.accent + '40' : colors.border,
                        }}>
                          <Text style={{ fontSize: 20 }}>{ach.emoji}</Text>
                        </View>
                        <Text style={{ fontSize: 9, fontWeight: '600', color: colors.textSecondary, marginTop: 4, textAlign: 'center' }} numberOfLines={2}>
                          {ach.title}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        </FadeIn>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  segmentControl: { flexDirection: 'row', borderRadius: 16, padding: 3, marginBottom: 8 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 12 },
});

export default RecordsTab;
