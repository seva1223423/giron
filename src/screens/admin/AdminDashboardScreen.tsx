import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity, TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { adminService } from '../../services/adminService';
import type { AdminStats, AdminAnalytics } from '../../types';

type AdminNav = NativeStackNavigationProp<any>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function StatCard({
  title, value, sub, color = '#6366F1', trend,
}: {
  title: string; value: string | number; sub?: string; color?: string; trend?: number | null;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
      {trend != null && (
        <Text style={{ fontSize: 10, fontWeight: '700', color: trend > 0 ? '#10B981' : trend < 0 ? '#EF4444' : '#6B7280', marginTop: 2 }}>
          {trend > 0 ? `↑ +${trend}%` : trend < 0 ? `↓ ${trend}%` : '→ 0%'} vs пред. нед.
        </Text>
      )}
    </View>
  );
}

/** Inline sparkline — shows 7-day trend */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const H = 28;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H, gap: 2 }}>
      {values.map((v, i) => {
        const h = Math.max(2, Math.round((v / max) * H));
        const isLast = i === values.length - 1;
        return (
          <View
            key={i}
            style={{ flex: 1, height: h, borderRadius: 2, backgroundColor: isLast ? color : color + '60' }}
          />
        );
      })}
    </View>
  );
}

const PLAN_PRICE: Record<string, number> = { pro: 9.99, trainer: 19.99, club: 29.99 };

/** Revenue estimate card */
function RevenueCard({ subscriptions, expiringSoon }: {
  subscriptions: Array<{ plan: string; status: string; count: number }>;
  expiringSoon?: number;
}) {
  const monthly = subscriptions
    .filter((s) => s.status === 'active' && s.plan !== 'free')
    .reduce((sum, s) => sum + (PLAN_PRICE[s.plan] ?? 0) * s.count, 0);

  return (
    <View style={styles.revenueCard}>
      <View style={styles.revenueHeader}>
        <Text style={styles.revenueTitle}>Оценка выручки</Text>
        <Text style={styles.revenueNote}>≈ по ценам PRO/Trainer/Club</Text>
      </View>
      <Text style={styles.revenueValue}>${monthly.toFixed(0)}<Text style={styles.revenueUnit}>/мес</Text></Text>
      <View style={styles.revenuePlanRow}>
        {subscriptions.filter((s) => s.status === 'active' && s.plan !== 'free').map((s) => (
          <View key={s.plan} style={styles.revenuePlanItem}>
            <Text style={styles.revenuePlanName}>{s.plan.toUpperCase()}</Text>
            <Text style={styles.revenuePlanCount}>{s.count} × ${PLAN_PRICE[s.plan] ?? 0}</Text>
          </View>
        ))}
      </View>
      {(expiringSoon ?? 0) > 0 && (
        <View style={styles.revenueAlert}>
          <Text style={styles.revenueAlertText}>⚠️ {expiringSoon} подписок истекает в ближайшие 7 дней</Text>
        </View>
      )}
    </View>
  );
}

