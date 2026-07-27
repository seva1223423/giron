import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../../store';
import { Card, NumberWheel } from '../../../../components';
import { typography } from '../../../../theme';
import { spacing, borderRadius } from '../../../../theme/spacing';
import { userService } from '../../../../services';
import { useHaptic } from '../../../../hooks/useHaptic';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Last recorded weight — the wheel opens there, so a typical entry is a
   *  flick of one or two notches rather than a number typed from scratch. */
  initialKg?: number;
}

/** Body weight moves in fractions of a kilo, so the wheel does too. */
const MIN_KG = 30;
const MAX_KG = 250;
const STEP_KG = 0.1;

export const AddWeightModal: React.FC<Props> = ({ visible, onClose, onSaved, initialKg }) => {
  const haptic = useHaptic();
  const colors = useThemeColors();
  const [kg, setKg] = useState<number>(initialKg ?? 80);
  const [saving, setSaving] = useState(false);

  // Reopening after a new entry should start from the new weight, not the one
  // this component happened to mount with.
  React.useEffect(() => {
    if (visible && initialKg != null) setKg(initialKg);
  }, [visible, initialKg]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await userService.addWeight(kg);
      haptic.success();
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
          <NumberWheel
            value={kg}
            onChange={setKg}
            min={MIN_KG}
            max={MAX_KG}
            step={STEP_KG}
            unit="кг"
            label="Вес"
            format={(v) => v.toFixed(1)}
          />
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
            <TouchableOpacity onPress={onClose} style={[styles.btn, { backgroundColor: colors.surface, flex: 1 }]}>
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
  btn: { height: 48, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center' },
});
