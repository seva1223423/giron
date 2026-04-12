import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { adminService } from '../../services/adminService';

type AdminNav = NativeStackNavigationProp<any>;

type Sub = {
  id: string; plan: string; status: string; endDate: string | null; createdAt: string;
  user: { id: string; firstName: string; lastName?: string | null; email: string; isBanned: boolean };
};

const PLAN_COLOR: Record<string, string> = { pro: '#6366F1', trainer: '#F59E0B', club: '#10B981' };
const PLAN_PRICE: Record<string, number> = { pro: 9.99, trainer: 19.99, club: 29.99 };
const STATUS_COLOR: Record<string, string> = { active: '#10B981', cancelled: '#F59E0B', expired: '#EF4444' };

const FILTER_TABS = [
  { value: '', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'expiringSoon', label: '⏰ Скоро истекают' },
  { value: 'cancelled', label: 'Отменены' },
  { value: 'expired', label: 'Истекли' },
];

const PLAN_TABS = [
  { value: '', label: 'Все тарифы' },
  { value: 'pro', label: 'PRO' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'club', label: 'Club' },
];

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function SubRow({ sub, onPress }: { sub: Sub; onPress: () => void }) {
  const planColor = PLAN_COLOR[sub.plan] ?? '#6B7280';
  const statusColor = STATUS_COLOR[sub.status] ?? '#6B7280';
  const days = daysUntil(sub.endDate);
  const isExpiringSoon = days !== null && days >= 0 && days <= 14 && sub.status === 'active';
  const isOverdue = days !== null && days < 0;

  return (
    <TouchableOpacity
      style={[
        styles.row,
        isExpiringSoon && { borderLeftWidth: 3, borderLeftColor: '#F59E0B', borderColor: '#F59E0B20' },
        isOverdue && sub.status === 'active' && { borderLeftWidth: 3, borderLeftColor: '#EF4444', borderColor: '#EF444420' },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.planBadge, { backgroundColor: planColor + '22', borderColor: planColor + '60' }]}>
          <Text style={[styles.planText, { color: planColor }]}>{sub.plan.toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName} numberOfLines={1}>
            {sub.user.firstName} {sub.user.lastName ?? ''}
            {sub.user.isBanned && <Text style={{ color: '#EF4444' }}> 🔒</Text>}
          </Text>
          <Text style={styles.userEmail} numberOfLines={1}>{sub.user.email}</Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{sub.status}</Text>
        </View>
        {sub.endDate && (
          <Text style={[
            styles.expiryText,
            isExpiringSoon && { color: '#F59E0B', fontWeight: '700' },
            isOverdue && { color: '#EF4444', fontWeight: '700' },
          ]}>
            {days !== null && days >= 0
              ? `${days}д`
              : days !== null && days < 0
                ? `−${Math.abs(days)}д`
                : '—'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function AdminSubscriptionsScreen() {
  const navigation = useNavigation<AdminNav>();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('');
  const [plan, setPlan] = useState('');
  const [sort, setSort] = useState<'endDate' | 'createdAt'>('endDate');
  const [mrr, setMrr] = useState(0);

  const load = useCallback(async (p: number, append = false) => {
    if (p === 1 && !append) { if (!refreshing) setLoading(true); }
    else setLoadingMore(true);

    const params: Parameters<typeof adminService.getSubscriptions>[0] = {
      page: p, limit: 30, sort,
    };
    if (plan) params.plan = plan;
    if (filter === 'expiringSoon') params.expiringSoon = true;
    else if (filter) params.status = filter;

    try {
      const res = await adminService.getSubscriptions(params);
      setSubs(append ? (prev) => [...prev, ...res.subscriptions] : res.subscriptions);
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
      if (p === 1 && !append) {
        // Compute MRR from active subs in response (for filtered view, it's partial)
        const mrrVal = res.subscriptions
          .filter((s) => s.status === 'active')
          .reduce((sum, s) => sum + (PLAN_PRICE[s.plan] ?? 0), 0);
        setMrr(mrrVal);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [filter, plan, sort, refreshing]);

  useEffect(() => { load(1); }, [filter, plan, sort]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(1);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!loadingMore && page < pages) load(page + 1, true);
  }, [loadingMore, page, pages, load]);

  const extendSub = useCallback(async (sub: Sub, days: number) => {
    try {
      const currentEnd = sub.endDate ? new Date(sub.endDate) : new Date();
      if (currentEnd < new Date()) currentEnd.setTime(Date.now());
      currentEnd.setDate(currentEnd.getDate() + days);
      await adminService.changeUserSubscription(sub.user.id, {
        plan: sub.plan as any,
        status: 'active',
        endDate: currentEnd.toISOString().split('T')[0],
      });
      Alert.alert('Готово', `Подписка продлена на ${days} дней`);
      load(1);
    } catch {
      Alert.alert('Ошибка', 'Не удалось продлить подписку');
    }
  }, [load]);

  const onLongPress = useCallback((sub: Sub) => {
    Alert.alert(
      `${sub.user.firstName} — ${sub.plan.toUpperCase()}`,
      `Статус: ${sub.status}\nИстекает: ${sub.endDate ? new Date(sub.endDate).toLocaleDateString('ru-RU') : 'нет'}`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: '➕ +30 дней', onPress: () => extendSub(sub, 30) },
        { text: '➕ +90 дней', onPress: () => extendSub(sub, 90) },
        {
          text: 'Перейти к пользователю',
          onPress: () => navigation.navigate('AdminUserDetailScreen', { userId: sub.user.id }),
        },
      ]
    );
  }, [extendSub, navigation]);

  return (
    <View style={styles.container}>
      {/* MRR summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{total}</Text>
          <Text style={styles.summaryLabel}>Подписок</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#10B981' }]}>${mrr.toFixed(0)}</Text>
          <Text style={styles.summaryLabel}>MRR (страница)</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <TouchableOpacity onPress={() => setSort(sort === 'endDate' ? 'createdAt' : 'endDate')}>
            <Text style={styles.summaryValue}>
              {sort === 'endDate' ? '📅 По сроку' : '🕐 По дате'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.summaryLabel}>Сортировка</Text>
        </View>
      </View>

      {/* Plan filter */}
      <FlatList
        horizontal
        data={PLAN_TABS}
        keyExtractor={(t) => t.value}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.tab, plan === item.value && styles.tabActive]}
            onPress={() => setPlan(item.value)}
          >
            <Text style={[styles.tabText, plan === item.value && { color: item.value ? PLAN_COLOR[item.value] ?? '#6366F1' : '#6366F1' }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Status filter */}
      <FlatList
        horizontal
        data={FILTER_TABS}
        keyExtractor={(t) => t.value}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.tab, filter === item.value && styles.tabActive]}
            onPress={() => setFilter(item.value)}
          >
            <Text style={[styles.tabText, filter === item.value && { color: '#6366F1' }]}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <ActivityIndicator style={styles.center} color="#6366F1" size="large" />
      ) : (
        <FlatList
          data={subs}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <SubRow
              sub={item}
              onPress={() => navigation.navigate('AdminUserDetailScreen', { userId: item.user.id })}
              onLongPress={() => onLongPress(item)}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#6366F1" style={{ padding: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.empty}><Text style={styles.emptyText}>Подписок не найдено</Text></View>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  summaryBar: {
    flexDirection: 'row', backgroundColor: '#1C1C1E',
    borderBottomWidth: 1, borderBottomColor: '#2C2C2E', paddingVertical: 10,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  summaryLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: '#2C2C2E', marginVertical: 4 },

  tabsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#2C2C2E',
  },
  tabActive: { backgroundColor: '#6366F115', borderColor: '#6366F160' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1C1C1E', marginHorizontal: 12, marginVertical: 4,
    borderRadius: 12, borderWidth: 1, borderColor: '#2C2C2E', padding: 12,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  planBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  planText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  userName: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  userEmail: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  expiryText: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },

  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: '#6B7280' },
});
