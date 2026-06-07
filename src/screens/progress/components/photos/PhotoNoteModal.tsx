import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Image, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../../store';
import { Card } from '../../../../components';
import { typography } from '../../../../theme';
import { spacing, borderRadius } from '../../../../theme/spacing';

interface Props {
  visible: boolean;
  pendingPhotoUri: string | null;
  onClose: () => void;
  onSave: (note: string) => void;
}

export const PhotoNoteModal: React.FC<Props> = ({ visible, pendingPhotoUri, onClose, onSave }) => {
  const colors = useThemeColors();
  const [note, setNote] = useState('');

  const handleSave = () => { onSave(note.trim()); setNote(''); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Card style={styles.card}>
          <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>Добавить фото</Text>
          {pendingPhotoUri && (
            <Image source={{ uri: pendingPhotoUri }} style={{ width: '100%', height: 180, borderRadius: borderRadius.md, marginBottom: spacing.md }} resizeMode="cover" />
          )}
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
            value={note}
            onChangeText={setNote}
            placeholder="Заметка (необязательно)..."
            placeholderTextColor={colors.inputPlaceholder}
            maxLength={80}
          />
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
            <TouchableOpacity onPress={() => { onClose(); setNote(''); }} style={[styles.btn, { backgroundColor: colors.surface, flex: 1 }]}>
              <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[styles.btn, { backgroundColor: colors.primary, flex: 1 }]}>
              <Text style={[typography.bodyMedium, { color: '#fff' }]}>Сохранить</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: spacing.xl },
  card: { padding: spacing.xl },
  input: { height: 48, borderRadius: borderRadius.lg, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: 15 },
  btn: { height: 48, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center' },
});
