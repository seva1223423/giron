import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { TrainingGoal } from '../../../types';

const GOALS: { key: TrainingGoal; label: string; emoji: string }[] = [
  { key: 'weight_loss', label: 'Похудение', emoji: '🔥' },
  { key: 'muscle_gain', label: 'Набор массы', emoji: '💪' },
  { key: 'strength', label: 'Сила', emoji: '🏋️' },
  { key: 'endurance', label: 'Выносливость', emoji: '🏃' },
  { key: 'flexibility', label: 'Гибкость', emoji: '🧘' },
  { key: 'general_fitness', label: 'Общая форма', emoji: '⚡' },
];

interface Props {
  goal: TrainingGoal | null;
  onSelect: (goal: TrainingGoal) => void;
}

export const GoalStep: React.FC<Props> = ({ goal, onSelect }) => {
  const { colors } = useThemeStore();
  return (
    <View style={styles.container}>
      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>Какая у тебя цель?</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xxl }]}>
        Мы подберём программу и питание под твою цель.
      </Text>
      {GOALS.map((g) => (
        <TouchableOpacity
          key={g.key}
          activeOpacity={0.7}
          onPress={() => onSelect(g.key)}
          style={[styles.option, { backgroundColor: goal === g.key ? colors.primary : colors.surface, borderColor: goal === g.key ? colors.primary : colors.border }]}
        >
          <Text style={{ fontSize: 24, marginRight: spacing.md }}>{g.emoji}</Text>
          <Text style={[typography.bodySemibold, { color: goal === g.key ? '#FFF' : colors.text }]}>{g.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, borderRadius: borderRadius.lg, borderWidth: 1.5, marginBottom: spacing.md },
});
