import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useThemeStore, useNutritionStore, useAuthStore } from '../../../store';
import { Card, ProgressRing, MacroBar } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Props {
  selectedDate: string;
}

type RingMode = 'calories' | 'protein' | 'fats' | 'carbs';

const RING_MODES: { key: RingMode; label: string; unit: string }[] = [
  { key: 'calories', label: 'ккал', unit: '' },
  { key: 'protein', label: 'белки', unit: 'г' },
  { key: 'fats', label: 'жиры', unit: 'г' },
  { key: 'carbs', label: 'углев.', unit: 'г' },
];

const macroStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  segment: {
    height: 8,
  },
  label: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
});

export const DailyOverview: React.FC<Props> = ({ selectedDate }) => {
  const { colors } = useThemeStore();
  const { getDayLog } = useNutritionStore();
  const { user } = useAuthStore();
  const { width: screenWidth } = useWindowDimensions();
  const dayLog = getDayLog(selectedDate);
  const [ringMode, setRingMode] = useState<RingMode>('calories');

  const { totalCalories, totalProtein, totalFats, totalCarbs } = useMemo(() => ({
    totalCalories: dayLog.meals.reduce((s, m) => s + m.totalCalories, 0),
    totalProtein: dayLog.meals.reduce((s, m) => s + m.totalProtein, 0),
    totalFats: dayLog.meals.reduce((s, m) => s + m.totalFats, 0),
    totalCarbs: dayLog.meals.reduce((s, m) => s + m.totalCarbs, 0),
  }), [dayLog.meals]);

  const remaining = dayLog.targetCalories - totalCalories;
  const isGain = user?.goal === 'muscle_gain' || (user?.goal as string) === 'MUSCLE_GAIN' || user?.goal === 'strength' || (user?.goal as string) === 'STRENGTH';

  // Remaining macros
  const remainingProtein = Math.max(0, dayLog.targetProtein - totalProtein);
  const remainingFats = Math.max(0, (dayLog.targetFats || 70) - totalFats);
  const remainingCarbs = Math.max(0, (dayLog.targetCarbs || 250) - totalCarbs);
  const remainingCal = Math.max(0, remaining);

  // Ring display logic based on mode
  const ringData = useMemo(() => {
    switch (ringMode) {
      case 'protein':
        return { progress: dayLog.targetProtein > 0 ? totalProtein / dayLog.targetProtein : 0, value: `${totalProtein}`, label: 'белки, г', colorKey: colors.protein, current: totalProtein, target: dayLog.targetProtein };
      case 'fats':
        return { progress: (dayLog.targetFats || 70) > 0 ? totalFats / (dayLog.targetFats || 70) : 0, value: `${Math.round(totalFats)}`, label: 'жиры, г', colorKey: colors.fats, current: totalFats, target: dayLog.targetFats || 70 };
      case 'carbs':
        return { progress: (dayLog.targetCarbs || 250) > 0 ? totalCarbs / (dayLog.targetCarbs || 250) : 0, value: `${totalCarbs}`, label: 'углев., г', colorKey: colors.carbs, current: totalCarbs, target: dayLog.targetCarbs || 250 };
      default:
        return { progress: dayLog.targetCalories > 0 ? totalCalories / dayLog.targetCalories : 0, value: `${totalCalories}`, label: 'ккал', colorKey: colors.calories, current: totalCalories, target: dayLog.targetCalories };
    }
  }, [ringMode, totalCalories, totalProtein, totalFats, totalCarbs, dayLog, colors]);

  // Ring color based on progress percentage
  const getRingColor = (progress: number, defaultColor: string) => {
    if (progress >= 1.1) return colors.error;
    if (progress >= 0.8) return colors.success;
    return defaultColor;
  };

  const handleRingTap = () => {
    const idx = RING_MODES.findIndex((m) => m.key === ringMode);
    setRingMode(RING_MODES[(idx + 1) % RING_MODES.length].key);
  };

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={handleRingTap} activeOpacity={0.7}>
          <ProgressRing
            progress={ringData.progress}
            size={screenWidth < 340 ? 84 : 110}
            strokeWidth={10}
            color={getRingColor(ringData.progress, ringData.colorKey)}
            value={ringData.value}
            label={ringData.label}
          />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.xl }}>
          <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
            {remaining > 0 ? (
              <>Осталось: <Text style={[typography.bodySemibold, { color: colors.success }]}>{remaining} ккал</Text></>
            ) : (
              <>{isGain ? 'Профицит: ' : 'Превышение: '}<Text style={[typography.bodySemibold, { color: isGain ? colors.success : colors.error }]}>+{Math.abs(remaining)} ккал</Text></>
            )}
          </Text>
          <MacroBar label="Белки" current={totalProtein} target={dayLog.targetProtein} color={colors.protein} />
          <MacroBar label="Жиры" current={totalFats} target={dayLog.targetFats} color={colors.fats} />
          <MacroBar label="Углеводы" current={totalCarbs} target={dayLog.targetCarbs} color={colors.carbs} />
        </View>
      </View>

      {/* Remaining macros summary */}
      {dayLog.targetCalories > 0 && (
        <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.sm, textAlign: 'center' }]} numberOfLines={3}>
          {`\u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C: ${remainingCal} \u043A\u043A\u0430\u043B \u00B7 ${remainingProtein}\u0433 \u0431\u0435\u043B\u043A\u0430 \u00B7 ${remainingFats}\u0433 \u0436\u0438\u0440\u043E\u0432 \u00B7 ${remainingCarbs}\u0433 \u0443\u0433\u043B\u0435\u0432\u043E\u0434\u043E\u0432`}
        </Text>
      )}

      {/* Macro calorie breakdown bar */}
      {(() => {
        const proteinCal = totalProtein * 4;
        const fatCal = totalFats * 9;
        const carbCal = totalCarbs * 4;
        const totalMacroCal = proteinCal + fatCal + carbCal;
        if (totalMacroCal <= 0) return null;
        const pPct = Math.round((proteinCal / totalMacroCal) * 100);
        const fPct = Math.round((fatCal / totalMacroCal) * 100);
        const cPct = 100 - pPct - fPct;
        return (
          <View style={{ marginTop: spacing.md }}>
            <View style={macroStyles.bar}>
              <View style={[macroStyles.segment, { flex: proteinCal, backgroundColor: colors.protein, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }]} />
              <View style={[macroStyles.segment, { flex: fatCal, backgroundColor: colors.fats }]} />
              <View style={[macroStyles.segment, { flex: carbCal, backgroundColor: colors.carbs, borderTopRightRadius: 4, borderBottomRightRadius: 4 }]} />
            </View>
            <Text style={[macroStyles.label, { color: colors.textSecondary }]}>
              {`\u0411 ${pPct}% \u2022 \u0416 ${fPct}% \u2022 \u0423 ${cPct}%`}
            </Text>
          </View>
        );
      })()}

      {/* Ring mode indicator dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.sm, gap: spacing.xs }}>
        {RING_MODES.map((mode) => (
          <View key={mode.key} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ringMode === mode.key ? colors.primary : colors.border }} />
        ))}
      </View>
    </Card>
  );
};
