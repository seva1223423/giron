import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../../store';
import { Card } from '../../../../components';
import { typography } from '../../../../theme';
import { spacing, borderRadius } from '../../../../theme/spacing';
import { userService } from '../../../../services';
import { useHaptic } from '../../../../hooks/useHaptic';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const AddWeightModal: React.FC<Props> = ({ visible, onClose, onSaved }) => {
  const haptic = useHaptic();
  const colors = useThemeColors();
  const [newWeight, setNewWeight] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const kg = parseFloat(newWeight.replace(',', '.'));
    if (!kg || kg < 20 || kg > 300) {
      Alert.alert('Ошибка', 'Введи корректный вес (20–300 кг)');
      return;
    }
    setSaving(true);
    try {
      await userService.addWeight(kg);
      haptic.success();
      setNewWeight('');
      onSaved();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить вес');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Card style={styles.card}>
          <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.md }]}>Записать вес</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
              value={newWeight}
              onChangeText={setNewWeight}
              placeholder="85.5"
              placeholderTextColor={colors.inputPlaceholder}
              keyboardType="decimal-pad"
              autoFocus
              maxLength={6}
            />
            <Text style={[typography.h4, { color: colors.textSecondary }]}>кг</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
            <TouchableOpacity onPress={() => { onClose(); setNewWeight(''); }} style={[styles.btn, { backgroundColor: colors.surface, flex: 1 }]}>
              <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.btn, { backgroundColor: colors.primary, flex: 1 }]}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[typography.bodyMedium, { color: '#fff' }]}>Сохранить</Text>}
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
  input: { flex: 1, height: 52, borderRadius: borderRadius.lg, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 28, fontWeight: '700', textAlign: 'center' },
  btn: { height: 48, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center' },
});
