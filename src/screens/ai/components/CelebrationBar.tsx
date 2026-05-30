import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Icon } from '../../../components';
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
          <Icon name="trophy" size={14} color={colors.accent} />
          <Text style={[typography.smallMedium, { color: colors.accent, flex: 1, marginLeft: 6 }]} numberOfLines={1}>{m}</Text>
        </View>
      ))}
      {celebration.prs.map((pr, i) => (
        <View key={`pr-${i}`} style={[styles.chip, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '50' }]}>
          {/* PR is an abbreviation (Personal Record), not a glyph icon — keep
              as text in monospace meta label style for tight grouping. */}
          <Text style={[typography.metaLabel, { color: colors.warning }]}>PR</Text>
          <Text style={[typography.smallMedium, { color: colors.warning, flex: 1, marginLeft: 6 }]} numberOfLines={1}>Новый рекорд: {pr}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1, gap: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1 },
});
