import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Props {
  navigation: any;
}

export const WorkoutsHeader: React.FC<Props> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.lg }}>
      <Text style={[typography.h2, { color: colors.text }]}>Тренировки</Text>
      <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}>
        <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('Cardio'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ fontSize: 18 }}>🏃</Text>
          <Text style={[typography.small, { color: colors.primary }]}>Кардио</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('WeeklyPlan'); }}>
          <Text style={[typography.small, { color: colors.textSecondary }]}>📅 План</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('PersonalRecords'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ fontSize: 18 }}>🏆</Text>
          <Text style={[typography.small, { color: colors.primary }]}>ПР</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('WorkoutCalendar'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ fontSize: 18 }}>🗓</Text>
          <Text style={[typography.small, { color: colors.primary }]}>Календарь</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('OneRMCalculator'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ fontSize: 18 }}>📊</Text>
          <Text style={[typography.small, { color: colors.primary }]}>1ПМ</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('PlateCalculator'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ fontSize: 18 }}>🏋️</Text>
          <Text style={[typography.small, { color: colors.primary }]}>Блины</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
