import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Props {
  todayPlan: { name: string; emoji: string; exercises: string[] };
  onStart: () => void;
}

export const TodayPlanCard: React.FC<Props> = ({ todayPlan, onStart }) => {
  const { colors } = useThemeStore();

  return (
    <Card
      style={{ marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.accent }}
      onPress={todayPlan.exercises.length > 0 ? onStart : undefined}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.captionMedium, { color: colors.accent }]}>ПЛАН НА СЕГОДНЯ</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent }}>{todayPlan.emoji}</Text>
            <Text style={[typography.h4, { color: colors.text }]} numberOfLines={1}>{todayPlan.name}</Text>
          </View>
        </View>
        {todayPlan.exercises.length > 0 && (
          <Text style={[typography.bodySemibold, { color: colors.accent }]}>▶ Начать</Text>
        )}
      </View>
    </Card>
  );
};
