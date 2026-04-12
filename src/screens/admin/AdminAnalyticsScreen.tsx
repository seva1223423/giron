import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity, Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { adminService } from '../../services/adminService';
import type { AdminAnalytics } from '../../types';

const PERIODS = [
  { label: '7 дней', value: 7 },
  { label: '30 дней', value: 30 },
  { label: '90 дней', value: 90 },
];

function formatDate(dateStr: string, short = false): string {
  const d = new Date(dateStr);
  if (short) return `${d.getDate()}.${d.getMonth() + 1}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function MiniBarChart({
  data, color, label,
}: {
  data: number[];
  color: string;
  label: string;
}) {
  const max = Math.max(...data, 1);
  const CHART_H = 48;
  return (
    <View>
      <Text style={[chartStyles.label, { color }]}>{label}</Text>
      <View style={chartStyles.bars}>
        {data.map((v, i) => {
          const h = Math.max(3, Math.round((v / max) * CHART_H));
          return (
            <View key={i} style={chartStyles.barCol}>
              <View style={[chartStyles.bar, { height: h, backgroundColor: v > 0 ? color : '#2C2C2E' }]} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
        <Text style={chartStyles.axis}>0</Text>
        <Text style={chartStyles.axis}>max {max}</Text>
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 52, gap: 2 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 52 },
  bar: { width: '80%', borderRadius: 2 },
  axis: { fontSize: 9, color: '#4B5563' },
});

function FunnelBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={styles.funnelLabel}>{label}</Text>
        <Text style={[styles.funnelValue, { color }]}>{value} <Text style={styles.funnelPct}>({pct}%)</Text></Text>
      </View>
      <View style={styles.funnelTrack}>
        <View style={[styles.funnelFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export default function AdminAnalyticsScreen() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState(30);
  const [exporting, setExporting] = useState(false);
  const [cohorts, setCohorts] = useState<Array<{ week: string; signups: number; activeThisWeek: number; retentionPct: number }>>([]);
  const [subTimeline, setSubTimeline] = useState<{ timeline: Array<{ date: string; pro: number; trainer: number; club: number; total: number }>; totalNew: number } | null>(null);

  const exportCSV = useCallback(async () => {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) { Alert.alert('Недоступно', 'Функция экспорта недоступна на этом устройстве'); return; }
    setExporting(true);
    try {
      const csv = await adminService.exportAnalyticsCSV(period);
      const fileName = `analytics_${period}d_${new Date().toISOString().split('T')[0]}.csv`;
      const path = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Экспорт аналитики' });
    } catch { Alert.alert('Ошибка', 'Не удалось экспортировать аналитику'); }
    finally { setExporting(false); }
  }, [period]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [res, cohortsRes, subRes] = await Promise.all([
        adminService.getAnalytics(period),
        adminService.getCohorts(),
        adminService.getSubscriptionTimeline(period),
      ]);
      setData(res);
      setCohorts(cohortsRes);
      setSubTimeline(subRes);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [period]);

  if (loading) return <ActivityIndicator style={styles.center} color="#6366F1" size="large" />;
  if (!data) return null;

  const signups = data.timeline.map((t) => t.signups);
  const workouts = data.timeline.map((t) => t.workouts);
  const ai = data.timeline.map((t) => t.ai);
  const cardio = data.timeline.map((t) => t.cardio);

  const totalSignups = signups.reduce((a, b) => a + b, 0);
  const totalWorkoutsInPeriod = workouts.reduce((a, b) => a + b, 0);
  const totalAiInPeriod = ai.reduce((a, b) => a + b, 0);
  const totalCardioInPeriod = cardio.reduce((a, b) => a + b, 0);
  const avgSignupsPerDay = data.period > 0 ? (totalSignups / data.period).toFixed(1) : '0';
  const avgWorkoutsPerDay = data.period > 0 ? (totalWorkoutsInPeriod / data.period).toFixed(1) : '0';

  const pct = (cur: number, prev: number) => {
    if (prev === 0) return cur > 0 ? '+∞%' : '—';
    const diff = Math.round(((cur - prev) / prev) * 100);
    return diff >= 0 ? `+${diff}%` : `${diff}%`;
  };
  const pctColor = (cur: number, prev: number) => {
    if (prev === 0) return '#6B7280';
    return cur >= prev ? '#10B981' : '#EF4444';
  };

  // Auto-generated insights
  const insights: Array<{ icon: string; text: string; color: string }> = [];
  if (data.previous) {
    const wDiff = data.previous.workouts > 0 ? Math.round(((totalWorkoutsInPeriod - data.previous.workouts) / data.previous.workouts) * 100) : 0;
    if (Math.abs(wDiff) >= 10) insights.push({ icon: wDiff > 0 ? '📈' : '📉', text: `Тренировки ${wDiff > 0 ? 'выросли' : 'упали'} на ${Math.abs(wDiff)}% vs предыдущий период`, color: wDiff > 0 ? '#10B981' : '#EF4444' });
    const sDiff = data.previous.signups > 0 ? Math.round(((totalSignups - data.previous.signups) / data.previous.signups) * 100) : 0;
    if (Math.abs(sDiff) >= 15) insights.push({ icon: sDiff > 0 ? '🚀' : '⚠️', text: `Регистрации ${sDiff > 0 ? 'выросли' : 'упали'} на ${Math.abs(sDiff)}%`, color: sDiff > 0 ? '#10B981' : '#F59E0B' });
    const aiDiff = data.previous.ai > 0 ? Math.round(((totalAiInPeriod - data.previous.ai) / data.previous.ai) * 100) : 0;
    if (Math.abs(aiDiff) >= 20) insights.push({ icon: aiDiff > 0 ? '🤖' : '💤', text: `ИИ-активность ${aiDiff > 0 ? 'выросла' : 'упала'} на ${Math.abs(aiDiff)}%`, color: aiDiff > 0 ? '#8B5CF6' : '#6B7280' });
  }
  // Peak day
  const peakWorkoutIdx = workouts.indexOf(Math.max(...workouts));
  if (Math.max(...workouts) > 0 && data.timeline[peakWorkoutIdx]) {
    const peakDate = new Date(data.timeline[peakWorkoutIdx].date).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
    insights.push({ icon: '🏆', text: `Пик тренировок: ${Math.max(...workouts)} за ${peakDate}`, color: '#F59E0B' });
  }
  // Zero workout days
  const zeroDays = workouts.filter((v) => v === 0).length;
  if (zeroDays > data.period * 0.3) insights.push({ icon: '😴', text: `${zeroDays} дней без тренировок (${Math.round(zeroDays / data.period * 100)}% периода)`, color: '#6B7280' });
  if (data.funnel.conversionRate < 5) insights.push({ icon: '💰', text: `Конверсия в платных всего ${data.funnel.conversionRate}% — возможен рост`, color: '#F59E0B' });
  if (data.funnel.retentionRate > 30) insights.push({ icon: '⭐', text: `Ретеншн ${data.funnel.retentionRate}% — хороший показатель`, color: '#10B981' });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#6366F1" />}
    >
      {/* Period selector */}
      <View style={[styles.periodRow, { justifyContent: 'space-between' }]}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[styles.periodBtn, period === p.value && styles.periodBtnActive]}
              onPress={() => setPeriod(p.value)}
            >
              <Text style={[styles.periodText, period === p.value && styles.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.periodBtn} onPress={exportCSV} disabled={exporting}>
          {exporting
            ? <ActivityIndicator size="small" color="#6366F1" />
            : <Text style={[styles.periodText, { color: '#6366F1' }]}>CSV</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Insights */}
      {insights.length > 0 && (
        <View style={styles.insightsCard}>
          <Text style={styles.insightsTitle}>Ключевые наблюдения</Text>
          {insights.map((ins, i) => (
            <View key={i} style={styles.insightRow}>
              <Text style={{ fontSize: 16 }}>{ins.icon}</Text>
              <Text style={[styles.insightText, { color: ins.color }]}>{ins.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNum, { color: '#6366F1' }]}>{totalSignups}</Text>
          <Text style={styles.summaryLabel}>Регистраций</Text>
          {data.previous && (
            <Text style={[styles.deltaText, { color: pctColor(totalSignups, data.previous.signups) }]}>
              {pct(totalSignups, data.previous.signups)}
            </Text>
          )}
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNum, { color: '#F59E0B' }]}>{totalWorkoutsInPeriod}</Text>
          <Text style={styles.summaryLabel}>Тренировок</Text>
          {data.previous && (
            <Text style={[styles.deltaText, { color: pctColor(totalWorkoutsInPeriod, data.previous.workouts) }]}>
              {pct(totalWorkoutsInPeriod, data.previous.workouts)}
            </Text>
          )}
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNum, { color: '#8B5CF6' }]}>{totalAiInPeriod}</Text>
          <Text style={styles.summaryLabel}>ИИ запросов</Text>
          {data.previous && (
            <Text style={[styles.deltaText, { color: pctColor(totalAiInPeriod, data.previous.ai) }]}>
              {pct(totalAiInPeriod, data.previous.ai)}
            </Text>
          )}
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNum, { color: '#10B981' }]}>{totalCardioInPeriod}</Text>
          <Text style={styles.summaryLabel}>Кардио</Text>
          {data.previous && (
            <Text style={[styles.deltaText, { color: pctColor(totalCardioInPeriod, data.previous.cardio) }]}>
              {pct(totalCardioInPeriod, data.previous.cardio)}
            </Text>
          )}
        </View>
      </View>

      {/* Average per day */}
      <View style={[styles.summaryRow, { marginBottom: 12 }]}>
        <View style={[styles.summaryCard, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          <Text style={[styles.summaryNum, { fontSize: 18, color: '#6366F1' }]}>{avgSignupsPerDay}</Text>
          <View>
            <Text style={styles.summaryLabel}>регистраций</Text>
            <Text style={styles.summarySub}>в день</Text>
          </View>
        </View>
        <View style={[styles.summaryCard, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          <Text style={[styles.summaryNum, { fontSize: 18, color: '#F59E0B' }]}>{avgWorkoutsPerDay}</Text>
          <View>
            <Text style={styles.summaryLabel}>тренировок</Text>
            <Text style={styles.summarySub}>в день</Text>
          </View>
        </View>
      </View>

      {/* Charts */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Регистрации по дням</Text>
        <MiniBarChart data={signups} color="#6366F1" label="новых пользователей" />
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Активность тренировок</Text>
        <MiniBarChart data={workouts} color="#F59E0B" label="завершённых тренировок" />
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>ИИ-запросы</Text>
        <MiniBarChart data={ai} color="#8B5CF6" label="сообщений пользователей" />
      </View>

      {cardio.some((v) => v > 0) && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Кардио-сессии</Text>
          <MiniBarChart data={cardio} color="#10B981" label="сессий" />
        </View>
      )}

      {/* Conversion funnel */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Воронка конверсии</Text>
        <FunnelBar
          label="Всего пользователей"
          value={data.funnel.totalUsers}
          total={data.funnel.totalUsers}
          color="#6366F1"
        />
        <FunnelBar
          label="Платная подписка"
          value={data.funnel.paidUsers}
          total={data.funnel.totalUsers}
          color="#F59E0B"
        />
        <FunnelBar
          label="Активны последние 7 дн."
          value={data.funnel.activeLastWeek}
          total={data.funnel.totalUsers}
          color="#10B981"
        />
        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiNum, { color: '#F59E0B' }]}>{data.funnel.conversionRate}%</Text>
            <Text style={styles.kpiLabel}>Конверсия</Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiNum, { color: '#10B981' }]}>{data.funnel.retentionRate}%</Text>
            <Text style={styles.kpiLabel}>Ретеншн (7д)</Text>
          </View>
        </View>
      </View>

      {/* Onboarding funnel */}
      {data.onboardingFunnel && data.onboardingFunnel.signups > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Онбординг (новые за 30 дней)</Text>
          <Text style={styles.chartSub}>Как далеко прошли новые пользователи</Text>
          {[
            { label: 'Зарегистрировались', value: data.onboardingFunnel.signups, color: '#6366F1' },
            { label: 'Заполнили цель', value: data.onboardingFunnel.profiled, color: '#8B5CF6' },
            { label: 'Первая тренировка', value: data.onboardingFunnel.firstWorkout, color: '#F59E0B' },
            { label: 'Оформили подписку', value: data.onboardingFunnel.converted, color: '#10B981' },
          ].map((step) => {
            const pct = data.onboardingFunnel!.signups > 0
              ? Math.round((step.value / data.onboardingFunnel!.signups) * 100)
              : 0;
            return (
              <View key={step.label} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Text style={styles.funnelLabel}>{step.label}</Text>
                  <Text style={[styles.funnelValue, { color: step.color }]}>
                    {step.value} <Text style={styles.funnelPct}>({pct}%)</Text>
                  </Text>
                </View>
                <View style={styles.funnelTrack}>
                  <View style={[styles.funnelFill, { width: `${pct}%` as any, backgroundColor: step.color }]} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Top programs */}
      {data.topPrograms && data.topPrograms.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Топ программ тренировок</Text>
          {data.topPrograms.map((p, i) => (
            <View key={p.id} style={styles.tableRow}>
              <Text style={[styles.tableCell, { color: '#9CA3AF', flex: 0.3 }]}>{i + 1}</Text>
              <Text style={[styles.tableCell, { flex: 3, color: '#FFFFFF', textAlign: 'left' }]} numberOfLines={1}>{p.name}</Text>
              <Text style={[styles.tableCell, { color: '#6B7280', flex: 1.5, textAlign: 'left' }]} numberOfLines={1}>{p.type}</Text>
              <Text style={[styles.tableCell, { color: '#F59E0B', fontWeight: '700' }]}>{p.count}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Top exercises */}
      {data.topExercises && data.topExercises.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Топ упражнений ({data.period} дней)</Text>
          {data.topExercises.map((e, i) => {
            const maxCount = data.topExercises![0].count;
            const pctWidth = Math.round((e.count / maxCount) * 100);
            return (
              <View key={e.id} style={styles.exerciseRow}>
                <Text style={styles.exerciseRank}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <Text style={styles.exerciseName} numberOfLines={1}>{e.name}</Text>
                    <Text style={styles.exerciseCount}>{e.count}</Text>
                  </View>
                  <View style={styles.exerciseBarTrack}>
                    <View style={[styles.exerciseBarFill, { width: `${pctWidth}%` as any }]} />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* New subscriptions timeline */}
      {subTimeline && subTimeline.timeline.some((t) => t.total > 0) && (
        <View style={styles.chartCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={styles.chartTitle}>Новые подписки</Text>
            <Text style={[styles.chartSub, { color: '#10B981', fontWeight: '700' }]}>+{subTimeline.totalNew} за период</Text>
          </View>
          <Text style={styles.chartSub}>Ежедневные новые оплаченные подписки по планам</Text>
          <MiniBarChart data={subTimeline.timeline.map((t) => t.total)} color="#10B981" label="всего новых" />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            {(['pro', 'trainer', 'club'] as const).map((plan) => {
              const total = subTimeline.timeline.reduce((sum, t) => sum + t[plan], 0);
              const PLAN_COLOR = { pro: '#6366F1', trainer: '#F59E0B', club: '#10B981' };
              if (total === 0) return null;
              return (
                <View key={plan} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: PLAN_COLOR[plan] }} />
                  <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{plan.toUpperCase()}: {total}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Cohort retention */}
      {cohorts.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Когортный ретеншн (8 недель)</Text>
          <Text style={styles.chartSub}>% зарег. на неделе, кто тренировался последние 7 дней</Text>
          {cohorts.map((c, i) => {
            const color = c.retentionPct >= 30 ? '#10B981' : c.retentionPct >= 10 ? '#F59E0B' : '#EF4444';
            const barW = Math.max(2, c.retentionPct);
            const weekLabel = new Date(c.week).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            const isCurrentWeek = i === cohorts.length - 1;
            return (
              <View key={c.week} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <Text style={{ fontSize: 11, color: '#6B7280', width: 50 }}>{weekLabel}</Text>
                <View style={{ flex: 1, height: 16, backgroundColor: '#2C2C2E', borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${barW}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
                </View>
                <Text style={{ fontSize: 11, color, fontWeight: '700', width: 36, textAlign: 'right' }}>
                  {c.retentionPct}%
                </Text>
                <Text style={{ fontSize: 11, color: '#4B5563', width: 32 }}>/{c.signups}</Text>
                {isCurrentWeek && <Text style={{ fontSize: 9, color: '#6366F1' }}>сейчас</Text>}
              </View>
            );
          })}
        </View>
      )}

      {/* Day-of-week activity heatmap */}
      {data.timeline.length >= 7 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Активность по дням недели</Text>
          <Text style={styles.chartSub}>Тренировки за выбранный период</Text>
          {(() => {
            const DOW_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
            const dowWorkouts = new Array(7).fill(0);
            const dowSignups = new Array(7).fill(0);
            data.timeline.forEach((row) => {
              // getDay() returns 0=Sun, so shift: Mon=0..Sun=6
              const d = new Date(row.date);
              const dow = (d.getDay() + 6) % 7;
              dowWorkouts[dow] += row.workouts;
              dowSignups[dow] += row.signups;
            });
            const maxW = Math.max(...dowWorkouts, 1);
            return (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                {DOW_LABELS.map((label, i) => {
                  const intensity = Math.round((dowWorkouts[i] / maxW) * 100);
                  const bgColor = intensity > 60 ? '#F59E0B' : intensity > 30 ? '#F59E0B80' : intensity > 0 ? '#F59E0B30' : '#2C2C2E';
                  const isWeekend = i >= 5;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 10, color: isWeekend ? '#6366F1' : '#6B7280', fontWeight: '700' }}>{label}</Text>
                      <View style={{ width: '100%', aspectRatio: 1, borderRadius: 6, backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: '700' }}>{dowWorkouts[i]}</Text>
                      </View>
                      <Text style={{ fontSize: 8, color: '#4B5563' }}>+{dowSignups[i]}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })()}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#F59E0B' }} />
              <Text style={{ fontSize: 9, color: '#6B7280' }}>тренировки</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 9, color: '#6B7280' }}>+N = регистрации</Text>
            </View>
          </View>
        </View>
      )}

      {/* Timeline table — last 7 days */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Последние 7 дней</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCell, styles.tableHead, { flex: 2 }]}>Дата</Text>
          <Text style={[styles.tableCell, styles.tableHead]}>Рег.</Text>
          <Text style={[styles.tableCell, styles.tableHead]}>Трен.</Text>
          <Text style={[styles.tableCell, styles.tableHead]}>ИИ</Text>
          <Text style={[styles.tableCell, styles.tableHead]}>Кард.</Text>
        </View>
        {data.timeline.slice(-7).reverse().map((row) => (
          <View key={row.date} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 2, color: '#9CA3AF' }]}>{formatDate(row.date)}</Text>
            <Text style={[styles.tableCell, { color: row.signups > 0 ? '#6366F1' : '#374151' }]}>{row.signups}</Text>
            <Text style={[styles.tableCell, { color: row.workouts > 0 ? '#F59E0B' : '#374151' }]}>{row.workouts}</Text>
            <Text style={[styles.tableCell, { color: row.ai > 0 ? '#8B5CF6' : '#374151' }]}>{row.ai}</Text>
            <Text style={[styles.tableCell, { color: row.cardio > 0 ? '#10B981' : '#374151' }]}>{row.cardio}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center' },

  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodBtn: { flex: 1, backgroundColor: '#1C1C1E', borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#2C2C2E' },
  periodBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  periodText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  periodTextActive: { color: '#FFFFFF' },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: '#1C1C1E', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2C2C2E' },
  summaryNum: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 10, color: '#6B7280', marginTop: 2, textAlign: 'center' },
  summarySub: { fontSize: 10, color: '#4B5563', marginTop: 1 },
  deltaText: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  insightsCard: { backgroundColor: '#1C1C1E', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#2C2C2E' },
  insightsTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  insightText: { fontSize: 13, flex: 1, lineHeight: 18 },

  chartCard: { backgroundColor: '#1C1C1E', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2C2C2E' },
  chartTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  chartSub: { fontSize: 11, color: '#4B5563', marginBottom: 12 },

  funnelLabel: { fontSize: 13, color: '#D1D5DB' },
  funnelValue: { fontSize: 13, fontWeight: '700' },
  funnelPct: { fontSize: 11, color: '#9CA3AF', fontWeight: '400' },
  funnelTrack: { height: 6, backgroundColor: '#2C2C2E', borderRadius: 3, overflow: 'hidden' },
  funnelFill: { height: '100%', borderRadius: 3 },

  kpiRow: { flexDirection: 'row', gap: 16, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2C2C2E' },
  kpiItem: { flex: 1, alignItems: 'center' },
  kpiNum: { fontSize: 28, fontWeight: '800' },
  kpiLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },

  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2C2C2E', paddingBottom: 6, marginBottom: 4 },
  tableRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#1C1C1E' },
  tableCell: { flex: 1, fontSize: 13, textAlign: 'center' },
  tableHead: { fontSize: 10, color: '#6B7280', fontWeight: '700', textTransform: 'uppercase' },

  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  exerciseRank: { fontSize: 12, color: '#6B7280', fontWeight: '700', width: 18, textAlign: 'right' },
  exerciseName: { fontSize: 13, color: '#FFFFFF', fontWeight: '500', flex: 1 },
  exerciseCount: { fontSize: 12, color: '#F59E0B', fontWeight: '700' },
  exerciseBarTrack: { height: 4, backgroundColor: '#2C2C2E', borderRadius: 2, overflow: 'hidden' },
  exerciseBarFill: { height: '100%', backgroundColor: '#F59E0B60', borderRadius: 2 },
});
