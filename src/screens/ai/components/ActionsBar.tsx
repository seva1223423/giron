import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Icon } from '../../../components';
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
          <Icon name="check" size={14} color={colors.success} />
          <Text style={[typography.smallMedium, { color: colors.success, flex: 1, marginLeft: 6 }]} numberOfLines={1}>{action.description}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1, gap: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1 },
});
