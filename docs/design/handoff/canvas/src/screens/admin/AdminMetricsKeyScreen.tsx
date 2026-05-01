import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { adminService, type KeyMetrics } from '../../services/adminService';

/**
 * Key metrics dashboard — the 5 numbers a solo founder needs in front of
 * them when deciding what to do next:
 *
 *   1. Paying users (current + Δ vs 30d)
 *   2. Monthly churn (% with healthy threshold)
 *   3. ARPU (₽/mo, healthy threshold)
 *   4. Activation (% who chatted within 24h, median TTF)
 *   5. Funnel (signup → profiled → first workout → first chat → paid)
 *
 * Distinct from the existing AdminDashboardScreen which covers system
 * health, alerts, recent activity. This screen is the one to open before
 * any product decision — it shows whether the product is in a state to
 * justify growth investment, retention work, or shutdown.
 *
 * Cached server-side 5 minutes. Pull-to-refresh sends `?refresh=1` to
 * force a re-compute when needed.
 */
export default function AdminMetricsKeyScreen() {
  const navigation = useNavigation();
  const [metrics, setMetrics] = useState<KeyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force: boolean) => {
    if (!force) setLoading(true);
    setError(null);
    try {
      const data = await adminService.getKeyMetrics(force);
      setMetrics(data);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Не удалось загрузить метрики');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366F1" size="large" />
      </View>
    );
  }

  if (error || !metrics) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Ошибка</Text>
        <Text style={styles.errorMessage}>{error ?? 'Нет данных'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load(true)}>
          <Text style={styles.retryText}>Попробовать снова</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const generated = new Date(metrics.generatedAt);
  const generatedStr = generated.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const formatTtf = (min: number | null) => {
    if (min == null) return 'нет данных';
    if (min < 60) return `${min} мин`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} ч`;
    return `${Math.round(h / 24)} д`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Назад</Text>
        </TouchableOpacity>
        <Text style={styles.title}>5 ключевых чисел</Text>
        <Text style={styles.subtitle}>Обновлено {generatedStr} (МСК)</Text>
      </View>

      {/* 1. Paying users */}
      <MetricCard
        index="1"
        label="Платящие пользователи"
        value={String(metrics.payingUsers.current)}
        sub={
          metrics.payingUsers.deltaPct != null
            ? `${metrics.payingUsers.deltaPct >= 0 ? '+' : ''}${metrics.payingUsers.deltaPct}% за 30 дней (было ${metrics.payingUsers.thirtyDaysAgo})`
            : `Было ${metrics.payingUsers.thirtyDaysAgo} 30 дней назад`
        }
        accentColor={
          metrics.payingUsers.current >= 200
            ? '#10B981'
            : metrics.payingUsers.current >= 50
              ? '#F59E0B'
              : '#EF4444'
        }
      />

      {/* 2. Monthly churn */}
      <MetricCard
        index="2"
        label="Месячный отток"
        value={`${metrics.monthlyChurn.churnPct}%`}
        sub={`${metrics.monthlyChurn.churnedLast30} ушло из ~${metrics.monthlyChurn.avgPaying} в среднем · здоровый порог ≤${metrics.monthlyChurn.healthyThreshold}%`}
        accentColor={metrics.monthlyChurn.isHealthy ? '#10B981' : '#EF4444'}
        healthLabel={metrics.monthlyChurn.isHealthy ? 'Здоровый' : 'Слишком высокий'}
      />

      {/* 3. ARPU */}
      <MetricCard
        index="3"
        label="ARPU (₽/мес)"
        value={`${metrics.arpu.rub.toLocaleString('ru-RU')} ₽`}
        sub={`MRR ≈ ${metrics.arpu.totalMrrRub.toLocaleString('ru-RU')} ₽ · ${metrics.arpu.sampleSize} платящих · здоровый ≥${metrics.arpu.healthyThreshold} ₽`}
        accentColor={metrics.arpu.isHealthy ? '#10B981' : '#EF4444'}
        healthLabel={metrics.arpu.isHealthy ? 'Здоровый' : 'Низкий'}
      />

      {/* 4. Activation */}
      <MetricCard
        index="4"
        label="Активация (24ч)"
        value={`${metrics.activation.activationRatePct}%`}
        sub={`${metrics.activation.activated24h} из ${metrics.activation.cohortSize} новых · медиана до 1-го чата: ${formatTtf(metrics.activation.medianTtfMinutes)} · здоровый ≥${metrics.activation.healthyThreshold}%`}
        accentColor={metrics.activation.isHealthy ? '#10B981' : '#EF4444'}
        healthLabel={metrics.activation.isHealthy ? 'Здоровая' : 'Низкая'}
      />

      {/* 5. Funnel */}
      <View style={[styles.card, { borderLeftColor: '#6366F1' }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIndex}>5</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardLabel}>Воронка (последние 30 дней)</Text>
            <Text style={styles.cardSub}>signup → профиль → первая тренировка → первый чат → платящий</Text>
          </View>
        </View>
        <FunnelStep label="Регистраций" value={metrics.funnel.signups} />
        <FunnelStep
          label="Заполнили профиль"
          value={metrics.funnel.profiled}
          conv={metrics.funnel.signupToProfiledPct}
        />
        <FunnelStep
          label="Завершили 1-ю тренировку"
          value={metrics.funnel.firstWorkout}
        />
        <FunnelStep
          label="Начали диалог с AI"
          value={metrics.funnel.firstChat}
          conv={metrics.funnel.profiledToFirstChatPct}
          convLabel="от профиля"
        />
        <FunnelStep
          label="Стали платящими"
          value={metrics.funnel.paid}
          conv={metrics.funnel.firstChatToPaidPct}
          convLabel="от первого чата"
        />
        <View style={styles.funnelTotal}>
          <Text style={styles.funnelTotalLabel}>Конверсия signup → платящий</Text>
          <Text style={styles.funnelTotalValue}>{metrics.funnel.signupToPaidPct}%</Text>
        </View>
      </View>

      <Text style={styles.disclaimer}>
        Здоровые пороги: платящих ≥200, churn ≤10%, ARPU ≥400 ₽, активация ≥50%. Источник —
        server/src/routes/admin.ts (эндпоинт GET /admin/metrics/key, кэш 5 мин).
      </Text>
    </ScrollView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  index,
  label,
  value,
  sub,
  accentColor,
  healthLabel,
}: {
  index: string;
  label: string;
  value: string;
  sub: string;
  accentColor: string;
  healthLabel?: string;
}) {
  return (
    <View style={[styles.card, { borderLeftColor: accentColor }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardIndex}>{index}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardLabel}>{label}</Text>
          <Text style={[styles.cardValue, { color: accentColor }]}>{value}</Text>
          {healthLabel && (
            <Text style={[styles.healthBadge, { color: accentColor }]}>{healthLabel}</Text>
          )}
        </View>
      </View>
      <Text style={styles.cardSub}>{sub}</Text>
    </View>
  );
}

function FunnelStep({
  label,
  value,
  conv,
  convLabel,
}: {
  label: string;
  value: number;
  conv?: number;
  convLabel?: string;
}) {
  return (
    <View style={styles.funnelStep}>
      <Text style={styles.funnelLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={styles.funnelValue}>{value}</Text>
        {conv != null && (
          <Text style={styles.funnelConv}>
            {conv}% {convLabel ?? ''}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  content: { padding: 16, paddingBottom: 64 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0F', padding: 32 },
  header: { marginBottom: 16 },
  backBtn: { marginBottom: 12 },
  backText: { color: '#6366F1', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 4 },

  card: {
    backgroundColor: '#15151F',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  cardIndex: {
    fontSize: 32,
    fontWeight: '900',
    color: '#3F3F4D',
    width: 32,
    textAlign: 'center',
  },
  cardLabel: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  cardValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  cardSub: { fontSize: 12, color: '#6B7280', lineHeight: 16, marginTop: 4 },
  healthBadge: { fontSize: 11, fontWeight: '700', marginTop: 2 },

  funnelStep: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomColor: '#1F1F2A',
    borderBottomWidth: 1,
  },
  funnelLabel: { fontSize: 13, color: '#D1D5DB', flex: 1 },
  funnelValue: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  funnelConv: { fontSize: 11, color: '#6B7280' },
  funnelTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 4,
  },
  funnelTotalLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  funnelTotalValue: { fontSize: 22, fontWeight: '800', color: '#10B981' },

  disclaimer: { fontSize: 11, color: '#4B5563', lineHeight: 16, marginTop: 16 },

  errorTitle: { fontSize: 18, fontWeight: '700', color: '#EF4444', marginBottom: 8 },
  errorMessage: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: '#6366F1', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
});
