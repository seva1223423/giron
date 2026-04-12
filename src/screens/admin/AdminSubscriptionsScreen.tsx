import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Alert, Modal, ScrollView,
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

function SubRow({ sub, onPress, onLongPress }: { sub: Sub; onPress: () => void; onLongPress: () => void }) {
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
      onLongPress={onLongPress}
      delayLongPress={400}
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

  // Broadcast modal
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [bcPlan, setBcPlan] = useState('pro');
  const [bcSubject, setBcSubject] = useState('');
  const [bcMessage, setBcMessage] = useState('');
  const [bcExpiringOnly, setBcExpiringOnly] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

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

  const sendBroadcast = useCallback(async () => {
    if (!bcSubject.trim() || !bcMessage.trim()) {
      Alert.alert('Ошибка', 'Заполните тему и текст сообщения');
      return;
    }
    Alert.alert(
      `Отправить ${bcExpiringOnly ? 'истекающим' : 'всем'} в ${bcPlan.toUpperCase()}?`,
      'Каждому пользователю будет создан тикет поддержки.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отправить',
          onPress: async () => {
            setBroadcasting(true);
            try {
              const { sent, total: t } = await adminService.broadcastToSegment(bcPlan, bcSubject.trim(), bcMessage.trim(), bcExpiringOnly || undefined);
              Alert.alert('Готово', `Отправлено ${sent} из ${t} пользователей`);
              setShowBroadcast(false);
              setBcSubject('');
              setBcMessage('');
            } catch {
              Alert.alert('Ошибка', 'Не удалось отправить рассылку');
            } finally {
              setBroadcasting(false);
            }
          },
        },
      ]
    );
  }, [bcPlan, bcSubject, bcMessage, bcExpiringOnly]);

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
      {/* Broadcast modal */}
      <Modal visible={showBroadcast} transparent animationType="slide" onRequestClose={() => setShowBroadcast(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalSheet} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📢 Рассылка по сегменту</Text>
              <TouchableOpacity onPress={() => setShowBroadcast(false)}>
                <Text style={{ color: '#6B7280', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>Тариф</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {['pro', 'trainer', 'club'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.planBtn, bcPlan === p && { backgroundColor: (PLAN_COLOR[p] ?? '#6366F1') + '22', borderColor: PLAN_COLOR[p] ?? '#6366F1' }]}
                  onPress={() => setBcPlan(p)}
                >
                  <Text style={[styles.planBtnText, bcPlan === p && { color: PLAN_COLOR[p] ?? '#6366F1' }]}>{p.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.toggleBtn, bcExpiringOnly && { backgroundColor: '#F59E0B22', borderColor: '#F59E0B60' }]}
              onPress={() => setBcExpiringOnly(!bcExpiringOnly)}
            >
              <Text style={[styles.toggleBtnText, bcExpiringOnly && { color: '#F59E0B' }]}>
                {bcExpiringOnly ? '✓ Только истекающие (≤14 дн)' : '⏰ Только истекающие (≤14 дн)'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.modalLabel}>Тема</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Тема сообщения..."
              placeholderTextColor="#6B7280"
              value={bcSubject}
              onChangeText={setBcSubject}
              maxLength={200}
            />
            <Text style={styles.modalLabel}>Сообщение</Text>
            <TextInput
              style={[styles.modalInput, { height: 120, textAlignVertical: 'top' }]}
              placeholder="Текст сообщения пользователю..."
              placeholderTextColor="#6B7280"
              value={bcMessage}
              onChangeText={setBcMessage}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.broadcastBtn, broadcasting && { opacity: 0.5 }]}
              onPress={sendBroadcast}
              disabled={broadcasting}
            >
              {broadcasting
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.broadcastBtnText}>Отправить рассылку</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

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
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <TouchableOpacity onPress={() => setShowBroadcast(true)}>
            <Text style={styles.summaryValue}>📢</Text>
          </TouchableOpacity>
          <Text style={styles.summaryLabel}>Рассылка</Text>
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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  modalLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  modalInput: {
    backgroundColor: '#2C2C2E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: '#FFFFFF', marginBottom: 14,
  },
  planBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#2C2C2E',
    borderWidth: 1, borderColor: 'transparent', alignItems: 'center',
  },
  planBtnText: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  toggleBtn: {
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#2C2C2E',
    borderWidth: 1, borderColor: '#3C3C3E', marginBottom: 14, alignItems: 'center',
  },
  toggleBtnText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
  broadcastBtn: { backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  broadcastBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
