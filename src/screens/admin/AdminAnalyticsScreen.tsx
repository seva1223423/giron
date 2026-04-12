import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity,
} from 'react-native';
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

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await adminService.getAnalytics(period);
      setData(res);
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#6366F1" />}
    >
      {/* Period selector */}
      <View style={styles.periodRow}>
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

  chartCard: { backgroundColor: '#1C1C1E', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2C2C2E' },
  chartTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },

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
});
