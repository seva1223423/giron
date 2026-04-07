import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { useThemeStore, useWorkoutStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { Workout } from '../../../types';

interface Props { workout: Workout }

export const SessionNoteCard: React.FC<Props> = ({ workout }) => {
  const { colors } = useThemeStore();
  const { updateWorkoutInHistory } = useWorkoutStore();
  const [note, setNote] = useState<string>(workout.notes ?? '');

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
        ЗАМЕТКИ О ТРЕНИРОВКЕ
      </Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        onBlur={() => {
          if (note !== (workout.notes ?? '')) {
            updateWorkoutInHistory(workout.id, { notes: note.trim() || undefined });
          }
        }}
        placeholder="Как прошло? Самочувствие, замечания..."
        placeholderTextColor={colors.textTertiary}
        multiline
        numberOfLines={3}
        style={[typography.body, { color: colors.text, backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.md, minHeight: 72, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.border }]}
      />
    </Card>
  );
};
