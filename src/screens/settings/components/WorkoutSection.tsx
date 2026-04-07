import React, { useState } from 'react';
import { Text, View, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { SettingRow } from './SettingRow';

const REST_TIMER_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300];

function formatRestTimer(sec: number) {
  if (sec < 60) return `${sec} сек`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} мин ${s} сек` : `${m} мин`;
}

export const WorkoutSection: React.FC = () => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { restTimerDefault, setRestTimerDefault } = useSettingsStore();
  const [showPicker, setShowPicker] = useState(false);

  return (
    <FadeIn delay={120}>
      <Modal visible={showPicker} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Таймер отдыха по умолчанию</Text>
            {REST_TIMER_OPTIONS.map((sec) => (
              <TouchableOpacity
                key={sec}
                onPress={() => { haptic.selection(); setRestTimerDefault(sec); setShowPicker(false); }}
                style={[styles.pickerRow, { borderBottomColor: colors.divider }]}
              >
                <Text style={[typography.body, { color: sec === restTimerDefault ? colors.primary : colors.text }]}>{formatRestTimer(sec)}</Text>
                {sec === restTimerDefault && <Text style={{ color: colors.primary }}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowPicker(false)} style={{ marginTop: spacing.lg, alignItems: 'center' }}>
              <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>ТРЕНИРОВКИ</Text>
        <SettingRow
          label="Таймер отдыха"
          sublabel={formatRestTimer(restTimerDefault)}
          onPress={() => setShowPicker(true)}
          right={<Text style={[typography.body, { color: colors.primary }]}>›</Text>}
        />
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 48 },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1 },
});
