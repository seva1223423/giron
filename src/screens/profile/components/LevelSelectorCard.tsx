import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeColors } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const LEVELS = [
  { value: 'BEGINNER', label: 'Новичок', desc: '< 1 года' },
  { value: 'INTERMEDIATE', label: 'Средний', desc: '1–3 года' },
  { value: 'ADVANCED', label: 'Продвинутый', desc: '3–5 лет' },
  { value: 'EXPERT', label: 'Эксперт', desc: '5+ лет' },
];

interface Props {
  selected: string;
  onSelect: (value: string) => void;
}

export const LevelSelectorCard: React.FC<Props> = ({ selected, onSelect }) => {
  const haptic = useHaptic();
  const colors = useThemeColors();
  return (
    <Card style={{ marginBottom: spacing.xl }}>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Уровень подготовки</Text>
      {LEVELS.map((l) => {
        const isSelected = selected === l.value;
        return (
          <TouchableOpacity
            key={l.value}
            onPress={() => { haptic.selection(); onSelect(l.value); }}
            style={[styles.row, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary + '10' : 'transparent' }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodySemibold, { color: isSelected ? colors.primary : colors.text }]} numberOfLines={1}>{l.label}</Text>
              <Text style={[typography.small, { color: colors.textSecondary }]}>{l.desc}</Text>
            </View>
            {isSelected && (
              <View style={[styles.checkmark, { backgroundColor: colors.primary, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' }]}>
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </Card>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1.5, marginBottom: spacing.sm },
  checkmark: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
