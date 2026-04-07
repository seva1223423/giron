import React from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

export const UnitsSection: React.FC = () => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { units, setUnits } = useSettingsStore();

  return (
    <FadeIn delay={60}>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>ЕДИНИЦЫ ИЗМЕРЕНИЯ</Text>
        <View style={styles.segmentRow}>
          {(['metric', 'imperial'] as const).map((u) => (
            <TouchableOpacity
              key={u}
              onPress={() => { haptic.selection(); setUnits(u); }}
              style={[styles.segment, { backgroundColor: units === u ? colors.primary : colors.surface, borderColor: units === u ? colors.primary : colors.border }]}
            >
              <Text style={[typography.captionMedium, { color: units === u ? '#FFF' : colors.text }]}>
                {u === 'metric' ? 'кг / см' : 'фунты / дюймы'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  segmentRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  segment: { flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, alignItems: 'center' },
});