/** Horizontal split bar: left = paid (purple), right = free (dark) */
function SubSplitBar({
  withSub, total,
}: { withSub: number; total: number }) {
  const paidPct = total > 0 ? (withSub / total) * 100 : 0;
  const freePct = 100 - paidPct;
  return (
    <View style={styles.splitCard}>
      <Text style={styles.splitTitle}>Подписки пользователей</Text>
      <View style={styles.splitBar}>
        <View style={[styles.splitFillPaid, { flex: paidPct || 0.001 }]} />
        <View style={[styles.splitFillFree, { flex: freePct || 0.001 }]} />
      </View>
      <View style={styles.splitLegend}>
        <View style={styles.splitLegendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
          <Text style={styles.splitLegendText}>
            С подпиской: <Text style={styles.splitLegendNum}>{withSub}</Text>
          </Text>
        </View>
        <View style={styles.splitLegendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#374151' }]} />
          <Text style={styles.splitLegendText}>
            Без подписки: <Text style={styles.splitLegendNum}>{total - withSub}</Text>
          </Text>
        </View>
      </View>
      <Text style={styles.splitPct}>
        {total > 0 ? `${Math.round(paidPct)}% платных` : '—'}
      </Text>
    </View>
  );
}

/** Bar with label */
function MemBar({
  label, usedMb, totalMb, pct, color,
}: { label: string; usedMb?: number; totalMb?: number; pct: number; color: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.memTitle}>{label}</Text>
      <View style={styles.memBar}>
        <View style={[styles.memFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.memLabel}>
        {usedMb !== undefined && totalMb !== undefined
          ? `${usedMb} МБ / ${totalMb} МБ (${pct}%)`
          : `${pct}%`}
      </Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminDashboardScreen() {
  const navigation = useNavigation<AdminNav>();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [quickSearch, setQuickSearch] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [statsData, analyticsData] = await Promise.all([
        adminService.getStats(),
        adminService.getAnalytics(7),
      ]);
      setStats(statsData);
      setAnalytics(analyticsData);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 60 seconds
    intervalRef.current = setInterval(() => load(true), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (loading) return <ActivityIndicator style={styles.center} color="#6366F1" size="large" />;
  if (!stats) return null;

  const memPct = Math.round((stats.server.memoryUsedMb / stats.server.memoryTotalMb) * 100);
  const sysPct = stats.server.systemMemUsedPct;
  const loadAvg1 = stats.server.loadAvg?.[0] ?? 0;
  const signups7d = analytics?.timeline.map((t) => t.signups) ?? [];
  const workouts7d = analytics?.timeline.map((t) => t.workouts) ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#6366F1" />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        {lastRefreshed && (
          <Text style={styles.headerSub}>
            Обновлено: {lastRefreshed.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
        )}
      </View>

      {/* Quick nav */}
      <View style={styles.navGrid}>
        {[
          { label: 'Пользователи', icon: '👥', screen: 'AdminUsersScreen' },
          { label: 'Поддержка', icon: '🎧', screen: 'AdminSupportScreen' },
          { label: 'Аналитика', icon: '📈', screen: 'AdminAnalyticsScreen' },
          { label: 'Логи', icon: '📋', screen: 'AdminLogsScreen' },
        ].map((b) => (
          <TouchableOpacity
            key={b.screen}
            style={styles.navBtn}
            onPress={() => navigation.navigate(b.screen)}
            activeOpacity={0.7}
          >
            <Text style={styles.navBtnIcon}>{b.icon}</Text>
            <Text style={styles.navBtnText}>{b.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick user search */}
      <View style={styles.quickSearchRow}>
        <TextInput
          style={styles.quickSearchInput}
          placeholder="Быстрый поиск пользователя..."
          placeholderTextColor="#6B7280"
          value={quickSearch}
          onChangeText={setQuickSearch}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (quickSearch.trim()) {
              navigation.navigate('AdminUsersScreen', { initialSearch: quickSearch.trim() });
              setQuickSearch('');
            }
          }}
        />
        {quickSearch.trim().length > 0 && (
          <TouchableOpacity
            style={styles.quickSearchBtn}
            onPress={() => {
              navigation.navigate('AdminUsersScreen', { initialSearch: quickSearch.trim() });
              setQuickSearch('');
            }}
          >
            <Text style={styles.quickSearchBtnText}>Найти</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 7-day activity sparklines ──────────────────────────────────── */}
      {signups7d.length > 0 && (
        <View style={styles.sparkCard}>
          <Text style={styles.sparkTitle}>Активность за 7 дней</Text>
          <View style={styles.sparkRow}>
            <View style={styles.sparkItem}>
              <Text style={styles.sparkLabel}>Регистрации</Text>
              <Sparkline values={signups7d} color="#6366F1" />
            </View>
            <View style={[styles.sparkItem, { borderLeftWidth: 1, borderLeftColor: '#2C2C2E', paddingLeft: 12 }]}>
              <Text style={styles.sparkLabel}>Тренировки</Text>
              <Sparkline values={workouts7d} color="#F59E0B" />
            </View>
          </View>
        </View>
      )}

      {/* ── Users ──────────────────────────────────────────────────────── */}
      <SectionTitle title="Пользователи" />
      <View style={styles.row}>
        <StatCard title="Всего" value={stats.users.total} />
        <StatCard title="Онлайн (5м)" value={stats.users.activeNow} color="#10B981" />
        <StatCard title="За час" value={stats.users.activeHour} color="#F59E0B" />
      </View>
      <View style={styles.row}>
        <StatCard title="Сегодня" value={stats.users.newToday} sub="новых" />
        <StatCard title="7 дней" value={stats.users.newThisWeek} sub="новых" trend={stats.trends?.usersWeekVsPrev} />
        <StatCard title="30 дней" value={stats.users.newThisMonth} sub="новых" />
      </View>
      {(stats.users.banned ?? 0) > 0 && (
        <View style={styles.row}>
          <StatCard title="Заблокировано" value={stats.users.banned ?? 0} color="#EF4444" sub="пользователей" />
        </View>
      )}

      {/* Subscription split bar */}
      <SubSplitBar withSub={stats.users.withSubscription ?? 0} total={stats.users.total} />

      {/* Revenue estimate */}
      <RevenueCard subscriptions={stats.subscriptions} expiringSoon={stats.subsExpiringSoon} />

      {/* Role breakdown */}
      <View style={styles.rolesCard}>
        <Text style={styles.rolesTitle}>Роли</Text>
        {Object.entries(stats.users.byRole).map(([role, count]) => (
          <View key={role} style={styles.roleRow}>
            <Text style={styles.roleLabel}>{role.toLowerCase()}</Text>
            <Text style={styles.roleCount}>{count as number}</Text>
          </View>
        ))}
      </View>

      {/* ── Workouts ───────────────────────────────────────────────────── */}
      <SectionTitle title="Тренировки" />
      <View style={styles.row}>
        <StatCard title="Сегодня" value={stats.workouts.completedToday} sub="завершено" />
        <StatCard title="7 дней" value={stats.workouts.completedThisWeek} sub="завершено" trend={stats.trends?.workoutsWeekVsPrev} />
        <StatCard title="Всего" value={stats.workouts.total ?? 0} sub="в базе" color="#9CA3AF" />
      </View>

      {/* ── Nutrition ──────────────────────────────────────────────────── */}
      {stats.nutrition && (
        <>
          <SectionTitle title="Питание" />
          <View style={styles.row}>
            <StatCard title="Приёмов сегодня" value={stats.nutrition.mealsToday} color="#F59E0B" />
            <StatCard title="За 7 дней" value={stats.nutrition.mealsThisWeek} color="#F59E0B" />
          </View>
        </>
      )}

      {/* ── Cardio ─────────────────────────────────────────────────────── */}
      {stats.cardio && (
        <>
          <SectionTitle title="Кардио" />
          <View style={styles.row}>
            <StatCard title="Сессий сегодня" value={stats.cardio.sessionsToday} color="#10B981" />
            <StatCard title="За 7 дней" value={stats.cardio.sessionsThisWeek} color="#10B981" />
          </View>
        </>
      )}

      {/* ── AI — our service ───────────────────────────────────────────── */}
      <SectionTitle title="Наш ИИ-ассистент" />
      <View style={styles.row}>
        <StatCard title="Запросов сегодня" value={stats.ai.requestsToday} />
        <StatCard title="За неделю" value={stats.ai.requestsThisWeek ?? 0} />
        <StatCard
          title="Ошибок сегодня"
          value={stats.ai.errorsToday ?? 0}
          color={(stats.ai.errorsToday ?? 0) > 0 ? '#EF4444' : '#10B981'}
        />
      </View>
      <View style={styles.row}>
        <StatCard title="Сообщ. сегодня" value={stats.ai.messagesToday} />
        <StatCard title="Сообщ. 7 дней" value={stats.ai.messagesThisWeek} trend={stats.trends?.aiWeekVsPrev} />
        <StatCard
          title="Токены (оценка)"
          value={formatTokens(stats.ai.totalTokensEstimate)}
        />
      </View>
      <View style={styles.row}>
        <StatCard
          title="Кеш-хитрейт"
          value={`${stats.ai.cacheHitRate ?? 0}%`}
          color="#10B981"
          sub={`${stats.ai.cacheHits ?? 0} хит / ${stats.ai.cacheMisses ?? 0} мисс`}
        />
        <StatCard
          title="Ср. задержка"
          value={(stats.ai.avgLatencyMs ?? 0) > 0 ? `${stats.ai.avgLatencyMs}мс` : '—'}
          sub={(stats.ai.minLatencyMs ?? 0) > 0
            ? `${stats.ai.minLatencyMs}–${stats.ai.maxLatencyMs}мс`
            : undefined}
          color="#F59E0B"
        />
      </View>

      {/* ── External AI provider ───────────────────────────────────────── */}
      <SectionTitle title="Провайдер ИИ" />
      <View style={styles.providerCard}>
        <View style={styles.providerHeader}>
          <View style={styles.providerDot} />
          <Text style={styles.providerName}>
            {stats.ai.providerDisplayName ?? stats.ai.provider ?? 'Неизвестно'}
          </Text>
        </View>
        <Text style={styles.providerModel}>
          Модель: <Text style={styles.providerModelVal}>{stats.ai.providerModel ?? '—'}</Text>
        </Text>
        <View style={styles.providerStats}>
          <View style={styles.providerStat}>
            <Text style={styles.providerStatLabel}>Запросов к API</Text>
            <Text style={styles.providerStatValue}>{stats.ai.cacheMisses ?? 0}</Text>
          </View>
          <View style={styles.providerStat}>
            <Text style={styles.providerStatLabel}>Ср. латентность</Text>
            <Text style={styles.providerStatValue}>
              {(stats.ai.avgLatencyMs ?? 0) > 0 ? `${stats.ai.avgLatencyMs}мс` : '—'}
            </Text>
          </View>
          <View style={styles.providerStat}>
            <Text style={styles.providerStatLabel}>Ошибок</Text>
            <Text style={[styles.providerStatValue, { color: (stats.ai.errorsToday ?? 0) > 0 ? '#EF4444' : '#10B981' }]}>
              {stats.ai.errorsToday ?? 0}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Support ────────────────────────────────────────────────────── */}
      <SectionTitle title="Поддержка" />
      <View style={styles.row}>
        <StatCard title="Открытых" value={stats.support.openTickets} color="#EF4444" />
        <StatCard title="В работе" value={stats.support.inProgressTickets} color="#F59E0B" />
        <StatCard title="Решено" value={stats.support.resolvedTickets ?? 0} color="#10B981" />
      </View>

      {/* ── Server load ────────────────────────────────────────────────── */}
      <SectionTitle title="Нагрузка на сервер" />
      <View style={styles.memCard}>
        <MemBar
          label="Память процесса (heap)"
          usedMb={stats.server.memoryUsedMb}
          totalMb={stats.server.memoryTotalMb}
          pct={memPct}
          color={memPct > 80 ? '#EF4444' : '#6366F1'}
        />
        <MemBar
          label="Системная память"
          pct={sysPct}
          color={sysPct > 85 ? '#EF4444' : '#F59E0B'}
        />
        <Text style={styles.memLabel}>
          Свободно: {stats.server.systemMemFreeMb} МБ из {stats.server.systemMemTotalMb} МБ
        </Text>

        {stats.server.loadAvg && stats.server.loadAvg.length > 0 && (
          <>
            <View style={[styles.memBar, { marginTop: 12 }]}>
              <View style={[styles.memFill, {
                width: `${Math.min(loadAvg1 * 20, 100)}%`,
                backgroundColor: loadAvg1 > 3 ? '#EF4444' : loadAvg1 > 1.5 ? '#F59E0B' : '#10B981',
              }]} />
            </View>
            <Text style={styles.memLabel}>
              CPU load avg (1м / 5м / 15м): {stats.server.loadAvg.map((v) => v.toFixed(2)).join(' / ')}
            </Text>
          </>
        )}

        <View style={styles.serverInfoRow}>
          <Text style={styles.serverInfoItem}>Аптайм: {formatUptime(stats.server.uptimeSeconds)}</Text>
          <Text style={styles.serverInfoItem}>{stats.server.platform}</Text>
          <Text style={styles.serverInfoItem}>{stats.server.nodeVersion}</Text>
          {stats.server.dbPingMs != null && (
            <Text style={[styles.serverInfoItem, { color: stats.server.dbPingMs > 200 ? '#EF4444' : stats.server.dbPingMs > 80 ? '#F59E0B' : '#10B981' }]}>
              DB: {stats.server.dbPingMs}мс
            </Text>
          )}
        </View>
      </View>

      {/* ── Top active users this week ─────────────────────────────────── */}
      {stats.topActiveUsers && stats.topActiveUsers.length > 0 && (
        <>
          <SectionTitle title="Топ активных (7 дней)" />
          <View style={styles.rolesCard}>
            {stats.topActiveUsers.map((u, i) => (
              <TouchableOpacity
                key={u.userId}
                style={styles.roleRow}
                onPress={() => navigation.navigate('AdminUserDetailScreen', { userId: u.userId })}
              >
                <Text style={styles.roleLabel}>
                  {i + 1}. {u.name}
                </Text>
                <Text style={styles.roleCount}>{u.workouts} тр.</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* ── Subscriptions breakdown ────────────────────────────────────── */}
      {stats.subscriptions.length > 0 && (
        <>
          <SectionTitle title="Детали подписок" />
          <View style={styles.rolesCard}>
            {stats.subscriptions.map((s, i) => (
              <View key={i} style={styles.roleRow}>
                <Text style={styles.roleLabel}>{s.plan} · {s.status}</Text>
                <Text style={styles.roleCount}>{s.count}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center' },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  headerSub: { fontSize: 10, color: '#4B5563' },

  quickSearchRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickSearchInput: {
    flex: 1, backgroundColor: '#1C1C1E', borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 14, color: '#FFFFFF', borderWidth: 1, borderColor: '#2C2C2E',
  },
  quickSearchBtn: { backgroundColor: '#6366F1', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' },
  quickSearchBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  navBtn: { width: '47%', backgroundColor: '#1C1C1E', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2C2C2E' },
  navBtnIcon: { fontSize: 20, marginBottom: 4 },
  navBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 24, marginBottom: 10,
  },

  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14 },
  statTitle: { fontSize: 11, color: '#6B7280', marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#6366F1' },
  statSub: { fontSize: 11, color: '#4B5563', marginTop: 2 },

  // Sparkline card
  sparkCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#2C2C2E' },
  sparkTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  sparkRow: { flexDirection: 'row', gap: 0 },
  sparkItem: { flex: 1, paddingRight: 12 },
  sparkLabel: { fontSize: 11, color: '#9CA3AF', marginBottom: 6 },

  // Revenue card
  revenueCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#2C2C2E' },
  revenueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  revenueTitle: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  revenueNote: { fontSize: 10, color: '#4B5563' },
  revenueValue: { fontSize: 32, fontWeight: '800', color: '#10B981', marginBottom: 12 },
  revenueUnit: { fontSize: 16, fontWeight: '400', color: '#6B7280' },
  revenuePlanRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 4 },
  revenuePlanItem: { backgroundColor: '#2C2C2E', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  revenuePlanName: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  revenuePlanCount: { fontSize: 10, color: '#9CA3AF', marginTop: 1 },
  revenueAlert: { backgroundColor: '#F59E0B12', borderRadius: 8, borderWidth: 1, borderColor: '#F59E0B40', padding: 8, marginTop: 8 },
  revenueAlertText: { fontSize: 12, color: '#F59E0B', fontWeight: '600' },

  // Subscription split bar
  splitCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, marginBottom: 8 },
  splitTitle: { fontSize: 13, color: '#9CA3AF', fontWeight: '600', marginBottom: 12 },
  splitBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#374151' },
  splitFillPaid: { backgroundColor: '#8B5CF6' },
  splitFillFree: { backgroundColor: '#1F2937' },
  splitLegend: { flexDirection: 'row', gap: 20, marginTop: 10, flexWrap: 'wrap' },
  splitLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  splitLegendText: { fontSize: 13, color: '#9CA3AF' },
  splitLegendNum: { color: '#FFFFFF', fontWeight: '700' },
  splitPct: { fontSize: 12, color: '#6B7280', marginTop: 8 },

  rolesCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginBottom: 8 },
  rolesTitle: { fontSize: 13, color: '#9CA3AF', fontWeight: '600', marginBottom: 12 },
  roleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  roleLabel: { color: '#D1D5DB', fontSize: 14 },
  roleCount: { color: '#6366F1', fontSize: 14, fontWeight: '700' },

  // Provider card
  providerCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, marginBottom: 8 },
  providerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  providerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  providerName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  providerModel: { fontSize: 12, color: '#6B7280', marginBottom: 14 },
  providerModelVal: { color: '#9CA3AF', fontWeight: '600' },
  providerStats: { flexDirection: 'row', gap: 0 },
  providerStat: { flex: 1, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: '#2C2C2E', paddingHorizontal: 4 },
  providerStatLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4, textAlign: 'center' },
  providerStatValue: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

  // Memory / server
  memCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, marginBottom: 8 },
  memTitle: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginBottom: 8 },
  memBar: { height: 8, backgroundColor: '#2C2C2E', borderRadius: 4, overflow: 'hidden' },
  memFill: { height: '100%', borderRadius: 4 },
  memLabel: { fontSize: 11, color: '#6B7280', marginTop: 5 },
  serverInfoRow: { flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap' },
  serverInfoItem: { fontSize: 11, color: '#4B5563', backgroundColor: '#2C2C2E', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
});
