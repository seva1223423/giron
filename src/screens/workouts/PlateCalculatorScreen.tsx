import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors, useWorkoutStore } from '../../store';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { PlateCalculatorTab, OneRMCalculatorTab } from './calculator';

interface ApplyTarget {
  exerciseIndex: number;
  setIndex: number;
}

export const PlateCalculatorScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const colors = useThemeColors();
  const [activeTab, setActiveTab] = useState<'plates' | 'onerm'>('plates');
  const updateSetData = useWorkoutStore((s) => s.updateSetData);

  const applyTarget: ApplyTarget | undefined = route?.params?.applyTarget;

  // Only show "Apply" when the screen was opened from a specific set input
  // (SetsSection passes applyTarget). When opened from the hub navigation there's
  // nothing to apply to, so the button stays hidden.
  const handleApply = applyTarget
    ? (weight: number) => {
        updateSetData(applyTarget.exerciseIndex, applyTarget.setIndex, { weight });
        haptic.success();
        navigation.goBack();
      }
    : undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: safeTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 60 }}>
          <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
        </TouchableOpacity>
        <Text style={[typography.h4, { color: colors.text }]}>Инструменты</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(['plates', 'onerm'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { haptic.selection(); setActiveTab(tab); }}
          >
            <Text style={[typography.bodySemibold, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>
              {tab === 'plates' ? 'Блины' : '1ПМ'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'plates' && (
          <PlateCalculatorTab
            initialWeight={route?.params?.initialWeight}
            onApplyWeight={handleApply}
          />
        )}
        {activeTab === 'onerm' && <OneRMCalculatorTab />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: 1 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
});
