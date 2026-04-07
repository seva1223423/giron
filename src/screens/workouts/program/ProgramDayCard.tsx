import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { Card, Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { exercises as localExercises } from '../../../data/exercises';

interface DayExercise {
  exerciseId: string;
  sets: number;
  reps: string;
  rest: number;
}

interface Day {
  name: string;
  exercises: DayExercise[];
}

interface Props {
  day: Day;
  dayIndex: number;
  goalColor: string;
  isExpanded: boolean;
  onToggle: () => void;
  onStart: () => void;
}

export const ProgramDayCard: React.FC<Props> = ({ day, dayIndex, goalColor, isExpanded, onToggle, onStart }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <TouchableOpacity onPress={() => { haptic.selection(); onToggle(); }}>
        <View style={styles.dayHeader}>
          <View style={[styles.badge, { backgroundColor: goalColor + '20' }]}>
            <Text style={[typography.captionMedium, { color: goalColor }]}>{dayIndex + 1}</Text>
          </View>
          <Text style={[typography.bodySemibold, { color: colors.text, flex: 1 }]}>{day.name}</Text>
          <Text style={[typography.small, { color: colors.textTertiary }]}>{day.exercises.length} упр {isExpanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <>
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          {day.exercises.map((item, exIndex) => {
            const ex = localExercises.find((e) => e.id === item.exerciseId);
            return (
              <View key={exIndex} style={[styles.exRow, exIndex < day.exercises.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
                <View style={[styles.exNumber, { backgroundColor: colors.surface }]}>
                  <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>{exIndex + 1}</Text>
                </View>
                <Text style={[typography.small, { color: colors.text, flex: 1 }]}>{ex?.name || item.exerciseId}</Text>
                <Text style={[typography.captionMedium, { color: colors.primary }]}>{item.sets}×{item.reps}</Text>
              </View>
            );
          })}
          <Button title={`Начать: ${day.name}`} onPress={onStart} fullWidth style={{ marginTop: spacing.md }} />
        </>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, marginVertical: spacing.md },
  exRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
  exNumber: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
