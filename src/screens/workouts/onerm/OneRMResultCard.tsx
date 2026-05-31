import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Estimate {
  name: string;
  value: number;
}

interface Props {
  avg: number;
  estimates: Estimate[];
  delay?: number;
}

export const OneRMResultCard: React.FC<Props> = ({ avg, estimates, delay = 80 }) => {
  const colors = useThemeColors();

  return (
    <FadeIn delay={delay}>
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>СРЕДНИЙ РАСЧЁТНЫЙ 1ПМ</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
            <Text style={[typography.number, { color: colors.primary, fontSize: 56 }]}>{avg}</Text>
            <Text style={[typography.h3, { color: colors.primary }]}>кг</Text>
          </View>
          <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>Усреднено по 4 формулам</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}>ПО ФОРМУЛАМ</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {estimates.map((e) => (
            <View key={e.name} style={[styles.chip, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
              <Text style={[typography.captionMedium, { color: colors.textTertiary }]}>{e.name}</Text>
              <Text style={[typography.bodyMedium, { color: colors.text }]}>{e.value} кг</Text>
            </View>
          ))}
        </View>
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  divider: { height: 1, marginVertical: spacing.md },
  chip: { flex: 1, minWidth: '45%', padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', gap: 4 },
});
