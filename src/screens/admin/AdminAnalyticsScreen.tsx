import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity, Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { adminService } from '../../services/adminService';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
              <View style={[chartStyles.bar, { height: h, backgroundColor: v > 0 ? color : '#1E1E22' }]} />
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
  axis: { fontSize: 9, color: '#2A2A2F' },
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
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState(30);
  const [exporting, setExporting] = useState(false);
  const [cohorts, setCohorts] = useState<Array<{ week: string; signups: number; activeThisWeek: number; retentionPct: number }>>([]);
  const [subTimeline, setSubTimeline] = useState<{ timeline: Array<{ date: string; pro: number; trainer: number; club: number; total: number }>; totalNew: number } | null>(null);
  const [segments, setSegments] = useState<Array<{ plan: string; userCount: number; avgWorkoutsPerUser: number; avgAiPerUser: number; activeRate: number }>>([]);
  const [forecast, setForecast] = useState<Array<{ weekStart: string; weekEnd: string; count: number; revenue: number }>>([]);
  const [churnRisk, setChurnRisk] = useState<Array<{ id: string; firstName: string; lastName?: string | null; email: string; plan: string; totalWorkouts: number; daysSinceWorkout: number | null; daysUntilExpiry: number | null }>>([]);
  const [topRevenue, setTopRevenue] = useState<Array<{ id: string; firstName: string; lastName?: string | null; email: string; plan: string; revenue: number; workouts: number }>>([]);

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
    setLoadError(null);
    try {
      // Seven requests used to go through one bare Promise.all with no catch:
      // any single failure rejected the whole thing, `data` stayed null, and
      // the render below returned null — a blank screen with no explanation.
      // On Render's free tier a cold start takes seconds, so this fired for
      // real. Only the headline analytics is required; every panel below it
      // degrades to empty on its own.
      const [cohortsRes, subRes, segRes, forecastRes, churnRes, topRevRes] = await Promise.all([
        adminService.getCohorts().catch(() => []),
        adminService.getSubscriptionTimeline(period).catch(() => null),
        adminService.getSegments().catch(() => []),
        adminService.getSubscriptionForecast().catch(() => []),
        adminService.getChurnRiskUsers().catch(() => []),
        adminService.getTopRevenueUsers().catch(() => []),
      ]);
      const res = await adminService.getAnalytics(period);
      setData(res);
      setCohorts(cohortsRes);
      setSubTimeline(subRes);
      setSegments(segRes);
      setForecast(forecastRes);
      setChurnRisk(churnRes);
      setTopRevenue(topRevRes);
    } catch {
      setLoadError('Не удалось загрузить аналитику. Проверь соединение и попробуй ещё раз.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [period]);

  if (loading) return <ActivityIndicator style={styles.center} color="#D4B07A" size="large" />;
  // `return null` here was a blank screen: the load failed, nothing said so,
  // and there was no way back except leaving and re-entering.
  if (!data) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>
          {loadError ?? 'Аналитика недоступна.'}
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const signups = (data.timeline ?? []).map((t) => t.signups);
  const workouts = (data.timeline ?? []).map((t) => t.workouts);
  const ai = (data.timeline ?? []).map((t) => t.ai);
  const cardio = (data.timeline ?? []).map((t) => t.cardio);

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
    if (prev === 0) return '#A8A49C';
    return cur >= prev ? '#9AC28C' : '#E07A6B';
  };

  // Auto-generated insights
  const insights: Array<{ icon: string; text: string; color: string }> = [];
  if (data.previous) {
    const wDiff = data.previous.workouts > 0 ? Math.round(((totalWorkoutsInPeriod - data.previous.workouts) / data.previous.workouts) * 100) : 0;
    if (Math.abs(wDiff) >= 10) insights.push({ icon: wDiff > 0 ? '📈' : '📉', text: `Тренировки ${wDiff > 0 ? 'выросли' : 'упали'} на ${Math.abs(wDiff)}% vs предыдущий период`, color: wDiff > 0 ? '#9AC28C' : '#E07A6B' });
    const sDiff = data.previous.signups > 0 ? Math.round(((totalSignups - data.previous.signups) / data.previous.signups) * 100) : 0;
    if (Math.abs(sDiff) >= 15) insights.push({ icon: sDiff > 0 ? '🚀' : '⚠️', text: `Регистрации ${sDiff > 0 ? 'выросли' : 'упали'} на ${Math.abs(sDiff)}%`, color: sDiff > 0 ? '#9AC28C' : '#E8A36A' });
    const aiDiff = data.previous.ai > 0 ? Math.round(((totalAiInPeriod - data.previous.ai) / data.previous.ai) * 100) : 0;
    if (Math.abs(aiDiff) >= 20) insights.push({ icon: aiDiff > 0 ? '🤖' : '💤', text: `ИИ-активность ${aiDiff > 0 ? 'выросла' : 'упала'} на ${Math.abs(aiDiff)}%`, color: aiDiff > 0 ? '#D4B07A' : '#A8A49C' });
  }
  // Peak day
  const peakWorkoutIdx = workouts.indexOf(Math.max(...workouts));
  if (Math.max(...workouts) > 0 && data.timeline[peakWorkoutIdx]) {
    const peakDate = new Date(String(data.timeline[peakWorkoutIdx].date).split('T')[0] + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
    insights.push({ icon: '🏆', text: `Пик тренировок: ${Math.max(...workouts)} за ${peakDate}`, color: '#E8A36A' });
  }
  // Zero workout days
  const zeroDays = workouts.filter((v) => v === 0).length;
  if (zeroDays > data.period * 0.3) insights.push({ icon: '😴', text: `${zeroDays} дней без тренировок (${Math.round(zeroDays / data.period * 100)}% периода)`, color: '#A8A49C' });
  if (data.funnel.conversionRate < 5) insights.push({ icon: '💰', text: `Конверсия в платных всего ${data.funnel.conversionRate}% — возможен рост`, color: '#E8A36A' });
  if (data.funnel.retentionRate > 30) insights.push({ icon: '⭐', text: `Ретеншн ${data.funnel.retentionRate}% — хороший показатель`, color: '#9AC28C' });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#D4B07A" />}
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
            ? <ActivityIndicator size="small" color="#D4B07A" />
            : <Text style={[styles.periodText, { color: '#D4B07A' }]}>CSV</Text>
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
          <Text style={[styles.summaryNum, { color: '#D4B07A' }]} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{totalSignups}</Text>
          <Text style={styles.summaryLabel}>Регистраций</Text>
          {data.previous && (
            <Text style={[styles.deltaText, { color: pctColor(totalSignups, data.previous.signups) }]}>
              {pct(totalSignups, data.previous.signups)}
            </Text>
          )}
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNum, { color: '#E8A36A' }]} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{totalWorkoutsInPeriod}</Text>
          <Text style={styles.summaryLabel}>Тренировок</Text>
          {data.previous && (
            <Text style={[styles.deltaText, { color: pctColor(totalWorkoutsInPeriod, data.previous.workouts) }]}>
              {pct(totalWorkoutsInPeriod, data.previous.workouts)}
            </Text>
          )}
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNum, { color: '#D4B07A' }]} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{totalAiInPeriod}</Text>
          <Text style={styles.summaryLabel}>ИИ запросов</Text>
          {data.previous && (
            <Text style={[styles.deltaText, { color: pctColor(totalAiInPeriod, data.previous.ai) }]}>
              {pct(totalAiInPeriod, data.previous.ai)}
            </Text>
          )}
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNum, { color: '#9AC28C' }]} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{totalCardioInPeriod}</Text>
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
          <Text style={[styles.summaryNum, { fontSize: 18, color: '#D4B07A' }]}>{avgSignupsPerDay}</Text>
          <View>
            <Text style={styles.summaryLabel}>регистраций</Text>
            <Text style={styles.summarySub}>в день</Text>
          </View>
        </View>
        <View style={[styles.summaryCard, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          <Text style={[styles.summaryNum, { fontSize: 18, color: '#E8A36A' }]}>{avgWorkoutsPerDay}</Text>
          <View>
            <Text style={styles.summaryLabel}>тренировок</Text>
            <Text style={styles.summarySub}>в день</Text>
          </View>
        </View>
      </View>

      {/* Charts */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Регистрации по дням</Text>
        <MiniBarChart data={signups} color="#D4B07A" label="новых пользователей" />
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Активность тренировок</Text>
        <MiniBarChart data={workouts} color="#E8A36A" label="завершённых тренировок" />
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>ИИ-запросы</Text>
        <MiniBarChart data={ai} color="#D4B07A" label="сообщений пользователей" />
      </View>

      {cardio.some((v) => v > 0) && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Кардио-сессии</Text>
          <MiniBarChart data={cardio} color="#9AC28C" label="сессий" />
        </View>
      )}

      {/* Conversion funnel */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Воронка конверсии</Text>
        <FunnelBar
          label="Всего пользователей"
          value={data.funnel.totalUsers}
          total={data.funnel.totalUsers}
          color="#D4B07A"
        />
        <FunnelBar
          label="Платная подписка"
          value={data.funnel.paidUsers}
          total={data.funnel.totalUsers}
          color="#E8A36A"
        />
        <FunnelBar
          label="Активны последние 7 дн."
          value={data.funnel.activeLastWeek}
          total={data.funnel.totalUsers}
          color="#9AC28C"
        />
        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiNum, { color: '#E8A36A' }]} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{data.funnel.conversionRate}%</Text>
            <Text style={styles.kpiLabel}>Конверсия</Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiNum, { color: '#9AC28C' }]} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{data.funnel.retentionRate}%</Text>
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
            { label: 'Зарегистрировались', value: data.onboardingFunnel.signups, color: '#D4B07A' },
            { label: 'Заполнили цель', value: data.onboardingFunnel.profiled, color: '#D4B07A' },
            { label: 'Первая тренировка', value: data.onboardingFunnel.firstWorkout, color: '#E8A36A' },
            { label: 'Оформили подписку', value: data.onboardingFunnel.converted, color: '#9AC28C' },
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

      {/* Subscription expiry forecast */}
      {forecast.some((w) => w.count > 0) && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Прогноз истечения подписок (4 недели)</Text>
          <Text style={styles.chartSub}>Сколько платных подписок истекает и потенциальная потеря дохода</Text>
          {forecast.map((week, i) => {
            const weekLabel = i === 0 ? 'Эта неделя' : i === 1 ? 'Следующая' : `+${i} нед.`;
            const maxCount = Math.max(...forecast.map((w) => w.count), 1);
            const barW = Math.round((week.count / maxCount) * 100);
            return (
              <View key={week.weekStart} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Text style={styles.funnelLabel}>{weekLabel}</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Text style={[styles.funnelValue, { color: week.count > 0 ? '#E8A36A' : '#2A2A2F' }]}>
                      {week.count} <Text style={styles.funnelPct}>польз.</Text>
                    </Text>
                    {week.revenue > 0 && (
                      <Text style={[styles.funnelValue, { color: '#E07A6B' }]}>
                        -${week.revenue}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.funnelTrack}>
                  <View style={[styles.funnelFill, { width: `${barW}%` as any, backgroundColor: week.count > 0 ? '#E8A36A' : '#1E1E22' }]} />
                </View>
              </View>
            );
          })}
          <Text style={[styles.chartSub, { marginTop: 8 }]}>
            Итого: {forecast.reduce((s, w) => s + w.count, 0)} подписок / ${forecast.reduce((s, w) => s + w.revenue, 0).toFixed(0)} потенц. выручки
          </Text>
        </View>
      )}

      {/* Segment comparison */}
      {segments.length > 1 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Вовлечённость по тарифам (30 дней)</Text>
          <Text style={styles.chartSub}>Среднее количество активностей на пользователя</Text>
          <View style={{ flexDirection: 'row', marginBottom: 8, gap: 4 }}>
            {['', 'Трен.', 'ИИ', 'Актив.%'].map((h, i) => (
              <Text key={i} style={[styles.tableHead, { flex: i === 0 ? 1.5 : 1, textAlign: i === 0 ? 'left' : 'right' }]}>{h}</Text>
            ))}
          </View>
          {segments.map((seg) => {
            const PLAN_COLOR: Record<string, string> = { free: '#A8A49C', pro: '#D4B07A', trainer: '#E8A36A', club: '#9AC28C' };
            const color = PLAN_COLOR[seg.plan] ?? '#A8A49C';
            const maxW = Math.max(...segments.map((s) => s.avgWorkoutsPerUser), 1);
            const barW = Math.round((seg.avgWorkoutsPerUser / maxW) * 100);
            return (
              <View key={seg.plan} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color, flex: 1.5 }}>
                    {seg.plan.toUpperCase()} <Text style={{ color: '#A8A49C', fontWeight: '400' }}>({seg.userCount})</Text>
                  </Text>
                  <Text style={{ fontSize: 12, color: '#E8A36A', fontWeight: '700', flex: 1, textAlign: 'right' }}>{seg.avgWorkoutsPerUser}</Text>
                  <Text style={{ fontSize: 12, color: '#D4B07A', fontWeight: '700', flex: 1, textAlign: 'right' }}>{seg.avgAiPerUser}</Text>
                  <Text style={{ fontSize: 12, color: seg.activeRate > 30 ? '#9AC28C' : '#E07A6B', fontWeight: '700', flex: 1, textAlign: 'right' }}>{seg.activeRate}%</Text>
                </View>
                <View style={styles.funnelTrack}>
                  <View style={[styles.funnelFill, { width: `${barW}%` as any, backgroundColor: color }]} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Churn risk users */}
      {churnRisk.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Риск оттока ({churnRisk.length} польз.)</Text>
          <Text style={styles.chartSub}>Платные пользователи без тренировок 14+ дней</Text>
          {churnRisk.slice(0, 8).map((u) => {
            const PLAN_COLOR: Record<string, string> = { pro: '#D4B07A', trainer: '#E8A36A', club: '#9AC28C' };
            const planColor = PLAN_COLOR[u.plan] ?? '#A8A49C';
            return (
              <TouchableOpacity
                key={u.id}
                style={[styles.tableRow, { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }]}
                onPress={() => navigation.navigate('AdminUserDetailScreen', { userId: u.id })}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }} numberOfLines={1}>
                    {u.firstName} {u.lastName ?? ''}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#A8A49C' }} numberOfLines={1}>{u.email}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: planColor }}>{u.plan.toUpperCase()}</Text>
                  <Text style={{ fontSize: 11, color: '#E07A6B' }}>
                    {u.daysSinceWorkout != null ? `${u.daysSinceWorkout}д` : '—'}
                    {u.daysUntilExpiry != null && u.daysUntilExpiry < 30 ? ` · ⏰${u.daysUntilExpiry}д` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Top revenue users */}
      {topRevenue.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Топ плательщиков</Text>
          <Text style={styles.chartSub}>Пользователи с активными платными подписками</Text>
          {topRevenue.slice(0, 8).map((u, i) => {
            const PLAN_COLOR: Record<string, string> = { pro: '#D4B07A', trainer: '#E8A36A', club: '#9AC28C' };
            const planColor = PLAN_COLOR[u.plan] ?? '#A8A49C';
            return (
              <TouchableOpacity
                key={u.id}
                style={[styles.tableRow, { paddingVertical: 8 }]}
                onPress={() => navigation.navigate('AdminUserDetailScreen', { userId: u.id })}
                activeOpacity={0.7}
              >
                <Text style={[styles.tableCell, { color: '#A8A49C', flex: 0.3 }]}>{i + 1}</Text>
                <View style={{ flex: 3 }}>
                  <Text style={[styles.tableCell, { color: '#FFFFFF', textAlign: 'left' }]} numberOfLines={1}>
                    {u.firstName} {u.lastName ?? ''}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#A8A49C', marginTop: 1 }} numberOfLines={1}>{u.email}</Text>
                </View>
                <Text style={[styles.tableCell, { color: planColor, fontWeight: '700', flex: 1 }]}>{u.plan.toUpperCase()}</Text>
                <Text style={[styles.tableCell, { color: '#9AC28C', fontWeight: '700', flex: 0.8 }]}>${u.revenue}</Text>
                <Text style={[styles.tableCell, { color: '#E8A36A', flex: 0.7 }]}>{u.workouts}🏋</Text>
              </TouchableOpacity>
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
              <Text style={[styles.tableCell, { color: '#A8A49C', flex: 0.3 }]}>{i + 1}</Text>
              <Text style={[styles.tableCell, { flex: 3, color: '#FFFFFF', textAlign: 'left' }]} numberOfLines={1}>{p.name}</Text>
              <Text style={[styles.tableCell, { color: '#A8A49C', flex: 1.5, textAlign: 'left' }]} numberOfLines={1}>{p.type}</Text>
              <Text style={[styles.tableCell, { color: '#E8A36A', fontWeight: '700' }]}>{p.count}</Text>
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
            <Text style={[styles.chartSub, { color: '#9AC28C', fontWeight: '700' }]}>+{subTimeline.totalNew} за период</Text>
          </View>
          <Text style={styles.chartSub}>Ежедневные новые оплаченные подписки по планам</Text>
          <MiniBarChart data={subTimeline.timeline.map((t) => t.total)} color="#9AC28C" label="всего новых" />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            {(['pro', 'trainer', 'club'] as const).map((plan) => {
              const total = subTimeline.timeline.reduce((sum, t) => sum + t[plan], 0);
              const PLAN_COLOR = { pro: '#D4B07A', trainer: '#E8A36A', club: '#9AC28C' };
              if (total === 0) return null;
              return (
                <View key={plan} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: PLAN_COLOR[plan] }} />
                  <Text style={{ fontSize: 11, color: '#A8A49C' }}>{plan.toUpperCase()}: {total}</Text>
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
            const color = c.retentionPct >= 30 ? '#9AC28C' : c.retentionPct >= 10 ? '#E8A36A' : '#E07A6B';
            const barW = Math.max(2, c.retentionPct);
            const weekLabel = new Date(String(c.week).split('T')[0] + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            const isCurrentWeek = i === cohorts.length - 1;
            return (
              <View key={c.week} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <Text style={{ fontSize: 11, color: '#A8A49C', width: 50 }}>{weekLabel}</Text>
                <View style={{ flex: 1, height: 16, backgroundColor: '#1E1E22', borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${barW}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
                </View>
                <Text style={{ fontSize: 11, color, fontWeight: '700', width: 36, textAlign: 'right' }}>
                  {c.retentionPct}%
                </Text>
                <Text style={{ fontSize: 11, color: '#2A2A2F', width: 32 }}>/{c.signups}</Text>
                {isCurrentWeek && <Text style={{ fontSize: 9, color: '#D4B07A' }}>сейчас</Text>}
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
                  const bgColor = intensity > 60 ? '#E8A36A' : intensity > 30 ? '#E8A36A80' : intensity > 0 ? '#E8A36A30' : '#1E1E22';
                  const isWeekend = i >= 5;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 10, color: isWeekend ? '#D4B07A' : '#A8A49C', fontWeight: '700' }}>{label}</Text>
                      <View style={{ width: '100%', aspectRatio: 1, borderRadius: 6, backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: '700' }}>{dowWorkouts[i]}</Text>
                      </View>
                      <Text style={{ fontSize: 8, color: '#2A2A2F' }}>+{dowSignups[i]}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })()}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#E8A36A' }} />
              <Text style={{ fontSize: 9, color: '#A8A49C' }}>тренировки</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 9, color: '#A8A49C' }}>+N = регистрации</Text>
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
            <Text style={[styles.tableCell, { flex: 2, color: '#A8A49C' }]}>{formatDate(row.date)}</Text>
            <Text style={[styles.tableCell, { color: row.signups > 0 ? '#D4B07A' : '#2A2A2F' }]}>{row.signups}</Text>
            <Text style={[styles.tableCell, { color: row.workouts > 0 ? '#E8A36A' : '#2A2A2F' }]}>{row.workouts}</Text>
            <Text style={[styles.tableCell, { color: row.ai > 0 ? '#D4B07A' : '#2A2A2F' }]}>{row.ai}</Text>
            <Text style={[styles.tableCell, { color: row.cardio > 0 ? '#9AC28C' : '#2A2A2F' }]}>{row.cardio}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0E0F' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center' },
  errorBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  errorText: { fontSize: 14, color: '#A8A49C', textAlign: 'center', lineHeight: 20 },
  retryBtn: { backgroundColor: '#D4B07A', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { fontSize: 14, fontWeight: '700', color: '#17171A' },

  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodBtn: { flex: 1, backgroundColor: '#17171A', borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#1E1E22' },
  periodBtnActive: { backgroundColor: '#D4B07A', borderColor: '#D4B07A' },
  periodText: { fontSize: 13, fontWeight: '600', color: '#A8A49C' },
  periodTextActive: { color: '#17171A' },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: '#17171A', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1E1E22' },
  summaryNum: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 10, color: '#A8A49C', marginTop: 2, textAlign: 'center' },
  summarySub: { fontSize: 10, color: '#2A2A2F', marginTop: 1 },
  deltaText: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  insightsCard: { backgroundColor: '#17171A', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1E1E22' },
  insightsTitle: { fontSize: 11, fontWeight: '700', color: '#A8A49C', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1E1E22' },
  insightText: { fontSize: 13, flex: 1, lineHeight: 18 },

  chartCard: { backgroundColor: '#17171A', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1E1E22' },
  chartTitle: { fontSize: 13, fontWeight: '700', color: '#A8A49C', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  chartSub: { fontSize: 11, color: '#2A2A2F', marginBottom: 12 },

  funnelLabel: { fontSize: 13, color: '#F4F1EA' },
  funnelValue: { fontSize: 13, fontWeight: '700' },
  funnelPct: { fontSize: 11, color: '#A8A49C', fontWeight: '400' },
  funnelTrack: { height: 6, backgroundColor: '#1E1E22', borderRadius: 3, overflow: 'hidden' },
  funnelFill: { height: '100%', borderRadius: 3 },

  kpiRow: { flexDirection: 'row', gap: 16, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1E1E22' },
  kpiItem: { flex: 1, alignItems: 'center' },
  kpiNum: { fontSize: 28, fontWeight: '800' },
  kpiLabel: { fontSize: 11, color: '#A8A49C', marginTop: 2 },

  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1E1E22', paddingBottom: 6, marginBottom: 4 },
  tableRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#17171A' },
  tableCell: { flex: 1, fontSize: 13, textAlign: 'center' },
  tableHead: { fontSize: 10, color: '#A8A49C', fontWeight: '700', textTransform: 'uppercase' },

  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1E1E22' },
  exerciseRank: { fontSize: 12, color: '#A8A49C', fontWeight: '700', width: 18, textAlign: 'right' },
  exerciseName: { fontSize: 13, color: '#FFFFFF', fontWeight: '500', flex: 1 },
  exerciseCount: { fontSize: 12, color: '#E8A36A', fontWeight: '700' },
  exerciseBarTrack: { height: 4, backgroundColor: '#1E1E22', borderRadius: 2, overflow: 'hidden' },
  exerciseBarFill: { height: '100%', backgroundColor: '#E8A36A60', borderRadius: 2 },
});
