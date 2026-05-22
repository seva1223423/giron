import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  celebration: { milestones: string[]; prs: string[] } | null;
}

export const CelebrationBar: React.FC<Props> = ({ celebration }) => {
  const colors = useThemeColors();
  if (!celebration) return null;
  return (
    <View style={[styles.bar, { backgroundColor: colors.accent + '15', borderTopColor: colors.accent + '40' }]}>
      {celebration.milestones.map((m, i) => (
        <View key={`m-${i}`} style={[styles.chip, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '50' }]}>
          <Text style={{ fontSize: 14, marginRight: 4, fontWeight: '800', color: colors.accent }}>★</Text>
          <Text style={[typography.small, { color: colors.accent, fontWeight: '700', flex: 1 }]} numberOfLines={1}>{m}</Text>
        </View>
      ))}
      {celebration.prs.map((pr, i) => (
        <View key={`pr-${i}`} style={[styles.chip, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '50' }]}>
          <Text style={{ fontSize: 14, marginRight: 4, fontWeight: '800', color: colors.warning }}>PR</Text>
          <Text style={[typography.small, { color: colors.warning, fontWeight: '700', flex: 1 }]} numberOfLines={1}>Новый рекорд: {pr}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1, gap: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1 },
});
