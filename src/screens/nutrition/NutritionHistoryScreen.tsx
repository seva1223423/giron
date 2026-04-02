import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useNutritionStore } from '../../store';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

// ─── Micro calorie bar chart for last N days ────────────────────────────────
type CalorieBarChartProps = {
  data: { label: string; calories: number; target: number }[];
  colors: any;
};
const CalorieBarChart: React.FC<CalorieBarChartProps> = ({ data, colors }) => {
  const maxCal = Math.max(...data.map((d) => d.calories), ...data.map((d) => d.target), 1);
  const chartH = 80;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: chartH + 24, gap: 4, paddingTop: 4 }}>
      {data.map((d, i) => {
        const barH = Math.max(4, (d.calories / maxCal) * chartH);
        const targetH = (d.target / maxCal) * chartH;
        const over = d.target > 0 && d.calories > d.target * 1.1;
        const good = d.target > 0 && d.calories >= d.target * 0.85;
        const barColor = d.calories === 0 ? colors.border : over ? colors.error : good ? colors.success : colors.primary;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', height: chartH + 24, justifyContent: 'flex-end' }}>
            <View style={{ width: '100%', height: chartH, justifyContent: 'flex-end', position: 'relative' }}>
              {/* Target line */}
              {d.target > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: targetH,
                    left: 0,
                    right: 0,
                    height: 1,
                    backgroundColor: colors.accent + '80',
                  }}
                />
              )}
              <View style={{ width: '100%', height: barH, borderRadius: 3, backgroundColor: barColor, opacity: d.calories === 0 ? 0.25 : 0.9 }} />
            </View>
            <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 9, marginTop: 4, textAlign: 'center' }]} numberOfLines={1}>
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

function getPastDates(days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterday) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const NutritionHistoryScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { getDayLog } = useNutritionStore();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const logsWithData = useMemo(() =>
    getPastDates(30)
      .map((date) => ({ date, log: getDayLog(date) }))
      .filter(({ log }) => log.meals.length > 0 || log.waterMl > 0),
    [getDayLog]
  );

  // Last 14 days for the chart (oldest → newest)
  const chartData = useMemo(() => {
    return getPastDates(14)
      .reverse()
      .map((date) => {
        const log = getDayLog(date);
        const calories = log.meals.reduce((s, m) => s + m.totalCalories, 0);
        const d = new Date(date);
        const label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' });
        return { label, calories, target: log.targetCalories };
      });
  }, [getDayLog]);

  const totalCalAvg = useMemo(() => {
    const withData = chartData.filter((d) => d.calories > 0);
    if (withData.length === 0) return 0;
    return Math.round(withData.reduce((s, d) => s + d.calories, 0) / withData.length);
  }, [chartData]);

  const daysTracked = chartData.filter((d) => d.calories > 0).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>История питания</Text>
        <View style={{ width: 24 }} />
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
                  <Text style={[typography.h4, { color: colors.text }]}>Калории за 2 недели</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                    Отслежено {daysTracked} из 14 дней
                  </Text>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 12, height: 3, backgroundColor: colors.accent + '80', borderRadius: 1 }} />
                  <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 10 }]}>Цель</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.success }} />
                  <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 10 }]}>В норме</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.error }} />
                  <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 10 }]}>Перебор</Text>
                </View>
              </View>
            </Card>
          </FadeIn>

          {logsWithData.map(({ date, log }, i) => {
            const totalCalories = log.meals.reduce((s, m) => s + m.totalCalories, 0);
            const totalProtein = log.meals.reduce((s, m) => s + m.totalProtein, 0);
            const totalFats = log.meals.reduce((s, m) => s + m.totalFats, 0);
            const totalCarbs = log.meals.reduce((s, m) => s + m.totalCarbs, 0);
            const calorieRatio = log.targetCalories > 0 ? totalCalories / log.targetCalories : 0;
            const isExpanded = expandedDate === date;

            return (
              <FadeIn key={date} delay={i * 30}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => { Haptics.selectionAsync(); setExpandedDate(isExpanded ? null : date); }}
                >
                  <Card style={{ marginBottom: spacing.sm }}>
                    <View style={styles.dayHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodySemibold, { color: colors.text }]}>
                          {formatDate(date)}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                          {log.meals.length} приёмов пищи
                          {log.waterMl > 0 ? ` • 💧 ${log.waterMl} мл` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[typography.numberSmall, { color: calorieRatio > 1.1 ? colors.error : calorieRatio > 0.9 ? colors.success : colors.primary, fontSize: 20 }]}>
                          {totalCalories}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                          ккал {isExpanded ? '▲' : '▼'}
                        </Text>
                      </View>
                    </View>

                    {/* Macro bar */}
                    <View style={{ marginTop: spacing.sm }}>
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface, flexDirection: 'row', overflow: 'hidden', gap: 1 }}>
                        {totalCalories > 0 && [
                          { calories: totalProtein * 4, color: colors.protein },
                          { calories: totalFats * 9, color: colors.fats },
                          { calories: totalCarbs * 4, color: colors.carbs },
                        ].map(({ calories, color }, idx) => (
                          <View
                            key={idx}
                            style={{
                              height: '100%',
                              width: `${(calories / totalCalories) * 100}%`,
                              backgroundColor: color,
                            }}
                          />
                        ))}
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                        <Text style={[typography.caption, { color: colors.protein, fontSize: 10 }]}>Б: {Math.round(totalProtein)}г</Text>
                        <Text style={[typography.caption, { color: colors.fats, fontSize: 10 }]}>Ж: {Math.round(totalFats)}г</Text>
                        <Text style={[typography.caption, { color: colors.carbs, fontSize: 10 }]}>У: {Math.round(totalCarbs)}г</Text>
                      </View>
                    </View>

                    {/* Expanded: meal list */}
                    {isExpanded && log.meals.length > 0 && (
                      <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
                        {log.meals.map((meal, mi) => (
                          <View
                            key={meal.id}
                            style={[
                              { paddingVertical: spacing.xs, flexDirection: 'row', alignItems: 'center' },
                              mi < log.meals.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                            ]}
                          >
                            <Text style={[typography.small, { color: colors.textSecondary, width: 60 }]}>
                              {meal.type === 'breakfast' ? 'Завтрак' : meal.type === 'lunch' ? 'Обед' : meal.type === 'dinner' ? 'Ужин' : 'Перекус'}
                            </Text>
                            <Text style={[typography.small, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                              {meal.items.map((i) => i.name).join(', ')}
                            </Text>
                            <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
                              {meal.totalCalories} ккал
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </Card>
                </TouchableOpacity>
              </FadeIn>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.huge,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
});
