import React from 'react';
import { View, Text } from 'react-native';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import type { Workout } from '../../../types';

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

interface Props {
  monthDate: Date;
  workouts: Workout[];
  colors: any;
  delay?: number;
}

export const MonthStatsCard: React.FC<Props> = ({ monthDate, workouts, colors, delay = 150 }) => {
  const totalVolume = workouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
  const totalDuration = workouts.reduce((s, w) => s + (w.durationMinutes || 0), 0);
  return (
    <FadeIn delay={delay}>
      <Card style={{ marginTop: spacing.xl }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
          {MONTH_NAMES[monthDate.getMonth()]}
        </Text>
        {workouts.length === 0 ? (
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Нет тренировок за этот месяц
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typography.number, { color: colors.primary }]}>{workouts.length}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>тренировок</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typography.number, { color: colors.accent }]}>{Math.round(totalVolume)}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>кг объём</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typography.number, { color: colors.success }]}>{totalDuration}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>минут</Text>
            </View>
          </View>
        )}
      </Card>
    </FadeIn>
  );
};
