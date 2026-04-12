import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const PROGRAMS = [
  'Толчок-Тяга-Ноги', 'Верх / Низ', 'Стартовая сила',
  'Бро-сплит', 'Фулбоди', 'Кардио + Тонус',
];

interface Props {
  visible: boolean;
  currentProgram?: string;
  onClose: () => void;
  onSelect: (program: string) => void;
  onClear: () => void;
}

export const ProgramPickerModal: React.FC<Props> = ({ visible, currentProgram, onClose, onSelect, onClear }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { height: screenHeight } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Назначить программу</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Math.min(320, screenHeight * 0.45) }}>
            {PROGRAMS.map((program) => (
              <TouchableOpacity
                key={program}
                onPress={() => { haptic.selection(); onSelect(program); }}
                style={[styles.row, { borderBottomColor: colors.divider }]}
              >
                <Text style={[typography.body, { color: currentProgram === program ? colors.primary : colors.text, flex: 1 }]}>{program}</Text>
                {currentProgram === program && <Text style={{ color: colors.primary }}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => { haptic.selection(); onClear(); }} style={[styles.row, { borderBottomColor: colors.divider }]}>
              <Text style={[typography.body, { color: colors.textSecondary }]}>Убрать программу</Text>
            </TouchableOpacity>
          </ScrollView>
          <Button title="Отмена" variant="ghost" onPress={onClose} fullWidth style={{ marginTop: spacing.md }} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1 },
});
