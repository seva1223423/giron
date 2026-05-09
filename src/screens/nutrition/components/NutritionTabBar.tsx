import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeColors } from '../../../store';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

const TABS = [
  { key: 'today', label: 'Сегодня' },
  { key: 'week', label: 'Неделя' },
] as const;

export type NutritionTab = typeof TABS[number]['key'];

interface Props {
  activeTab: NutritionTab;
  onTabChange: (tab: NutritionTab) => void;
}

export const NutritionTabBar: React.FC<Props> = ({ activeTab, onTabChange }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();

  return (
    <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
      {TABS.map((t) => (
        <TouchableOpacity
          key={t.key}
          onPress={() => { haptic.selection(); onTabChange(t.key); }}
          style={[styles.tab, activeTab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2.5, backgroundColor: colors.primary + '08' }]}
          accessibilityRole="button"
          accessibilityLabel={t.label}
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
