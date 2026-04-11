import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { AIActionResult } from '../../../services';

interface Props {
  actions: AIActionResult[];
}

export const ActionsBar: React.FC<Props> = ({ actions }) => {
  const { colors } = useThemeStore();
  if (actions.length === 0) return null;
  return (
    <View style={[styles.bar, { backgroundColor: colors.success + '18', borderTopColor: colors.success + '40' }]}>
      {actions.map((action, i) => (
        <View key={i} style={[styles.chip, { backgroundColor: colors.success + '22', borderColor: colors.success + '55' }]}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.success, marginRight: 4 }}>✓</Text>
          <Text style={[typography.small, { color: colors.success, flex: 1 }]}>{action.description}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1, gap: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1 },
});
