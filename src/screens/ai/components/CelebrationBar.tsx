import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  celebration: { milestones: string[]; prs: string[] } | null;
}

export const CelebrationBar: React.FC<Props> = ({ celebration }) => {
  const { colors } = useThemeStore();
  if (!celebration) return null;
  return (
    <View style={[styles.bar, { backgroundColor: colors.accent + '15', borderTopColor: colors.accent + '40' }]}>
      {celebration.milestones.map((m, i) => (
        <View key={`m-${i}`} style={[styles.chip, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '50' }]}>
          <Text style={{ fontSize: 14, marginRight: 4 }}>🏆</Text>
          <Text style={[typography.small, { color: colors.accent, fontWeight: '700', flex: 1 }]}>{m}</Text>
        </View>
      ))}
      {celebration.prs.map((pr, i) => (
        <View key={`pr-${i}`} style={[styles.chip, { backgroundColor: '#FF9800' + '20', borderColor: '#FF9800' + '50' }]}>
          <Text style={{ fontSize: 14, marginRight: 4 }}>🎉</Text>
          <Text style={[typography.small, { color: '#FF9800', fontWeight: '700', flex: 1 }]}>Новый рекорд: {pr}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1, gap: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1 },
});
