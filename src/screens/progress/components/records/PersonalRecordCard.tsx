import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../../store';
import { Card, FadeIn } from '../../../../components';
import { LineChart } from '../LineChart';
import { typography } from '../../../../theme';
import { spacing } from '../../../../theme/spacing';

interface ChartPoint {
  label: string;
  value: number;
}

interface Record {
  exerciseId: string;
  name: string;
  maxWeight: number;
  maxReps: number;
  estimated1RM: number;
}

interface Props {
  record: Record;
  topRM: number;
  isSelected: boolean;
  onPress: () => void;
  oneRMHistory: ChartPoint[];
  animDelay?: number;
}

export const PersonalRecordCard: React.FC<Props> = ({ record, topRM, isSelected, onPress, oneRMHistory, animDelay = 0 }) => {
  const { colors } = useThemeStore();

  return (
    <FadeIn delay={animDelay}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <Card style={{ marginBottom: spacing.sm, borderWidth: isSelected ? 1.5 : 0, borderColor: isSelected ? colors.accent : 'transparent' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={[typography.bodySemibold, { color: colors.text, flex: 1 }]} numberOfLines={1}>{record.name}</Text>
            <Text style={[typography.caption, { color: isSelected ? colors.accent : colors.textTertiary, marginLeft: spacing.sm, flexShrink: 0 }]}>
              {isSelected ? 'Скрыть ▲' : 'График ▼'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>Макс. вес</Text>
              <Text style={[typography.numberSmall, { color: colors.primary }]}>{record.maxWeight} кг</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>Повторений</Text>
              <Text style={[typography.numberSmall, { color: colors.text }]}>{record.maxReps}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>~1ПМ</Text>
              <Text style={[typography.numberSmall, { color: colors.accent }]}>{record.estimated1RM} кг</Text>
            </View>
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.primary, width: `${(record.estimated1RM / topRM) * 100}%` }} />
            </View>
          </View>
          {isSelected && (
            oneRMHistory.length >= 2
              ? <View style={{ marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider }}>
                  <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>ДИНАМИКА ~1ПМ</Text>
                  <LineChart data={oneRMHistory.slice(-12)} color={colors.accent} colors={colors} suffix=" кг" height={130} />
                </View>
              : <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
                  <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center' }]}>
                    Нужно минимум 2 тренировки с этим упражнением для графика
                  </Text>
                </View>
          )}
        </Card>
      </TouchableOpacity>
    </FadeIn>
  );
};
