import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

const TABS = [
  { key: 'quick', label: 'Быстрый старт' },
  { key: 'programs', label: 'Программы' },
  { key: 'exercises', label: 'Упражнения' },
] as const;

export type WorkoutsTab = typeof TABS[number]['key'];

interface Props {
  activeTab: WorkoutsTab;
  onTabChange: (tab: WorkoutsTab) => void;
}

export const WorkoutsTabBar: React.FC<Props> = ({ activeTab, onTabChange }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();

  return (
    <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
      {TABS.map((t) => (
        <TouchableOpacity
          key={t.key}
          onPress={() => { haptic.selection(); onTabChange(t.key); }}
          style={[styles.tab, activeTab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2.5, backgroundColor: colors.primary + '08' }]}
        >
          <Text style={[typography.smallMedium, { color: activeTab === t.key ? colors.primary : colors.textSecondary }]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  tab: { paddingVertical: spacing.md, marginRight: spacing.xl },
});
