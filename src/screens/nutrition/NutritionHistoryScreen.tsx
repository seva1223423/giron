import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useNutritionStore } from '../../store';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { CalorieBarChart, WeeklyInsightsCard, NutritionDayCard, MacroTrendsChart } from './history';
import type { WeeklyInsights } from './history';

const PERIODS = [
  { label: '7 дн', days: 7 },
  { label: '14 дн', days: 14 },
  { label: '30 дн', days: 30 },
  { label: '90 дн', days: 90 },
];

function getPastDates(days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  });
}

export const NutritionHistoryScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { getDayLog } = useNutritionStore();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [period, setPeriod] = useState(30);

  const logsWithData = useMemo(() =>
    getPastDates(period).map((date) => ({ date, log: getDayLog(date) })).filter(({ log }) => log.meals.length > 0 || log.waterMl > 0),
    [getDayLog, period]
  );

  // Chart shows up to 30 days (capped for readability)
  const chartDays = Math.min(period, 30);

  const chartData = useMemo(() =>
    getPastDates(chartDays).reverse().map((date) => {
      const log = getDayLog(date);
      const calories = log.meals.reduce((s, m) => s + m.totalCalories, 0);
      return { label: new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' }), calories, target: log.targetCalories };
    }),
    [getDayLog, chartDays]
  );

  const totalCalAvg = useMemo(() => {
    const withData = chartData.filter((d) => d.calories > 0);
    return withData.length === 0 ? 0 : Math.round(withData.reduce((s, d) => s + d.calories, 0) / withData.length);
  }, [chartData]);

  const daysTracked = chartData.filter((d) => d.calories > 0).length;

  const macroChartData = useMemo(() =>
    getPastDates(chartDays).reverse().map((date) => {
      const log = getDayLog(date);
      return {
        label: new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' }),
        protein: Math.round(log.meals.reduce((s, m) => s + m.totalProtein, 0)),
        fats: Math.round(log.meals.reduce((s, m) => s + m.totalFats, 0)),
        carbs: Math.round(log.meals.reduce((s, m) => s + m.totalCarbs, 0)),
      };
    }),
    [getDayLog, chartDays]
  );

  const macroTargets = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const log = getDayLog(today);
    return { protein: log.targetProtein, fats: log.targetFats, carbs: log.targetCarbs };
  }, [getDayLog]);

  const hasMacroData = macroChartData.some((d) => d.protein > 0 || d.fats > 0 || d.carbs > 0);

  const weeklyInsights = useMemo((): WeeklyInsights | null => {
    const week = getPastDates(7).map((date) => {
      const log = getDayLog(date);
      const cal = log.meals.reduce((s, m) => s + m.totalCalories, 0);
      const prot = log.meals.reduce((s, m) => s + m.totalProtein, 0);
      const fats = log.meals.reduce((s, m) => s + m.totalFats, 0);
      const carbs = log.meals.reduce((s, m) => s + m.totalCarbs, 0);
      return { cal, prot, fats, carbs, targetCal: log.targetCalories, targetProt: log.targetProtein, tracked: cal > 0 };
    });
    const tracked = week.filter((d) => d.tracked);
    if (tracked.length === 0) return null;
    const n = tracked.length;
    const avgCal = Math.round(tracked.reduce((s, d) => s + d.cal, 0) / n);
    const avgProt = Math.round(tracked.reduce((s, d) => s + d.prot, 0) / n);
    const avgFats = Math.round(tracked.reduce((s, d) => s + d.fats, 0) / n);
    const avgCarbs = Math.round(tracked.reduce((s, d) => s + d.carbs, 0) / n);
    const targetCal = tracked[0].targetCal;
    const targetProt = tracked[0].targetProt;
    const calRatio = targetCal > 0 ? avgCal / targetCal : 1;
    const protRatio = targetProt > 0 ? avgProt / targetProt : 1;
    const calColor = calRatio < 0.85 ? 'info' : calRatio > 1.15 ? 'error' : 'success';
    const calVerdict = calRatio < 0.85 ? 'Дефицит калорий' : calRatio > 1.15 ? 'Профицит калорий' : 'Калории в норме';
    const protColor = protRatio < 0.75 ? 'error' : protRatio < 0.9 ? 'accent' : 'success';
    const protVerdict = protRatio < 0.75 ? '⚠️ Мало белка' : protRatio < 0.9 ? 'Белка чуть меньше нормы' : 'Белок в норме ✓';
    const tip = protRatio < 0.75 ? 'Добавь белок к каждому приёму: яйца, творог, мясо, рыба.'
      : calRatio < 0.85 ? 'Небольшой дефицит — хорошо для похудения. Следи, чтобы хватало белка.'
      : calRatio > 1.15 ? 'Небольшой профицит — хорошо для набора массы. Контролируй жиры.'
      : 'Питание сбалансировано. Продолжай в том же духе!';
    return { avgCal, avgProt, avgFats, avgCarbs, targetCal, targetProt, calVerdict, calColor, protVerdict, protColor, tip, consistency: Math.round((n / 7) * 100), daysTracked: n };
  }, [getDayLog]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: safeTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>История питания</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.periodRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {PERIODS.map(({ label, days }) => (
          <TouchableOpacity
            key={days}
            onPress={() => { haptic.selection(); setPeriod(days); }}
            style={[styles.periodChip, { backgroundColor: period === days ? colors.primary : colors.background, borderColor: period === days ? colors.primary : colors.border }]}
          >
            <Text style={[typography.captionMedium, { color: period === days ? '#FFF' : colors.textSecondary }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {logsWithData.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 56, marginBottom: spacing.lg }}>🍽</Text>
          <Text style={[typography.h4, { color: colors.text }]}>Нет данных</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
            Начни отслеживать питание, и история появится здесь
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* 14-day calorie chart */}
          <FadeIn delay={0}>
            <Card style={{ marginBottom: spacing.xl }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm }}>
                <View>
                  <Text style={[typography.h4, { color: colors.text }]}>Калории за {chartDays} дней</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>Отслежено {daysTracked} из {chartDays} дней</Text>
                </View>
                {totalCalAvg > 0 && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[typography.number, { color: colors.primary, fontSize: 20 }]}>{totalCalAvg}</Text>
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>ср. ккал/день</Text>
                  </View>
                )}
              </View>
              <CalorieBarChart data={chartData} colors={colors} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
                {[{ color: colors.accent + '80', label: 'Цель', h: 3, w: 12 }, { color: colors.success, label: 'В норме', h: 10, w: 10 }, { color: colors.error, label: 'Перебор', h: 10, w: 10 }].map(({ color, label, h, w }) => (
                  <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: w, height: h, backgroundColor: color, borderRadius: 1 }} />
                    <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 10 }]}>{label}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </FadeIn>

          {hasMacroData && (
            <FadeIn delay={50}>
              <Card style={{ marginBottom: spacing.xl }}>
                <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Макросы за {chartDays} дней</Text>
                <MacroTrendsChart
                  data={macroChartData}
                  targetProtein={macroTargets.protein}
                  targetFats={macroTargets.fats}
                  targetCarbs={macroTargets.carbs}
                  colors={colors}
                />
              </Card>
            </FadeIn>
          )}

          {weeklyInsights && <WeeklyInsightsCard insights={weeklyInsights} delay={80} />}

          {logsWithData.map(({ date, log }, i) => (
            <NutritionDayCard
              key={date}
              date={date}
              log={log}
              isExpanded={expandedDate === date}
              onPress={() => { haptic.selection(); setExpandedDate(expandedDate === date ? null : date); }}
              animDelay={i * 30}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  periodRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  periodChip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: 16, borderWidth: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
