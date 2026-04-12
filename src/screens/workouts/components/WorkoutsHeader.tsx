import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  navigation: any;
}

const SHORTCUTS = [
  { label: 'История', icon: '◧', screen: 'WorkoutHistory' },
  { label: 'Кардио', icon: '◑', screen: 'Cardio' },
  { label: 'Рекорды', icon: '◉', screen: 'PersonalRecords' },
  { label: 'Неделя', icon: '◫', screen: 'WeeklyPlan' },
  { label: '1ПМ', icon: '◎', screen: 'OneRMCalculator' },
  { label: 'Блины', icon: '◈', screen: 'PlateCalculator' },
] as const;

export const WorkoutsHeader: React.FC<Props> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const haptic = useHaptic();

  return (
    <View style={{ paddingTop: safeTop, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      {/* Title row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
        <Text style={[typography.h2, { color: colors.text }]}>Тренировки</Text>
        <TouchableOpacity
          onPress={() => { haptic.selection(); navigation.navigate('CustomWorkout'); }}
          style={{ width: 36, height: 36, borderRadius: borderRadius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFF', lineHeight: 24 }}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Shortcuts row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.sm }}
      >
        {SHORTCUTS.map((s) => (
          <TouchableOpacity
            key={s.screen}
            onPress={() => { haptic.selection(); navigation.navigate(s.screen); }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingVertical: 6, paddingHorizontal: spacing.md,
              borderRadius: borderRadius.full,
              backgroundColor: colors.surface,
              borderWidth: 1, borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>{s.icon}</Text>
            <Text style={[typography.small, { color: colors.textSecondary, fontWeight: '600' }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};
