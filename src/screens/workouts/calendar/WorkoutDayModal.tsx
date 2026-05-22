import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { formatDuration } from './CalendarGrid';

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedDayStr: string | null;
  workouts: any[];
}

export const WorkoutDayModal: React.FC<Props> = ({ visible, onClose, selectedDayStr, workouts }) => {
  const colors = useThemeColors();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {selectedDayStr && (
            <>
              <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.xs }]}>
                {formatShortDate(selectedDayStr)}
              </Text>

              <ScrollView showsVerticalScrollIndicator={false}>
                {workouts.map((w, wi) => {
                  const completedSets = w.exercises?.flatMap((e: any) => (e.sets || []).filter((s: any) => s.completed)) || [];
                  const totalVol = completedSets.reduce((s: number, st: any) => s + (st.weight && st.reps ? st.weight * st.reps : 0), 0);
                  return (
                    <View key={wi} style={{ marginTop: wi > 0 ? spacing.lg : spacing.md }}>
                      <Text style={[typography.bodySemibold, { color: colors.text }]}>{w.name || 'Тренировка'}</Text>
                      <View style={styles.workoutMeta}>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>{completedSets.length} подходов</Text>
                        {totalVol > 0 && <Text style={[typography.caption, { color: colors.textSecondary }]}>· {Math.round(totalVol)} кг объём</Text>}
                        {w.durationMinutes ? <Text style={[typography.caption, { color: colors.textSecondary }]}>· {formatDuration(w.durationMinutes)}</Text> : null}
                      </View>
                      {w.exercises?.map((ex: any, ei: number) => {
                        const done = ex.sets?.filter((s: any) => s.completed) || [];
                        if (done.length === 0) return null;
                        const bestSet = done.reduce((best: any, s: any) => (s.weight || 0) > (best.weight || 0) ? s : best, done[0]);
                        return (
                          <View key={ei} style={[styles.exerciseRow, { borderBottomColor: colors.divider, borderBottomWidth: ei < (w.exercises?.length || 1) - 1 ? 1 : 0 }]}>
                            <Text style={[typography.small, { color: colors.text, flex: 1 }]} numberOfLines={1}>{ex.exercise?.name || ex.exerciseId}</Text>
                            <Text style={[typography.captionMedium, { color: colors.primary }]} numberOfLines={1}>
                              {done.length}×{bestSet.reps}{bestSet.weight ? ` · ${bestSet.weight} кг` : ''}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </ScrollView>

              <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.primary }]}>
                <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Закрыть</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, paddingBottom: 40, maxHeight: '70%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.lg },
  workoutMeta: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm, flexWrap: 'wrap' },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
  closeBtn: { marginTop: spacing.lg, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
});
