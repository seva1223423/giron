import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const PERCENTAGES = [100, 97, 95, 92, 90, 87, 85, 80, 75, 70, 65, 60, 55, 50];

interface Props {
  avg: number;
  delay?: number;
}

export const PercentageTableCard: React.FC<Props> = ({ avg, delay = 160 }) => {
  const { colors } = useThemeStore();

  const rows = PERCENTAGES.map((pct) => ({
    pct,
    weight: Math.round((avg * pct) / 100 * 2) / 2,
  }));

  return (
    <FadeIn delay={delay}>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Таблица процентов</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {rows.map(({ pct, weight }) => {
            const dotColor = pct >= 90 ? colors.error : pct >= 75 ? (colors.warning || colors.accent) : colors.success;
            return (
              <View key={pct} style={[styles.cell, { backgroundColor: colors.surface }]}>
                <Text style={[typography.captionMedium, { color: dotColor }]}>{pct}%</Text>
                <Text style={[typography.bodySemibold, { color: colors.text }]}>{weight} кг</Text>
              </View>
            );
          })}
        </View>
        <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.md }]}>
          90–100% — максимальная работа; 75–89% — силовая гипертрофия; ≤74% — объёмная работа
        </Text>
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  cell: { width: '22%', padding: spacing.sm, borderRadius: borderRadius.md, alignItems: 'center', gap: 2 },
});
