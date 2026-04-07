import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const GOALS = [
  { value: 'MUSCLE_GAIN', label: 'Набор мышц', emoji: '💪' },
  { value: 'WEIGHT_LOSS', label: 'Похудение', emoji: '🔥' },
  { value: 'STRENGTH', label: 'Сила', emoji: '🏋️' },
  { value: 'ENDURANCE', label: 'Выносливость', emoji: '🏃' },
  { value: 'FLEXIBILITY', label: 'Гибкость', emoji: '🧘' },
  { value: 'GENERAL_FITNESS', label: 'Общая форма', emoji: '⚡' },
];

interface Props {
  selected: string;
  onSelect: (value: string) => void;
}

export const GoalSelectorCard: React.FC<Props> = ({ selected, onSelect }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Цель тренировок</Text>
      <View style={styles.grid}>
        {GOALS.map((g) => {
          const isSelected = selected === g.value;
          return (
            <TouchableOpacity
              key={g.value}
              onPress={() => { haptic.selection(); onSelect(g.value); }}
              style={[styles.card, { backgroundColor: isSelected ? colors.primary + '15' : colors.surface, borderColor: isSelected ? colors.primary : colors.border }]}
            >
              <Text style={{ fontSize: 24, marginBottom: spacing.xs }}>{g.emoji}</Text>
              <Text style={[typography.captionMedium, { color: isSelected ? colors.primary : colors.text, textAlign: 'center' }]}>{g.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { width: '30.5%', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1.5 },
});
