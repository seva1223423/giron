import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useTrainerStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  clientId: string;
  initialNotes: string;
}

export const ClientNotesCard: React.FC<Props> = ({ clientId, initialNotes }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { updateClient } = useTrainerStore();
  const [notes, setNotes] = useState(initialNotes);
  const [editing, setEditing] = useState(false);

  const handleSave = () => {
    haptic.light();
    updateClient(clientId, { notes });
    setEditing(false);
  };

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>ЗАМЕТКИ ТРЕНЕРА</Text>
        {!editing
          ? <TouchableOpacity onPress={() => setEditing(true)} style={[styles.editBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>✎ Редактировать</Text>
            </TouchableOpacity>
          : <TouchableOpacity onPress={handleSave} style={[styles.editBtn, { backgroundColor: colors.success + '20', borderColor: colors.success + '40' }]}>
              <Text style={[typography.caption, { color: colors.success }]}>✓ Сохранить</Text>
            </TouchableOpacity>}
      </View>
      {editing
        ? <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            placeholder="Особенности клиента, противопоказания, цели..."
            placeholderTextColor={colors.textTertiary}
            style={[styles.notesInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
            autoFocus
          />
        : <Text style={[typography.body, { color: notes ? colors.text : colors.textTertiary }]}>{notes || 'Нет заметок'}</Text>}
    </Card>
  );
};

const styles = StyleSheet.create({
  editBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.sm, borderWidth: 1 },
  notesInput: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, minHeight: 100, textAlignVertical: 'top', fontSize: 15 },
});
