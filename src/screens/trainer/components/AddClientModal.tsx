import React, { useState } from 'react';
import { View, Text, TextInput, Modal, StyleSheet } from 'react-native';
import { useThemeStore, useTrainerStore } from '../../../store';
import { Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { useHaptic } from '../../../hooks/useHaptic';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const AddClientModal: React.FC<Props> = ({ visible, onClose }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { addClient } = useTrainerStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleAdd = () => {
    if (!name.trim()) return;
    haptic.medium();
    addClient({ name: name.trim(), phone: phone.trim() || undefined, totalWorkouts: 0, emoji: '🧑' });
    setName('');
    setPhone('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Новый клиент</Text>

          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>ИМЯ И ФАМИЛИЯ *</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Иван Иванов" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} autoFocus />

          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md }]}>ТЕЛЕФОН</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="+7 900 000 0000" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />

          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
            <Button title="Отмена" variant="ghost" onPress={() => { onClose(); setName(''); setPhone(''); }} style={{ flex: 1 }} />
            <Button title="Добавить" onPress={handleAdd} style={{ flex: 1 }} disabled={!name.trim()} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 48 },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16 },
});
