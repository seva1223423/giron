import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

export interface MacroResult {
  bmr: number;
  tdee: number;
  targetCal: number;
  protein: number;
  fats: number;
  carbs: number;
  proteinPerKg: number;
}

interface Props {
  result: MacroResult;
  delay?: number;
}

export const MacroResultCard: React.FC<Props> = ({ result, delay = 250 }) => {
  const colors = useThemeColors();

  return (
    <FadeIn delay={delay}>
      <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.primary + '10', borderLeftWidth: 4, borderLeftColor: colors.primary }}>
        <Text style={[typography.captionMedium, { color: colors.primary, marginBottom: spacing.md }]}>РЕЗУЛЬТАТ РАСЧЁТА</Text>

        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
          {[{ label: 'Базовый обмен', value: result.bmr }, { label: 'TDEE', value: result.tdee }].map(({ label, value }) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
              <Text style={[typography.numberSmall, { color: colors.text, marginTop: 4 }]}>{value}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>ккал</Text>
            </View>
          ))}
        </View>

        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>НОРМА ДЛЯ ТВОЕЙ ЦЕЛИ</Text>
        <View style={styles.grid}>
          <MacroTile value={result.targetCal} label="Калории" unit="ккал" color={colors.calories} textSecondary={colors.textSecondary} />
          <MacroTile value={result.protein} label="Белок" unit="г" color={colors.protein} extra={`${result.proteinPerKg}г/кг`} textSecondary={colors.textSecondary} />
          <MacroTile value={result.fats} label="Жиры" unit="г" color={colors.fats} textSecondary={colors.textSecondary} />
          <MacroTile value={result.carbs} label="Углеводы" unit="г" color={colors.carbs} textSecondary={colors.textSecondary} />
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.md }}>
          <Text style={[typography.small, { color: colors.textSecondary, lineHeight: 18 }]}>
            Белок {result.protein} г = {result.proteinPerKg} г на кг веса. Это оптимальный уровень для максимального синтеза мышечного белка при твоей цели.
          </Text>
        </View>
      </Card>
    </FadeIn>
  );
};

const MacroTile: React.FC<{ value: number; label: string; unit: string; color: string; extra?: string; textSecondary: string }> = ({ value, label, unit, color, extra, textSecondary }) => (
  <View style={[styles.tile, { backgroundColor: color + '15', borderWidth: 1, borderColor: color + '35' }]}>
    <Text style={[typography.h4, { color }]}>{value}</Text>
    <Text style={[typography.caption, { color }]}>{unit}</Text>
    <Text style={[typography.small, { color: textSecondary, marginTop: 2 }]}>{label}</Text>
    {extra && <Text style={[typography.small, { color: textSecondary, fontSize: 10 }]}>{extra}</Text>}
  </View>
);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flex: 1, minWidth: '45%', borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center' },
});
