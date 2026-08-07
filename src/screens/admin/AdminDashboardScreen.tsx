import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity, TextInput, Alert, Share, Modal, FlatList,
  AppState,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { adminService, type AdminMe, type CronHealthResponse } from '../../services/adminService';
import type { AdminStats, AdminAnalytics, AdminLog } from '../../types';

const RECENTLY_VIEWED_KEY = '@admin_recently_viewed_users';
type RecentUser = { id: string; firstName: string; lastName?: string; email: string };

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
  title, value, sub, color = '#D4B07A', trend,
}: {
  title: string; value: string | number; sub?: string; color?: string; trend?: number | null;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
      {trend != null && (
        <Text style={{ fontSize: 10, fontWeight: '700', color: trend > 0 ? '#9AC28C' : trend < 0 ? '#E07A6B' : '#A8A49C', marginTop: 2 }}>
          {trend > 0 ? `↑ +${trend}%` : trend < 0 ? `↓ ${trend}%` : '→ 0%'} vs пред. нед.
        </Text>
      )}
    </View>
  );
}

/** System alert banner */
function AlertBanner({ icon, message, color, onPress }: { icon: string; message: string; color: string; onPress?: () => void }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={[styles.alertBanner, { borderColor: color + '50', backgroundColor: color + '10' }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <Text style={[styles.alertText, { color }]}>{message}</Text>
      {onPress && <Text style={{ fontSize: 12, color, fontWeight: '700' }}>→</Text>}
    </Wrap>
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
          <View style={[styles.legendDot, { backgroundColor: '#D4B07A' }]} />
          <Text style={styles.splitLegendText}>
            С подпиской: <Text style={styles.splitLegendNum}>{withSub}</Text>
          </Text>
        </View>
        <View style={styles.splitLegendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#2A2A2F' }]} />
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [me, setMe] = useState<AdminMe | null>(null);
  const [cronHealth, setCronHealth] = useState<CronHealthResponse | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [quickSearch, setQuickSearch] = useState('');
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [recentLogs, setRecentLogs] = useState<AdminLog[]>([]);
  const [activityFeed, setActivityFeed] = useState<Array<{ id: string; type: string; label: string; userId?: string; date: string }>>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sharingReport, setSharingReport] = useState(false);

  // Global content search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    ai: Array<{ id: string; snippet: string; createdAt: string; user: { id: string; firstName: string; email: string } }>;
    tickets: Array<{ id: string; subject: string; status: string; user: { id: string; firstName: string; email: string } }>;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reload recently viewed whenever the screen comes into focus
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(RECENTLY_VIEWED_KEY).then((raw) => {
      if (raw) setRecentUsers(JSON.parse(raw));
    }).catch(() => {});
  }, []));

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setLoadError(null);
    try {
      // Only /admin/stats is required — everything else is a panel that can
      // sit empty. Two of these already had their own catch with a comment
      // explaining exactly this; the other three did not, so a single failing
      // request left `stats` null and the render below returned null: a blank
      // screen with no error and no retry.
      const [analyticsData, logsData, feedData, meData, cronData] = await Promise.all([
        adminService.getAnalytics(7).catch(() => null),
        adminService.getLogs({ limit: 6 }).catch(() => ({ logs: [] })),
        adminService.getActivityFeed().catch(() => []),
        // /admin/me is uncached and per-actor — degrade gracefully if it
        // 500s so the rest of the dashboard still renders. Founder card
        // simply hides when null.
        adminService.getMe().catch(() => null),
        // Cron health is supplementary — never block the dashboard on it.
        adminService.getCronHealth().catch(() => null),
      ]);
      const statsData = await adminService.getStats();
      setStats(statsData);
      setAnalytics(analyticsData);
      setRecentLogs(logsData.logs);
      setActivityFeed(feedData);
      setMe(meData);
      setCronHealth(cronData);
      setLastRefreshed(new Date());
    } catch {
      setLoadError('Не удалось загрузить панель. Проверь соединение и попробуй ещё раз.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 60 seconds — pause when the app is backgrounded so we're not
    // firing 4 parallel admin-API calls per minute on a locked device.
    const start = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => load(true), 60_000);
    };
    const stop = () => {
      if (!intervalRef.current) return;
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { load(true); start(); } else { stop(); }
    });
    return () => { stop(); sub.remove(); };
  }, []);

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    setSearchResults(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) return;
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await adminService.moderationSearch(q.trim());
        setSearchResults({ ai: res.ai ?? [], tickets: res.tickets ?? [] });
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 500);
  }, []);

  const shareReport = useCallback(async () => {
    setSharingReport(true);
    try {
      const { report } = await adminService.getDailyReport();
      await Share.share({ message: report, title: 'Giron — Дневной отчёт' });
    } catch {
      Alert.alert('Ошибка', 'Не удалось сгенерировать отчёт');
    } finally {
      setSharingReport(false);
    }
  }, []);

  if (loading) return <ActivityIndicator style={styles.center} color="#D4B07A" size="large" />;
  if (!stats) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{loadError ?? 'Панель недоступна.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Prefer the new `rssUsedPct` (resident set / dyno limit) when the
  // server reports it — that's a meaningful pressure signal. Fall back
  // to the legacy heapUsed/heapTotal ratio only for older deploys; that
  // ratio always sits ~70-95% so don't trigger warnings on it.
  const rssPct = (stats.server as any).rssUsedPct as number | undefined;
  const memPct = rssPct ?? Math.round((stats.server.memoryUsedMb / stats.server.memoryTotalMb) * 100);
  const sysPct = stats.server.systemMemUsedPct;
  const loadAvg1 = stats.server.loadAvg?.[0] ?? 0;
  const signups7d = analytics?.timeline.map((t) => t.signups) ?? [];
  const workouts7d = analytics?.timeline.map((t) => t.workouts) ?? [];

  // System health score 0-100
  const healthScore = Math.max(0, Math.round(100
    - ((stats.ai.errorsToday ?? 0) > 0 ? Math.min(25, (stats.ai.errorsToday ?? 0) * 2) : 0)
    - (stats.server.dbPingMs != null && stats.server.dbPingMs > 500 ? 20 : stats.server.dbPingMs != null && stats.server.dbPingMs > 200 ? 5 : 0)
    - (sysPct > 90 ? 20 : sysPct > 75 ? 5 : 0)
    - ((stats.support.overdueTickets ?? 0) > 5 ? 15 : (stats.support.overdueTickets ?? 0) > 0 ? 5 : 0)
    - ((stats.support.urgentTickets ?? 0) > 0 ? 10 : 0)
  ));
  const healthColor = healthScore >= 80 ? '#9AC28C' : healthScore >= 60 ? '#E8A36A' : '#E07A6B';
  const healthLabel = healthScore >= 80 ? 'Отлично' : healthScore >= 60 ? 'Внимание' : 'Проблемы';

  return (
    <>
    {/* Global content search modal */}
    <Modal visible={showSearch} transparent animationType="slide" onRequestClose={() => { setShowSearch(false); setSearchQuery(''); setSearchResults(null); }}>
      <View style={styles.searchModal}>
        <View style={styles.searchModalHeader}>
          <TextInput
            style={styles.searchModalInput}
            placeholder="Поиск по ИИ-сообщениям и тикетам..."
            placeholderTextColor="#A8A49C"
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoFocus
            clearButtonMode="while-editing"
          />
          <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); setSearchResults(null); }}>
            <Text style={{ color: '#A8A49C', fontSize: 16, paddingLeft: 8 }}>✕</Text>
          </TouchableOpacity>
        </View>
        {searching && <ActivityIndicator color="#D4B07A" style={{ marginTop: 24 }} />}
        {searchResults && (
          <FlatList
            data={[
              ...searchResults.tickets.map((t) => ({ _type: 'ticket' as const, ...t })),
              ...searchResults.ai.map((a) => ({ _type: 'ai' as const, ...a })),
            ]}
            keyExtractor={(item) => item._type + item.id}
            ListEmptyComponent={<Text style={styles.searchEmpty}>Ничего не найдено</Text>}
            ListHeaderComponent={
              <Text style={styles.searchResultsHeader}>
                {searchResults.tickets.length} тикетов · {searchResults.ai.length} ИИ-сообщений
              </Text>
            }
            renderItem={({ item }) => {
              if (item._type === 'ticket') {
                const t = item as (typeof searchResults.tickets[0]) & { _type: 'ticket' };
                return (
                  <TouchableOpacity
                    style={styles.searchResultRow}
                    onPress={() => { setShowSearch(false); navigation.navigate('AdminTicketScreen', { ticketId: t.id }); }}
                  >
                    <Text style={styles.searchResultType}>🎫 Тикет</Text>
                    <Text style={styles.searchResultTitle} numberOfLines={1}>{t.subject}</Text>
                    <Text style={styles.searchResultMeta}>{t.user.firstName} · {t.user.email} · {t.status}</Text>
                  </TouchableOpacity>
                );
              }
              const a = item as (typeof searchResults.ai[0]) & { _type: 'ai' };
              return (
                <TouchableOpacity
                  style={styles.searchResultRow}
                  onPress={() => { setShowSearch(false); navigation.navigate('AdminUserDetailScreen', { userId: a.user.id }); }}
                >
                  <Text style={styles.searchResultType}>🤖 ИИ</Text>
                  <Text style={styles.searchResultTitle} numberOfLines={2}>{a.snippet}</Text>
                  <Text style={styles.searchResultMeta}>{a.user.firstName} · {a.user.email}</Text>
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}
        {!searching && !searchResults && searchQuery.length > 0 && searchQuery.length < 2 && (
          <Text style={styles.searchEmpty}>Введите минимум 2 символа</Text>
        )}
        {!searching && !searchResults && searchQuery.length === 0 && (
          <Text style={styles.searchHint}>Поиск по содержимому ИИ-чатов и тикетов поддержки</Text>
        )}
      </View>
    </Modal>

    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#D4B07A" />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerTitle}>Admin Panel</Text>
          {lastRefreshed && (
            <Text style={styles.headerSub}>
              Обновлено: {lastRefreshed.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => setShowSearch(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.reportBtnText}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reportBtn, sharingReport && { opacity: 0.5 }]}
            onPress={shareReport}
            disabled={sharingReport}
            activeOpacity={0.7}
          >
            <Text style={styles.reportBtnText}>{sharingReport ? '⏳' : '📤'}</Text>
          </TouchableOpacity>
          <View style={[styles.healthBadge, { borderColor: healthColor + '60', backgroundColor: healthColor + '15' }]}>
            <Text style={[styles.healthScore, { color: healthColor }]}>{healthScore}</Text>
            <Text style={[styles.healthLabel, { color: healthColor }]}>{healthLabel}</Text>
          </View>
        </View>
      </View>

      {/* System alerts */}
      {(stats.support.urgentTickets ?? 0) > 0 && (
        <AlertBanner icon="🚨" color="#E07A6B" message={`${stats.support.urgentTickets} срочных тикетов требуют внимания`} />
      )}
      {stats.support.openTickets > 5 && !((stats.support.urgentTickets ?? 0) > 0) && (
        <AlertBanner icon="🎧" color="#E8A36A" message={`${stats.support.openTickets} открытых тикетов — нужна обработка`} />
      )}
      {(stats.ai.errorsToday ?? 0) > 10 && (
        <AlertBanner icon="⚠️" color="#E8A36A" message={`${stats.ai.errorsToday} ошибок ИИ сегодня — проверь провайдера`} />
      )}
      {stats.server.dbPingMs != null && stats.server.dbPingMs > 500 && (
        <AlertBanner icon="🐘" color="#E07A6B" message={`DB ping ${stats.server.dbPingMs}мс — возможны проблемы с базой`} />
      )}
      {(stats.server.systemMemUsedPct ?? 0) > 90 && (
        <AlertBanner icon="💾" color="#E07A6B" message={`Системная память ${stats.server.systemMemUsedPct}% — критический уровень`} />
      )}
      {(stats.subsExpiringSoon ?? 0) > 0 && (
        <AlertBanner icon="⏰" color="#E8A36A" message={`${stats.subsExpiringSoon} подписок истекают в ближайшие 7 дней`} onPress={() => navigation.navigate('AdminUsersScreen', { subExpiringSoon: true })} />
      )}
      {(stats.support.overdueTickets ?? 0) > 0 && (
        <AlertBanner icon="🕐" color="#E8A36A" message={`${stats.support.overdueTickets} тикетов без ответа более 24 часов`} onPress={() => navigation.navigate('AdminSupportScreen')} />
      )}
      {(stats.churnRiskUsers ?? 0) > 0 && (
        <AlertBanner icon="⚡" color="#D4B07A" message={`${stats.churnRiskUsers} платных пользователей не тренируются 14+ дней`} onPress={() => navigation.navigate('AdminUsersScreen', { dormant: true })} />
      )}

      {/* Quick nav. "5 ключевых чисел" placed first — it's the screen the
          founder should hit before any product/growth decision. The others
          are tactical (users, support, logs); this one is strategic. */}
      <View style={styles.navGrid}>
        {[
          { label: '5 ключевых чисел', icon: '⭐', screen: 'AdminMetricsKeyScreen' },
          { label: 'Пользователи', icon: '👥', screen: 'AdminUsersScreen' },
          { label: 'Поддержка', icon: '🎧', screen: 'AdminSupportScreen' },
          { label: 'Аналитика', icon: '📈', screen: 'AdminAnalyticsScreen' },
          { label: 'Логи', icon: '📋', screen: 'AdminLogsScreen' },
          { label: 'Объявления', icon: '📣', screen: 'AdminAnnouncementsScreen' },
          { label: 'Подписки', icon: '💳', screen: 'AdminSubscriptionsScreen' },
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
          placeholderTextColor="#A8A49C"
          value={quickSearch}
          onChangeText={setQuickSearch}
          returnKeyType="search"
          onSubmitEditing={() => {
            const q = quickSearch.trim();
            if (!q) return;
            // If it looks like a CUID/UUID, navigate directly to user detail
            if (/^c[a-z0-9]{20,}$/.test(q)) {
              navigation.navigate('AdminUserDetailScreen', { userId: q });
            } else {
              navigation.navigate('AdminUsersScreen', { initialSearch: q });
            }
            setQuickSearch('');
          }}
        />
        {quickSearch.trim().length > 0 && (
          <TouchableOpacity
            style={styles.quickSearchBtn}
            onPress={() => {
              const q = quickSearch.trim();
              if (/^c[a-z0-9]{20,}$/.test(q)) {
                navigation.navigate('AdminUserDetailScreen', { userId: q });
              } else {
                navigation.navigate('AdminUsersScreen', { initialSearch: q });
              }
              setQuickSearch('');
            }}
          >
            <Text style={styles.quickSearchBtnText}>Найти</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Recently viewed users ─────────────────────────────────────── */}
      {recentUsers.length > 0 && (
        <>
          <Text style={styles.recentTitle}>Недавно просмотренные</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
              {recentUsers.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.recentChip}
                  onPress={() => navigation.navigate('AdminUserDetailScreen', { userId: u.id })}
                  activeOpacity={0.7}
                >
                  <View style={styles.recentAvatar}>
                    <Text style={styles.recentAvatarText}>{u.firstName[0]}{u.lastName?.[0] ?? ''}</Text>
                  </View>
                  <View>
                    <Text style={styles.recentName} numberOfLines={1}>{u.firstName} {u.lastName ?? ''}</Text>
                    <Text style={styles.recentEmail} numberOfLines={1}>{u.email}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </>
      )}

      {/* ── Online users now ──────────────────────────────────────────── */}
      {stats.onlineUsers && stats.onlineUsers.length > 0 && (
        <>
          <View style={styles.activityHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#9AC28C' }} />
              <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>
                Онлайн сейчас ({stats.users.activeNow})
              </Text>
            </View>
          </View>
          <View style={styles.onlineRow}>
            {stats.onlineUsers.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={styles.onlineChip}
                onPress={() => navigation.navigate('AdminUserDetailScreen', { userId: u.id })}
              >
                <View style={styles.onlineAvatar}>
                  <Text style={styles.onlineAvatarText}>{u.firstName[0]}{u.lastName?.[0] ?? ''}</Text>
                </View>
                <Text style={styles.onlineName} numberOfLines={1}>{u.firstName}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* ── Your account (founder self-status) ─────────────────────────
          Surfaces the answers to the questions sevka asks every session:
          push tokens registered? activation email fired? subscription?
          Last AI msg / workout? Lets him spot account-specific issues
          (e.g. "why didn't I get the activation push?") without paging
          through user detail screens. Hides if /admin/me 500s. */}
      {me && (
        <View style={styles.meCard}>
          <View style={styles.meHeaderRow}>
            <Text style={styles.quickActionsTitle}>Твой аккаунт</Text>
            <Text style={styles.meHeaderSub}>{me.user.email}</Text>
          </View>
          <View style={styles.meChipRow}>
            {/* Activation funnel state — green if activated, amber if push fired but no first chat, red if neither. */}
            <View style={[
              styles.meChip,
              me.activation.activated
                ? styles.meChipOk
                : me.activation.pushFired || me.activation.emailFired
                  ? styles.meChipWarn
                  : styles.meChipBad,
            ]}>
              <Text style={styles.meChipText}>
                {me.activation.activated
                  ? '✓ Активирован'
                  : me.activation.pushFired || me.activation.emailFired
                    ? '⚠ Напоминание отправлено'
                    : '✗ Не активирован'}
              </Text>
            </View>
            <View style={[styles.meChip, me.pushTokens.count > 0 ? styles.meChipOk : styles.meChipWarn]}>
              <Text style={styles.meChipText}>
                {me.pushTokens.count > 0 ? `🔔 ${me.pushTokens.count} push` : '🔕 Без push'}
              </Text>
            </View>
            <View style={[styles.meChip, me.subscription.plan !== 'free' ? styles.meChipOk : styles.meChipNeutral]}>
              <Text style={styles.meChipText}>
                💳 {me.subscription.plan.toUpperCase()}
              </Text>
            </View>
            <View style={[styles.meChip, me.user.totpEnabled ? styles.meChipOk : styles.meChipWarn]}>
              <Text style={styles.meChipText}>
                {me.user.totpEnabled ? '🔒 2FA' : '🔓 Без 2FA'}
              </Text>
            </View>
            {/* Onboarding completion status — null on legacy accounts.
                Wording note: maxStepReached=N means the user submitted step
                N's data via the Next button (recordStep is fired before
                advancing). So "completed N+1 / 5 steps" reads correctly:
                if they clicked Next on step 0 only, maxStepReached=0 →
                "пройдено 1/5". The previous wording "шаг N/5" was
                ambiguous about whether they were on or had completed N. */}
            {me.onboarding && (
              <View style={[
                styles.meChip,
                me.onboarding.completed
                  ? styles.meChipOk
                  : me.onboarding.maxStepReached !== null
                    ? styles.meChipWarn
                    : styles.meChipNeutral,
              ]}>
                <Text style={styles.meChipText}>
                  {me.onboarding.completed
                    ? '✓ Онбординг'
                    : me.onboarding.maxStepReached !== null
                      ? `→ пройдено ${me.onboarding.maxStepReached + 1}/5`
                      : '○ Онбординг не начат'}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.meStatRow}>
            <View style={styles.meStat}>
              <Text style={styles.meStatLabel}>Push-нудж</Text>
              <Text style={styles.meStatValue}>{me.activation.pushFired ? 'Да' : 'Нет'}</Text>
            </View>
            <View style={styles.meStat}>
              <Text style={styles.meStatLabel}>Email-нудж</Text>
              <Text style={styles.meStatValue}>{me.activation.emailFired ? 'Да' : 'Нет'}</Text>
            </View>
            <View style={styles.meStat}>
              <Text style={styles.meStatLabel}>Сессий</Text>
              <Text style={styles.meStatValue}>{me.activeSessionCount}</Text>
            </View>
            <View style={styles.meStat}>
              <Text style={styles.meStatLabel}>Дней с регистрации</Text>
              <Text style={styles.meStatValue}>{me.activation.daysSinceSignup ?? '—'}</Text>
            </View>
          </View>
          {me.lastChatAt && (
            <Text style={styles.meRow}>
              Последний AI-чат: {new Date(me.lastChatAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
            </Text>
          )}
          {me.lastWorkoutAt && (
            <Text style={styles.meRow}>
              Последняя тренировка: {new Date(me.lastWorkoutAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
              {me.lastWorkoutVolume ? ` · ${Math.round(me.lastWorkoutVolume)}кг объём` : ''}
            </Text>
          )}
          {/* Test notification button — verifies push + email work
              end-to-end from the dashboard without waiting for the
              activation cron tick. Uses Alert for inline feedback. */}
          <TouchableOpacity
            style={styles.meTestBtn}
            onPress={async () => {
              try {
                const result = await adminService.sendTestNotification('both');
                const lines = [
                  `Push: ${result.pushSent ? '✓ отправлено' : '✗ не доставлено'}`,
                  `Email: ${result.emailSent ? '✓ отправлено' : '✗ не доставлено'}`,
                ];
                if (result.errors) {
                  for (const [ch, msg] of Object.entries(result.errors)) {
                    lines.push(`${ch}: ${msg}`);
                  }
                }
                Alert.alert('Тестовое уведомление', lines.join('\n'));
              } catch (e: any) {
                Alert.alert('Ошибка', e?.message ?? 'Не удалось отправить тест');
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.meTestBtnText}>📤 Отправить тестовое уведомление</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Cron health probe ──────────────────────────────────────────
          Lightweight liveness ledger from /admin/cron-health. After a
          fresh deploy this is empty (records are in-memory and reset
          on dyno restart) — that's normal, not a problem. Once each
          cron has fired once, this surfaces "last run was Nh ago" so
          the founder can spot a stuck job without grepping logs. */}
      {cronHealth && cronHealth.cronJobs.length > 0 && (
        <View style={styles.meCard}>
          <View style={styles.meHeaderRow}>
            <Text style={styles.quickActionsTitle}>Cron-задачи</Text>
            <Text style={styles.meHeaderSub}>{cronHealth.cronJobs.length} активных</Text>
          </View>
          {cronHealth.cronJobs.map((job) => {
            const lastTs = job.lastSuccessAt ?? job.lastErrorAt;
            const ageMs = lastTs ? Date.now() - new Date(lastTs).getTime() : null;
            const ageStr = ageMs == null
              ? 'не запускалась'
              : ageMs < 60_000 ? '<1 мин'
              : ageMs < 3_600_000 ? `${Math.round(ageMs / 60_000)} мин назад`
              : ageMs < 86_400_000 ? `${Math.round(ageMs / 3_600_000)} ч назад`
              : `${Math.round(ageMs / 86_400_000)} д назад`;
            const isHealthy = job.lastSuccessAt && (!job.lastErrorAt || new Date(job.lastSuccessAt) > new Date(job.lastErrorAt));
            // Tappable for the 3 manually-runnable crons (retention,
            // weekly-summary, admin-digest). keep-warm and news-refresh
            // are wrapped in trackCron but excluded from the manual
            // trigger endpoint — internal infrastructure.
            const isRunnable = ['retention', 'weekly-summary', 'admin-digest'].includes(job.id);
            const Wrap = isRunnable ? TouchableOpacity : View;
            return (
              <Wrap
                key={job.id}
                style={styles.cronRow}
                onPress={isRunnable ? async () => {
                  Alert.alert(
                    'Запустить cron сейчас?',
                    `${job.id} — обычно запускается по расписанию. Запустить вручную (идемпотентно)?`,
                    [
                      { text: 'Отмена', style: 'cancel' },
                      {
                        text: 'Запустить',
                        onPress: async () => {
                          try {
                            const result = await adminService.runCron(job.id as any);
                            Alert.alert('Cron запущен', `${job.id}\nsent: ${JSON.stringify(result.sent ?? '—')}`);
                            load(true);
                          } catch (e: any) {
                            Alert.alert('Ошибка', e?.response?.data?.error ?? e?.message ?? 'Не удалось запустить cron');
                          }
                        },
                      },
                    ],
                  );
                } : undefined}
                activeOpacity={0.7}
              >
                <View style={[styles.cronDot, { backgroundColor: isHealthy ? '#9AC28C' : '#E07A6B' }]} />
                <Text style={styles.cronName}>{job.id}{isRunnable ? ' ▶' : ''}</Text>
                <Text style={styles.cronAge}>{ageStr}</Text>
                <Text style={styles.cronCounts}>
                  ✓{job.successCount} · ✗{job.errorCount}
                </Text>
              </Wrap>
            );
          })}
        </View>
      )}

      {/* ── Quick actions ────────────────────────────────────────────── */}
      <View style={styles.quickActionsCard}>
        <Text style={styles.quickActionsTitle}>Быстрые действия</Text>
        <View style={styles.quickActionsGrid}>
          {[
            { label: 'Новое объявление', color: '#D4B07A', onPress: () => navigation.navigate('AdminAnnouncementsScreen') },
            { label: 'Срочные тикеты', color: '#E07A6B', onPress: () => navigation.navigate('AdminSupportScreen') },
            { label: 'Экспорт пользователей', color: '#9AC28C', onPress: () => navigation.navigate('AdminUsersScreen') },
            { label: 'Просмотр логов', color: '#E8A36A', onPress: () => navigation.navigate('AdminLogsScreen') },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              style={[styles.quickActionBtn, { borderColor: action.color + '40' }]}
              onPress={action.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionDot, { backgroundColor: action.color }]} />
              <Text style={[styles.quickActionLabel, { color: action.color }]} numberOfLines={2}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Recent admin activity ─────────────────────────────────────── */}
      {recentLogs.length > 0 && (
        <>
          <View style={styles.activityHeader}>
            <Text style={styles.sectionTitle}>Последние действия</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AdminLogsScreen')}>
              <Text style={styles.activityMore}>Все →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.activityCard}>
            {recentLogs.map((log, idx) => {
              const ACTION_ICONS: Record<string, string> = {
                CHANGE_ROLE: '🎭', CHANGE_SUBSCRIPTION: '💳', BAN_USER: '⛔',
                UNBAN_USER: '✅', DELETE_USER: '🗑', UPDATE_NOTE: '📝',
                CLOSE_TICKET: '🎫', REPLY_TICKET: '💬', EXPORT_USERS: '📤',
              };
              const icon = ACTION_ICONS[log.action] ?? '•';
              const isLast = idx === recentLogs.length - 1;
              return (
                <View key={log.id} style={[styles.activityRow, !isLast && styles.activityRowBorder]}>
                  <Text style={styles.activityIcon}>{icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityAction}>{log.action}</Text>
                    <Text style={styles.activityAdmin} numberOfLines={1}>
                      {log.admin.firstName} {log.admin.lastName ?? ''} {log.details ? `· ${log.details}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.activityTime}>
                    {new Date(log.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── Recent signups today ──────────────────────────────────────── */}
      {stats.recentSignups && stats.recentSignups.length > 0 && (
        <>
          <View style={styles.activityHeader}>
            <Text style={styles.sectionTitle}>Новые сегодня</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AdminUsersScreen')}>
              <Text style={styles.activityMore}>Все →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.signupsRow}>
            {stats.recentSignups.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={styles.signupChip}
                onPress={() => navigation.navigate('AdminUserDetailScreen', { userId: u.id })}
              >
                <Text style={styles.signupAvatar}>{u.firstName.charAt(0).toUpperCase()}</Text>
                <Text style={styles.signupName} numberOfLines={1}>{u.firstName}</Text>
                <Text style={styles.signupTime}>
                  {new Date(u.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* ── Live activity feed ──────────────────────────────────────────── */}
      {activityFeed.length > 0 && (
        <>
          <SectionTitle title="Лента активности" />
          <View style={styles.feedCard}>
            {activityFeed.slice(0, 8).map((ev) => {
              const TYPE_META: Record<string, { icon: string; color: string }> = {
                // signup and ai were gold and purple before the palette
                // migration sent both to gold, which made the feed a single
                // colour for two different kinds of event.
                workout: { icon: '💪', color: '#E8A36A' },
                signup:  { icon: '🆕', color: '#D4B07A' },
                ai:      { icon: '🤖', color: '#9AC28C' },
                cardio:  { icon: '🏃', color: '#E07A6B' },
              };
              const meta = TYPE_META[ev.type] ?? { icon: '•', color: '#A8A49C' };
              const timeAgo = (() => {
                const ms = Date.now() - new Date(ev.date).getTime();
                const m = Math.floor(ms / 60000);
                if (m < 1) return 'только что';
                if (m < 60) return `${m}м назад`;
                const h = Math.floor(m / 60);
                if (h < 24) return `${h}ч назад`;
                return new Date(ev.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
              })();
              return (
                <TouchableOpacity
                  key={ev.id}
                  style={styles.feedRow}
                  onPress={() => ev.userId && navigation.navigate('AdminUserDetailScreen', { userId: ev.userId })}
                  activeOpacity={ev.userId ? 0.7 : 1}
                >
                  <View style={[styles.feedIcon, { backgroundColor: meta.color + '20' }]}>
                    <Text style={{ fontSize: 12 }}>{meta.icon}</Text>
                  </View>
                  <Text style={styles.feedLabel} numberOfLines={1}>{ev.label}</Text>
                  <Text style={styles.feedTime}>{timeAgo}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* ── 7-day activity sparklines ──────────────────────────────────── */}
      {signups7d.length > 0 && (
        <View style={styles.sparkCard}>
          <Text style={styles.sparkTitle}>Активность за 7 дней</Text>
          <View style={styles.sparkRow}>
            <View style={styles.sparkItem}>
              <Text style={styles.sparkLabel}>Регистрации</Text>
              <Sparkline values={signups7d} color="#D4B07A" />
            </View>
            <View style={[styles.sparkItem, { borderLeftWidth: 1, borderLeftColor: '#1E1E22', paddingLeft: 12 }]}>
              <Text style={styles.sparkLabel}>Тренировки</Text>
              <Sparkline values={workouts7d} color="#E8A36A" />
            </View>
          </View>
        </View>
      )}

      {/* ── Today vs Yesterday ─────────────────────────────────────────── */}
      {stats.todayVsYesterday && (
        <>
          <SectionTitle title="Сегодня vs вчера" />
          <View style={styles.todayGrid}>
            {(
              [
                { label: 'Регистрации', d: stats.todayVsYesterday.signups, color: '#D4B07A' },
                { label: 'Тренировки', d: stats.todayVsYesterday.workouts, color: '#E8A36A' },
                { label: 'ИИ-сообщ.', d: stats.todayVsYesterday.ai, color: '#E07A6B' },
                { label: 'Питание', d: stats.todayVsYesterday.meals, color: '#9AC28C' },
                { label: 'Кардио', d: stats.todayVsYesterday.cardio, color: '#B8945F' },
              ] as Array<{ label: string; d: { today: number; yesterday: number }; color: string }>
            ).map(({ label, d, color }) => {
              const delta = d.today - d.yesterday;
              const pct = d.yesterday > 0 ? Math.round((delta / d.yesterday) * 100) : null;
              return (
                <View key={label} style={styles.todayCell}>
                  <Text style={styles.todayCellLabel}>{label}</Text>
                  <Text style={[styles.todayCellValue, { color }]}>{d.today}</Text>
                  <Text style={[styles.todayCellDelta, {
                    color: delta > 0 ? '#9AC28C' : delta < 0 ? '#E07A6B' : '#A8A49C',
                  }]}>
                    {delta > 0 ? `↑ +${delta}` : delta < 0 ? `↓ ${delta}` : '→ 0'}
                    {pct != null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}
                  </Text>
                  <Text style={styles.todayCellYest}>вчера: {d.yesterday}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── Hourly activity pulse ──────────────────────────────────────── */}
      {stats.hourlyPulse && stats.hourlyPulse.some((v) => v > 0) && (
        <>
          <SectionTitle title="Пульс активности сегодня" />
          <View style={styles.pulseCard}>
            {(() => {
              const max = Math.max(...stats.hourlyPulse!, 1);
              const now = new Date().getHours();
              return (
                <>
                  <View style={styles.pulseBars}>
                    {stats.hourlyPulse!.map((v, h) => {
                      const barH = Math.max(2, Math.round((v / max) * 36));
                      const isCurrent = h === now;
                      const isPast = h < now;
                      return (
                        <View key={h} style={styles.pulseBarCol}>
                          <View style={[
                            styles.pulseBar,
                            { height: barH },
                            isCurrent && { backgroundColor: '#D4B07A' },
                            !isCurrent && isPast && v > 0 && { backgroundColor: '#D4B07A80' },
                            !isCurrent && !isPast && { backgroundColor: '#1E1E22' },
                          ]} />
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.pulseLabels}>
                    {[0, 6, 12, 18, 23].map((h) => (
                      <Text key={h} style={styles.pulseLabel}>{h}:00</Text>
                    ))}
                  </View>
                  <Text style={styles.pulseSub}>
                    Пик: {stats.hourlyPulse!.indexOf(max)}:00 — {max} действий · текущий час выделен
                  </Text>
                </>
              );
            })()}
          </View>
        </>
      )}

      {/* ── Users ──────────────────────────────────────────────────────── */}
      <SectionTitle title="Пользователи" />
      <View style={styles.row}>
        <StatCard title="Всего" value={stats.users.total} />
        <StatCard title="Онлайн (5м)" value={stats.users.activeNow} color="#9AC28C" />
        <StatCard title="За час" value={stats.users.activeHour} color="#E8A36A" />
      </View>
      <View style={styles.row}>
        <StatCard title="Сегодня" value={stats.users.newToday} sub="новых" />
        <StatCard title="7 дней" value={stats.users.newThisWeek} sub="новых" trend={stats.trends?.usersWeekVsPrev} />
        <StatCard title="30 дней" value={stats.users.newThisMonth} sub="новых" />
      </View>
      {(stats.users.banned ?? 0) > 0 && (
        <View style={styles.row}>
          <StatCard title="Заблокировано" value={stats.users.banned ?? 0} color="#E07A6B" sub="пользователей" />
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
        <StatCard title="Всего" value={stats.workouts.total ?? 0} sub="в базе" color="#A8A49C" />
      </View>

      {/* ── Nutrition ──────────────────────────────────────────────────── */}
      {stats.nutrition && (
        <>
          <SectionTitle title="Питание" />
          <View style={styles.row}>
            <StatCard title="Приёмов сегодня" value={stats.nutrition.mealsToday} color="#E8A36A" />
            <StatCard title="За 7 дней" value={stats.nutrition.mealsThisWeek} color="#E8A36A" />
          </View>
        </>
      )}

      {/* ── Cardio ─────────────────────────────────────────────────────── */}
      {stats.cardio && (
        <>
          <SectionTitle title="Кардио" />
          <View style={styles.row}>
            <StatCard title="Сессий сегодня" value={stats.cardio.sessionsToday} color="#9AC28C" />
            <StatCard title="За 7 дней" value={stats.cardio.sessionsThisWeek} color="#9AC28C" />
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
          color={(stats.ai.errorsToday ?? 0) > 0 ? '#E07A6B' : '#9AC28C'}
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
          color="#9AC28C"
          sub={`${stats.ai.cacheHits ?? 0} хит / ${stats.ai.cacheMisses ?? 0} мисс`}
        />
        <StatCard
          title="p95 задержка"
          // p95 is the right "user-felt slowness" indicator — avg gets dragged
          // around by Mistral cold-start spikes. Falls back to avgLatency on
          // older server builds that don't return the percentile block.
          value={(stats.ai.p95LatencyMs ?? stats.ai.avgLatencyMs ?? 0) > 0
            ? `${stats.ai.p95LatencyMs ?? stats.ai.avgLatencyMs}мс`
            : '—'}
          sub={(stats.ai.p50LatencyMs ?? 0) > 0
            ? `p50 ${stats.ai.p50LatencyMs}мс · n=${stats.ai.latencySampleSize ?? 0}`
            : (stats.ai.minLatencyMs ?? 0) > 0
              ? `${stats.ai.minLatencyMs}–${stats.ai.maxLatencyMs}мс`
              : undefined}
          color={(stats.ai.p95LatencyMs ?? 0) > 5000 ? '#E07A6B' : (stats.ai.p95LatencyMs ?? 0) > 2500 ? '#E8A36A' : '#9AC28C'}
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
            <Text style={[styles.providerStatValue, { color: (stats.ai.errorsToday ?? 0) > 0 ? '#E07A6B' : '#9AC28C' }]}>
              {stats.ai.errorsToday ?? 0}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Support ────────────────────────────────────────────────────── */}
      <SectionTitle title="Поддержка" />
      <View style={styles.row}>
        <StatCard title="Открытых" value={stats.support.openTickets} color="#E07A6B" />
        <StatCard title="В работе" value={stats.support.inProgressTickets} color="#E8A36A" />
        <StatCard title="Решено" value={stats.support.resolvedTickets ?? 0} color="#9AC28C" />
        {(stats.support.urgentTickets ?? 0) > 0 && (
          <StatCard title="Срочных" value={stats.support.urgentTickets ?? 0} color="#E07A6B" />
        )}
        {(stats.support.overdueTickets ?? 0) > 0 && (
          <StatCard title="Просрочено" value={stats.support.overdueTickets ?? 0} color="#E8A36A" sub=">24ч без ответа" />
        )}
      </View>

      {/* ── Announcements ──────────────────────────────────────────────── */}
      {(stats.activeAnnouncements ?? 0) > 0 && (
        <>
          <SectionTitle title="Объявления" />
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.statCard, { borderWidth: 1, borderColor: '#D4B07A20' }]}
              onPress={() => navigation.navigate('AdminAnnouncementsScreen')}
            >
              <Text style={styles.statTitle}>Активных</Text>
              <Text style={[styles.statValue, { color: '#D4B07A' }]}>{stats.activeAnnouncements}</Text>
              <Text style={styles.statSub}>Нажми для управления</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Server load ────────────────────────────────────────────────── */}
      <SectionTitle title="Нагрузка на сервер" />
      <View style={styles.memCard}>
        <MemBar
          label="Память процесса (heap)"
          usedMb={stats.server.memoryUsedMb}
          totalMb={stats.server.memoryTotalMb}
          pct={memPct}
          color={memPct > 80 ? '#E07A6B' : '#D4B07A'}
        />
        <MemBar
          label="Системная память"
          pct={sysPct}
          color={sysPct > 85 ? '#E07A6B' : '#E8A36A'}
        />
        <Text style={styles.memLabel}>
          Свободно: {stats.server.systemMemFreeMb} МБ из {stats.server.systemMemTotalMb} МБ
        </Text>

        {stats.server.loadAvg && stats.server.loadAvg.length > 0 && (
          <>
            <View style={[styles.memBar, { marginTop: 12 }]}>
              <View style={[styles.memFill, {
                width: `${Math.min(loadAvg1 * 20, 100)}%`,
                backgroundColor: loadAvg1 > 3 ? '#E07A6B' : loadAvg1 > 1.5 ? '#E8A36A' : '#9AC28C',
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
            <Text style={[styles.serverInfoItem, { color: stats.server.dbPingMs > 200 ? '#E07A6B' : stats.server.dbPingMs > 80 ? '#E8A36A' : '#9AC28C' }]}>
              DB: {stats.server.dbPingMs}мс
            </Text>
          )}
        </View>
      </View>

      {/* ── DAU ────────────────────────────────────────────────────────── */}
      {stats.dau && (
        <View style={styles.row}>
          <StatCard title="DAU (трен.)" value={stats.dau.workoutUsers} sub="уник. польз. сегодня" color="#E8A36A" />
          <StatCard title="DAU (ИИ)" value={stats.dau.aiUsers} sub="уник. польз. сегодня" color="#D4B07A" />
        </View>
      )}

      {/* ── MAU ────────────────────────────────────────────────────────── */}
      {stats.mau && (
        <View style={styles.row}>
          <StatCard title="MAU (трен.)" value={stats.mau.workoutUsers} sub="уник. польз. за 30 дн." color="#E8A36A" />
          <StatCard title="MAU (ИИ)" value={stats.mau.aiUsers} sub="уник. польз. за 30 дн." color="#D4B07A" />
        </View>
      )}

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

      {/* ── Top AI users this week ─────────────────────────────────────── */}
      {stats.topAiActiveUsers && stats.topAiActiveUsers.length > 0 && (
        <>
          <SectionTitle title="Топ ИИ-пользователей (7 дней)" />
          <View style={styles.rolesCard}>
            {stats.topAiActiveUsers.map((u, i) => (
              <TouchableOpacity
                key={u.userId}
                style={styles.roleRow}
                onPress={() => navigation.navigate('AdminUserDetailScreen', { userId: u.userId })}
              >
                <Text style={styles.roleLabel}>{i + 1}. {u.name}</Text>
                <Text style={styles.roleCount}>{u.messages} сообщ.</Text>
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

      {/* ── User demographics ──────────────────────────────────────────── */}
      {stats.demographics && (
        <>
          <SectionTitle title="Демография пользователей" />
          {(() => {
            const GOAL_LABEL: Record<string, string> = {
              weight_loss: 'Похудение', muscle_gain: 'Набор массы',
              strength: 'Сила', endurance: 'Выносливость',
              flexibility: 'Гибкость', general_fitness: 'Общий фитнес',
            };
            const LEVEL_LABEL: Record<string, string> = {
              beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый', expert: 'Эксперт',
            };
            const goalEntries = Object.entries(stats.demographics!.goals).sort((a, b) => b[1] - a[1]);
            const levelEntries = Object.entries(stats.demographics!.levels).sort((a, b) => b[1] - a[1]);
            const genderEntries = Object.entries(stats.demographics!.genders);
            const maxGoal = Math.max(...goalEntries.map((e) => e[1]), 1);
            const maxLevel = Math.max(...levelEntries.map((e) => e[1]), 1);
            return (
              <View style={styles.demoCard}>
                <Text style={styles.demoSubtitle}>Цели</Text>
                {goalEntries.map(([goal, count]) => (
                  <View key={goal} style={styles.demoRow}>
                    <Text style={styles.demoLabel}>{GOAL_LABEL[goal] ?? goal}</Text>
                    <View style={styles.demoBarWrap}>
                      <View style={[styles.demoBar, { width: `${Math.round((count / maxGoal) * 100)}%` }]} />
                    </View>
                    <Text style={styles.demoCount}>{count}</Text>
                  </View>
                ))}
                <Text style={[styles.demoSubtitle, { marginTop: 12 }]}>Уровень</Text>
                {levelEntries.map(([level, count]) => (
                  <View key={level} style={styles.demoRow}>
                    <Text style={styles.demoLabel}>{LEVEL_LABEL[level] ?? level}</Text>
                    <View style={styles.demoBarWrap}>
                      <View style={[styles.demoBar, { width: `${Math.round((count / maxLevel) * 100)}%`, backgroundColor: '#E8A36A' }]} />
                    </View>
                    <Text style={styles.demoCount}>{count}</Text>
                  </View>
                ))}
                {genderEntries.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                    {genderEntries.map(([gender, count]) => {
                      const g = String(gender).toLowerCase();
                      const male = g === 'male';
                      return (
                      <View key={gender} style={styles.genderChip}>
                        <Text style={styles.genderIcon}>{male ? '♂' : '♀'}</Text>
                        <Text style={styles.genderLabel}>{male ? 'Муж.' : 'Жен.'}</Text>
                        <Text style={styles.genderCount}>{count}</Text>
                      </View>
                    );
                    })}
                  </View>
                )}
              </View>
            );
          })()}
        </>
      )}
    </ScrollView>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0E0F' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center' },
  errorBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  errorText: { fontSize: 14, color: '#A8A49C', textAlign: 'center', lineHeight: 20 },
  retryBtn: { backgroundColor: '#D4B07A', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { fontSize: 14, fontWeight: '700', color: '#17171A' },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  headerSub: { fontSize: 10, color: '#2A2A2F' },
  reportBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#17171A', borderWidth: 1, borderColor: '#2A2A2F', alignItems: 'center', justifyContent: 'center' },
  reportBtnText: { fontSize: 16 },

  searchModal: { flex: 1, backgroundColor: '#0E0E0F', paddingTop: 56 },
  searchModalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1E1E22' },
  searchModalInput: { flex: 1, backgroundColor: '#17171A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#FFFFFF', borderWidth: 1, borderColor: '#1E1E22' },
  searchEmpty: { textAlign: 'center', color: '#A8A49C', fontSize: 15, marginTop: 40 },
  searchHint: { textAlign: 'center', color: '#2A2A2F', fontSize: 14, marginTop: 40, paddingHorizontal: 32 },
  searchResultsHeader: { fontSize: 11, color: '#A8A49C', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingVertical: 10 },
  searchResultRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#17171A' },
  searchResultType: { fontSize: 10, color: '#A8A49C', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  searchResultTitle: { fontSize: 14, color: '#FFFFFF', lineHeight: 20, marginBottom: 3 },
  searchResultMeta: { fontSize: 12, color: '#A8A49C' },
  healthBadge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  healthScore: { fontSize: 20, fontWeight: '900' },
  healthLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  quickSearchRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickSearchInput: {
    flex: 1, backgroundColor: '#17171A', borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 14, color: '#FFFFFF', borderWidth: 1, borderColor: '#1E1E22',
  },
  quickSearchBtn: { backgroundColor: '#D4B07A', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' },
  quickSearchBtnText: { color: '#17171A', fontWeight: '700', fontSize: 13 },

  navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  navBtn: { width: '47%', backgroundColor: '#17171A', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1E1E22' },
  navBtnIcon: { fontSize: 20, marginBottom: 4 },
  navBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

  recentTitle: { fontSize: 11, fontWeight: '700', color: '#A8A49C', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  recentChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#17171A', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#1E1E22', maxWidth: 160 },
  recentAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#D4B07A33', borderWidth: 1, borderColor: '#D4B07A', justifyContent: 'center', alignItems: 'center' },
  recentAvatarText: { fontSize: 12, fontWeight: '700', color: '#D4B07A' },
  recentName: { fontSize: 12, fontWeight: '600', color: '#FFFFFF', maxWidth: 110 },
  recentEmail: { fontSize: 10, color: '#A8A49C', maxWidth: 110 },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#A8A49C',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 24, marginBottom: 10,
  },

  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 8 },
  activityMore: { fontSize: 12, color: '#D4B07A', fontWeight: '600' },
  activityCard: { backgroundColor: '#17171A', borderRadius: 12, borderWidth: 1, borderColor: '#1E1E22', marginBottom: 8 },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1E22' },
  activityIcon: { fontSize: 14, marginTop: 1 },
  activityAction: { fontSize: 12, fontWeight: '700', color: '#F4F1EA', marginBottom: 2 },
  activityAdmin: { fontSize: 11, color: '#A8A49C' },
  activityTime: { fontSize: 10, color: '#2A2A2F', marginTop: 2 },

  signupsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  signupChip: { alignItems: 'center', backgroundColor: '#17171A', borderRadius: 12, borderWidth: 1, borderColor: '#1E1E22', paddingVertical: 8, paddingHorizontal: 12, minWidth: 70 },
  signupAvatar: { fontSize: 18, fontWeight: '700', color: '#D4B07A', marginBottom: 2 },
  signupName: { fontSize: 11, fontWeight: '600', color: '#F4F1EA', marginBottom: 2, maxWidth: 64, textAlign: 'center' },
  signupTime: { fontSize: 10, color: '#A8A49C' },

  // Online users
  onlineRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  onlineChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#9AC28C15', borderRadius: 20, borderWidth: 1, borderColor: '#9AC28C40', paddingVertical: 4, paddingHorizontal: 8 },
  onlineAvatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#9AC28C30', justifyContent: 'center', alignItems: 'center' },
  onlineAvatarText: { fontSize: 9, fontWeight: '700', color: '#9AC28C' },
  onlineName: { fontSize: 11, color: '#9AC28C', fontWeight: '600', maxWidth: 70 },

  // Founder self-status card (/admin/me)
  meCard: { backgroundColor: '#17171A', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#D4B07A40' },
  meHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  meHeaderSub: { fontSize: 11, color: '#A8A49C' },
  meChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  meChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  meChipOk: { backgroundColor: '#9AC28C15', borderColor: '#9AC28C40' },
  meChipWarn: { backgroundColor: '#E8A36A15', borderColor: '#E8A36A40' },
  meChipBad: { backgroundColor: '#E07A6B15', borderColor: '#E07A6B40' },
  meChipNeutral: { backgroundColor: '#A8A49C15', borderColor: '#A8A49C40' },
  meChipText: { fontSize: 11, fontWeight: '600', color: '#F4F1EA' },
  meStatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  meStat: { minWidth: '22%' },
  meStatLabel: { fontSize: 9, color: '#A8A49C', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  meStatValue: { fontSize: 14, color: '#F4F1EA', fontWeight: '700' },
  meRow: { fontSize: 11, color: '#A8A49C', marginTop: 2 },
  meTestBtn: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#D4B07A40', backgroundColor: '#D4B07A10', alignItems: 'center' },
  meTestBtnText: { fontSize: 12, fontWeight: '600', color: '#D4B07A' },
  cronRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  cronDot: { width: 8, height: 8, borderRadius: 4 },
  cronName: { flex: 1, fontSize: 12, color: '#F4F1EA', fontWeight: '600' },
  cronAge: { fontSize: 11, color: '#A8A49C' },
  cronCounts: { fontSize: 10, color: '#A8A49C', minWidth: 60, textAlign: 'right' },

  // Quick actions card
  quickActionsCard: { backgroundColor: '#17171A', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#1E1E22' },
  quickActionsTitle: { fontSize: 11, fontWeight: '700', color: '#A8A49C', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickActionBtn: { flex: 1, minWidth: '45%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0E0E0F', borderRadius: 10, borderWidth: 1, padding: 10 },
  quickActionDot: { width: 8, height: 8, borderRadius: 4 },
  quickActionLabel: { fontSize: 12, fontWeight: '600', flex: 1 },

  // Hourly pulse
  pulseCard: { backgroundColor: '#17171A', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1E1E22' },
  pulseBars: { flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 1 },
  pulseBarCol: { flex: 1, justifyContent: 'flex-end', height: 40 },
  pulseBar: { width: '80%', borderRadius: 2, backgroundColor: '#1E1E22' },
  pulseLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  pulseLabel: { fontSize: 8, color: '#2A2A2F' },
  pulseSub: { fontSize: 10, color: '#A8A49C', marginTop: 4 },

  // Today vs Yesterday grid
  todayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  todayCell: { backgroundColor: '#17171A', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#1E1E22', minWidth: '18%', flex: 1, alignItems: 'center' },
  todayCellLabel: { fontSize: 9, color: '#A8A49C', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, textAlign: 'center' },
  todayCellValue: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  todayCellDelta: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  todayCellYest: { fontSize: 9, color: '#2A2A2F' },

  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: '#17171A', borderRadius: 12, padding: 14 },
  statTitle: { fontSize: 11, color: '#A8A49C', marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#D4B07A' },
  statSub: { fontSize: 11, color: '#2A2A2F', marginTop: 2 },

  // Alert banners
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8 },
  alertText: { fontSize: 13, fontWeight: '600', flex: 1 },

  // Activity feed
  feedCard: { backgroundColor: '#17171A', borderRadius: 12, overflow: 'hidden', marginBottom: 8, borderWidth: 1, borderColor: '#1E1E22' },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E22' },
  feedIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  feedLabel: { flex: 1, fontSize: 12, color: '#F4F1EA' },
  feedTime: { fontSize: 10, color: '#2A2A2F', flexShrink: 0 },

  // Sparkline card
  sparkCard: { backgroundColor: '#17171A', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1E1E22' },
  sparkTitle: { fontSize: 11, fontWeight: '700', color: '#A8A49C', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  sparkRow: { flexDirection: 'row', gap: 0 },
  sparkItem: { flex: 1, paddingRight: 12 },
  sparkLabel: { fontSize: 11, color: '#A8A49C', marginBottom: 6 },

  // Revenue card
  revenueCard: { backgroundColor: '#17171A', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#1E1E22' },
  revenueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  revenueTitle: { fontSize: 13, color: '#A8A49C', fontWeight: '600' },
  revenueNote: { fontSize: 10, color: '#2A2A2F' },
  revenueValue: { fontSize: 32, fontWeight: '800', color: '#9AC28C', marginBottom: 12 },
  revenueUnit: { fontSize: 16, fontWeight: '400', color: '#A8A49C' },
  revenuePlanRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 4 },
  revenuePlanItem: { backgroundColor: '#1E1E22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  revenuePlanName: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  revenuePlanCount: { fontSize: 10, color: '#A8A49C', marginTop: 1 },
  revenueAlert: { backgroundColor: '#E8A36A12', borderRadius: 8, borderWidth: 1, borderColor: '#E8A36A40', padding: 8, marginTop: 8 },
  revenueAlertText: { fontSize: 12, color: '#E8A36A', fontWeight: '600' },

  // Subscription split bar
  splitCard: { backgroundColor: '#17171A', borderRadius: 12, padding: 16, marginBottom: 8 },
  splitTitle: { fontSize: 13, color: '#A8A49C', fontWeight: '600', marginBottom: 12 },
  splitBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#2A2A2F' },
  splitFillPaid: { backgroundColor: '#D4B07A' },
  splitFillFree: { backgroundColor: '#17171A' },
  splitLegend: { flexDirection: 'row', gap: 20, marginTop: 10, flexWrap: 'wrap' },
  splitLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  splitLegendText: { fontSize: 13, color: '#A8A49C' },
  splitLegendNum: { color: '#FFFFFF', fontWeight: '700' },
  splitPct: { fontSize: 12, color: '#A8A49C', marginTop: 8 },

  rolesCard: { backgroundColor: '#17171A', borderRadius: 12, padding: 14, marginBottom: 8 },
  rolesTitle: { fontSize: 13, color: '#A8A49C', fontWeight: '600', marginBottom: 12 },
  roleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#1E1E22' },
  roleLabel: { color: '#F4F1EA', fontSize: 14 },
  roleCount: { color: '#D4B07A', fontSize: 14, fontWeight: '700' },

  // Provider card
  providerCard: { backgroundColor: '#17171A', borderRadius: 12, padding: 16, marginBottom: 8 },
  providerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  providerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#9AC28C' },
  providerName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  providerModel: { fontSize: 12, color: '#A8A49C', marginBottom: 14 },
  providerModelVal: { color: '#A8A49C', fontWeight: '600' },
  providerStats: { flexDirection: 'row', gap: 0 },
  providerStat: { flex: 1, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: '#1E1E22', paddingHorizontal: 4 },
  providerStatLabel: { fontSize: 11, color: '#A8A49C', marginBottom: 4, textAlign: 'center' },
  providerStatValue: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

  // Memory / server
  memCard: { backgroundColor: '#17171A', borderRadius: 12, padding: 16, marginBottom: 8 },
  memTitle: { fontSize: 12, color: '#A8A49C', fontWeight: '600', marginBottom: 8 },
  memBar: { height: 8, backgroundColor: '#1E1E22', borderRadius: 4, overflow: 'hidden' },
  memFill: { height: '100%', borderRadius: 4 },
  memLabel: { fontSize: 11, color: '#A8A49C', marginTop: 5 },
  serverInfoRow: { flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap' },
  serverInfoItem: { fontSize: 11, color: '#2A2A2F', backgroundColor: '#1E1E22', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },

  demoCard: { backgroundColor: '#17171A', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#1E1E22' },
  demoSubtitle: { fontSize: 11, fontWeight: '700', color: '#A8A49C', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  demoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  demoLabel: { fontSize: 12, color: '#A8A49C', width: 110 },
  demoBarWrap: { flex: 1, height: 6, backgroundColor: '#1E1E22', borderRadius: 3, overflow: 'hidden' },
  demoBar: { height: '100%', backgroundColor: '#D4B07A', borderRadius: 3 },
  demoCount: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', width: 28, textAlign: 'right' },
  genderChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1E1E22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  genderIcon: { fontSize: 16, color: '#A8A49C' },
  genderLabel: { fontSize: 12, color: '#A8A49C' },
  genderCount: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
