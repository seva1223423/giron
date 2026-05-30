import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useThemeColors, useAuthStore, useNutritionStore } from '../../../store';
import { useSleepStore } from '../../../store/useSleepStore';
import { localDateStr } from '../../../utils/date';
import { spacing } from '../../../theme/spacing';

/**
 * Horizontal context strip under the chat header — a glanceable row of the
 * user's live daily stats (КБЖУ / белок / вода / вес / сон). Pixel copy of
 * the Direction A `ai-chat-pro` handoff design's context strip: small surface
 * pills, stacked uppercase label + tabular-num value, status-coloured.
 *
 * The point: when the user asks "что мне поесть" or "сколько воды осталось",
 * the numbers are already on screen — the coach reads as data-aware.
 *
 * Subscribes to today's `dailyLog` slice + sleep entries directly so it
 * updates live when a chat command (`+250 воды`, `завтрак 500`) mutates the
 * nutrition store. Steps are intentionally omitted — the only steps source
 * (usePedometer) starts a 60s poll + pedometer subscription, too heavy for a
 * stat that's secondary here.
 */
export const ContextStrip: React.FC = () => {
  const colors = useThemeColors();
  const today = localDateStr(new Date());
  const weightKg = useAuthStore((s) => s.user?.weightKg);
  // Subscribe to today's log slice (re-renders when addWater/addMeal mutate it)
  // and to defaults (used when the user has no activity logged yet today).
  const dayLog = useNutritionStore((s) => s.dailyLog[today]);
  const defaults = useNutritionStore((s) => s.defaultTargets);
  const lastSleep = useSleepStore((s) => s.entries[0]);

  const meals = dayLog?.meals ?? [];
  const totalCalories = Math.round(meals.reduce((s, m) => s + (m.totalCalories ?? 0), 0));
  const totalProtein = Math.round(meals.reduce((s, m) => s + (m.totalProtein ?? 0), 0));
  const calTarget = dayLog?.targetCalories ?? defaults.calories;
  const protTarget = dayLog?.targetProtein ?? defaults.protein;
  const waterMl = dayLog?.waterMl ?? 0;
  const waterTarget = dayLog?.waterTargetMl ?? defaults.waterTargetMl;

  const stats: { label: string; value: string; color?: string }[] = [
    { label: 'КБЖУ', value: `${totalCalories} / ${calTarget}`, color: colors.primary },
    {
      label: 'Белок',
      // Sage once ≥87.5% of target (design "good" threshold), else gold.
      value: `${totalProtein} / ${protTarget} г`,
      color: totalProtein >= protTarget * 0.875 ? colors.success : colors.primary,
    },
    {
      label: 'Вода',
      value: `${(waterMl / 1000).toFixed(2)} л`,
      color: waterMl >= waterTarget ? colors.success : colors.primary,
    },
  ];
  if (weightKg) stats.push({ label: 'Вес', value: `${weightKg} кг` });
  if (lastSleep) {
    const h = Math.floor(lastSleep.durationHours);
    const m = Math.round((lastSleep.durationHours - h) * 60);
    stats.push({ label: 'Сон', value: `${h}ч ${String(m).padStart(2, '0')}м` });
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.wrap, { borderBottomColor: colors.border, backgroundColor: colors.background }]}
      contentContainerStyle={styles.row}
    >
      {stats.map((s) => (
        <View
          key={s.label}
          style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel={`${s.label}: ${s.value}`}
        >
          <Text style={[styles.label, { color: colors.textTertiary }]}>{s.label}</Text>
          <Text style={[styles.value, { color: s.color ?? colors.text }]}>{s.value}</Text>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  wrap: { flexGrow: 0, borderBottomWidth: 1 },
  row: { gap: 6, paddingHorizontal: spacing.md, paddingVertical: 10 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 62,
  },
  label: { fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
  value: { fontSize: 11, fontWeight: '600', marginTop: 1, fontVariant: ['tabular-nums'] },
});
