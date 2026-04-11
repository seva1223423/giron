import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Alert, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore } from '../../../../store';
import { typography } from '../../../../theme';
import { spacing, borderRadius } from '../../../../theme/spacing';
import { useHaptic } from '../../../../hooks/useHaptic';
import type { BodyMeasurement } from '../../../../types';

export const MEASUREMENTS_KEY = 'iron_gym_body_measurements';

export const MEASUREMENT_FIELDS: { key: keyof BodyMeasurement; label: string; emoji: string }[] = [
  { key: 'chest', label: 'Грудь', emoji: '◉' },
  { key: 'waist', label: 'Талия', emoji: '◑' },
  { key: 'hips', label: 'Бёдра', emoji: '◎' },
  { key: 'bicep', label: 'Бицепс', emoji: '◉' },
  { key: 'thigh', label: 'Бедро', emoji: '◎' },
  { key: 'calf', label: 'Икра', emoji: '◧' },
  { key: 'neck', label: 'Шея', emoji: '◫' },
];

interface Props {
  visible: boolean;
  measurementHistory: BodyMeasurement[];
  onClose: () => void;
  onSaved: (updated: BodyMeasurement[]) => void;
}

export const AddMeasurementsModal: React.FC<Props> = ({ visible, measurementHistory, onClose, onSaved }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const [fields, setFields] = useState<Partial<Record<keyof BodyMeasurement, string>>>({});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const today = new Date().toISOString().split('T')[0];
    const entry: BodyMeasurement = { date: today };
    let hasAny = false;
    MEASUREMENT_FIELDS.forEach(({ key }) => {
      const val = parseFloat((fields[key] ?? '').replace(',', '.'));
      if (val > 0 && val < 200) { (entry as any)[key] = val; hasAny = true; }
    });
    if (!hasAny) { Alert.alert('Ошибка', 'Введи хотя бы одно измерение'); return; }
    setSaving(true);
    try {
      const updated = [...measurementHistory.filter((m) => m.date !== today), entry]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      await AsyncStorage.setItem(MEASUREMENTS_KEY, JSON.stringify(updated));
      setFields({});
      haptic.success();
      onSaved(updated);
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить измерения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>Замер обхватов</Text>
          <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.lg }]}>Заполни только те поля, которые хочешь отследить</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {MEASUREMENT_FIELDS.map(({ key, label, emoji }) => (
              <View key={key} style={{ marginBottom: spacing.md }}>
                <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{emoji} {label.toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText, flex: 1 }]}
                    value={fields[key] ?? ''}
                    onChangeText={(v) => setFields((prev) => ({ ...prev, [key]: v }))}
                    placeholder="—"
                    placeholderTextColor={colors.inputPlaceholder}
                    keyboardType="decimal-pad"
                    maxLength={5}
                  />
                  <Text style={[typography.body, { color: colors.textSecondary }]}>см</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
            <TouchableOpacity onPress={() => { onClose(); setFields({}); }} style={[styles.btn, { backgroundColor: colors.surface, flex: 1 }]}>
              <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.btn, { backgroundColor: colors.accent, flex: 1 }]}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[typography.bodyMedium, { color: '#fff' }]}>Сохранить</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 48 },
  input: { height: 52, borderRadius: borderRadius.lg, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  btn: { height: 48, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center' },
});
