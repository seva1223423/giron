import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useThemeColors, useNutritionStore, useWorkoutStore } from '../../../store';
import { useSleepStore } from '../../../store/useSleepStore';
import { usePedometer } from '../../../hooks/usePedometer';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { localDateStr } from '../../../utils/date';

/**
 * Horizontal-scroll strip of 5 stat tiles shown directly below the
 * ChatHeader. Mirrors A_AI's "context AI sees" strip from the Direction A
 * design — gives the user a quick read on the live data the AI is
 * factoring into its replies (КБЖУ, белок, вода, сон, шаги).
 *
 * Each tile pulls from the live store so values stay in sync with the
 * nutrition / sleep / pedometer surfaces. Colors follow the design's
 * traffic-light convention: gold (primary) by default, sage (success)
 * once the user hits the daily goal, blue-info for the water tile to
 * keep the water motif consistent across the app.
 *
 * Sleep + steps gracefully degrade to "—" when no data is available
 * (new user, denied pedometer permission, etc.) so the strip never
 * shows zeros that might look like a "you failed your goal" signal.
 */
export const ChatContextStrip: React.FC = () => {
  const colors = useThemeColors();
  const today = localDateStr(new Date());

  // Nutrition slice — sum today's meals into calories + protein totals.
  // We deliberately recompute from items rather than reading meal-level
  // totals: server-confirmed meals already roll up totals, but
  // optimistic local edits to individual items may not have rolled up
  // yet, so summing leaves is the most consistent view.
  const dayLog = useNutritionStore((s) => s.getDayLog(today));
  let sumCal = 0;
  let sumProtein = 0;
  for (const meal of dayLog.meals) {
    for (const item of meal.items) {
      sumCal += item.calories;
      sumProtein += item.protein;
    }
  }

  // Sleep — newest entry first per the store's sort order; if missing
  // we show "—" instead of "0ч 0м" which would look like a real number.
  const sleepEntries = useSleepStore((s) => s.entries);
  const lastSleep = sleepEntries[0];
  const sleepLabel = lastSleep
    ? `${Math.floor(lastSleep.durationHours)}ч ${Math.round((lastSleep.durationHours % 1) * 60)}м`
    : '—';

  // Steps — usePedometer reports the live count; falls back to "—"
  // when hardware is missing or permission is denied so the tile
  // doesn't claim zero steps when we genuinely don't know.
  const pedo = usePedometer(7);
  const stepsLabel = pedo.isAvailable ? pedo.todaySteps.toLocaleString('ru-RU') : '—';

  const waterLiters = dayLog.waterMl / 1000;
  const waterTargetLiters = (dayLog.waterTargetMl ?? 2500) / 1000;
  const waterHit = dayLog.waterMl >= (dayLog.waterTargetMl ?? 2500);
  const proteinHit = sumProtein >= dayLog.targetProtein;
  const caloriesHit = sumCal >= dayLog.targetCalories;

  const tiles: Array<{ label: string; value: string; color: string }> = [
    {
      label: 'КБЖУ',
      value: `${Math.round(sumCal)}/${dayLog.targetCalories}`,
      color: caloriesHit ? colors.success : colors.primary,
    },
    {
      label: 'Белок',
      value: `${Math.round(sumProtein)}/${dayLog.targetProtein} г`,
      color: proteinHit ? colors.success : colors.primary,
    },
    {
      label: 'Вода',
      value: `${waterLiters.toFixed(1)}/${waterTargetLiters.toFixed(1)} л`,
      color: waterHit ? colors.success : colors.info,
    },
    {
      label: 'Сон',
      value: sleepLabel,
      color: lastSleep ? colors.text : colors.textTertiary,
    },
    {
      label: 'Шаги',
      value: stepsLabel,
      color: pedo.isAvailable ? colors.text : colors.textTertiary,
    },
  ];

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.surface, borderBottomColor: colors.border },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {tiles.map((t) => (
          <View
            key={t.label}
            style={[
              styles.tile,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                typography.metaLabel,
                { color: colors.textTertiary },
              ]}
              numberOfLines={1}
            >
              {t.label}
            </Text>
            <Text
              style={[typography.smallMedium, { color: t.color, marginTop: 2 }]}
              numberOfLines={1}
            >
              {t.value}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    gap: 6,
    paddingRight: spacing.sm,
  },
  tile: {
    minWidth: 80,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
});
