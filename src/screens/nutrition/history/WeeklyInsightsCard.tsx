import React from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

export interface WeeklyInsights {
  avgCal: number;
  avgProt: number;
  avgFats: number;
  avgCarbs: number;
  targetCal: number;
  targetProt: number;
  calVerdict: string;
  calColor: string;
  protVerdict: string;
  protColor: string;
  tip: string;
  consistency: number;
  daysTracked: number;
}

interface Props {
  insights: WeeklyInsights;
  delay?: number;
}

export const WeeklyInsightsCard: React.FC<Props> = ({ insights, delay = 80 }) => {
  const colors = useThemeColors();

  return (
    <FadeIn delay={delay}>
      <Card style={{ marginBottom: spacing.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md }}>
          <View>
            <Text style={[typography.h4, { color: colors.text }]}>Итоги недели</Text>
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={2}>
              Среднее за {insights.daysTracked} из 7 дней · Отслеженность {insights.consistency}%
            </Text>
          </View>
          <View style={[{ paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.sm, borderWidth: 1 }, { backgroundColor: (colors as any)[insights.calColor] + '20', borderColor: (colors as any)[insights.calColor] + '40' }]}>
            <Text style={[typography.caption, { color: (colors as any)[insights.calColor], fontWeight: '700' }]}>{insights.calVerdict}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
          {[
            { label: 'Ккал', value: insights.avgCal, target: insights.targetCal, color: colors.primary },
            { label: 'Белки', value: insights.avgProt, target: insights.targetProt, color: colors.protein },
            { label: 'Жиры', value: insights.avgFats, target: undefined as number | undefined, color: colors.fats },
            { label: 'Углев.', value: insights.avgCarbs, target: undefined as number | undefined, color: colors.carbs },
          ].map(({ label, value, target, color }) => (
            <View key={label} style={[{ flex: 1, alignItems: 'center', padding: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1 }, { backgroundColor: color + '12', borderColor: color + '35' }]}>
              <Text style={[typography.number, { color, fontSize: 18, lineHeight: 22 }]}>{value}</Text>
              <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 9, marginTop: 1 }]}>{label}</Text>
              {target != null && target > 0 && (
                <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 9 }]}>/ {target}</Text>
              )}
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.surface }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary + '18', borderWidth: 1.5, borderColor: colors.primary + '40', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>i</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.captionMedium, { color: (colors as any)[insights.protColor], marginBottom: 2 }]}>{insights.protVerdict}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>{insights.tip}</Text>
          </View>
        </View>
      </Card>
    </FadeIn>
  );
};
