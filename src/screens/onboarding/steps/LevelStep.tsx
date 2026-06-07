import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { FitnessLevel } from '../../../types';

const LEVELS: { key: FitnessLevel; label: string; description: string }[] = [
  { key: 'beginner', label: 'Новичок', description: 'Менее 6 месяцев опыта' },
  { key: 'intermediate', label: 'Средний', description: '6 месяцев — 2 года' },
  { key: 'advanced', label: 'Продвинутый', description: '2 — 5 лет' },
  { key: 'expert', label: 'Эксперт', description: 'Более 5 лет' },
];

interface Props {
  level: FitnessLevel | null;
  onSelect: (level: FitnessLevel) => void;
}

export const LevelStep: React.FC<Props> = ({ level, onSelect }) => {
  const colors = useThemeColors();
  return (
    <View style={styles.container}>
      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>Уровень подготовки</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xxl }]}>
        Это определит сложность стартовой программы.
      </Text>
      {LEVELS.map((l) => (
        <TouchableOpacity
          key={l.key}
          activeOpacity={0.7}
          onPress={() => onSelect(l.key)}
          style={[styles.option, { backgroundColor: level === l.key ? colors.primary : colors.surface, borderColor: level === l.key ? colors.primary : colors.border }]}
        >
          <View>
            <Text style={[typography.bodySemibold, { color: level === l.key ? '#FFF' : colors.text }]}>{l.label}</Text>
            <Text style={[typography.small, { color: level === l.key ? 'rgba(255,255,255,0.8)' : colors.textSecondary }]}>{l.description}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, borderRadius: borderRadius.lg, borderWidth: 1.5, marginBottom: spacing.md },
});
