import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { adminService } from '../../services/adminService';
import type { SupportTicket, TicketStatus, TicketPriority } from '../../types';

type AdminNav = NativeStackNavigationProp<any>;

const STATUS_TABS: { value: TicketStatus | ''; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'open', label: 'Открытые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'resolved', label: 'Решённые' },
  { value: 'closed', label: 'Закрытые' },
];
const STATUS_COLOR: Record<TicketStatus, string> = {
  open: '#EF4444', in_progress: '#F59E0B', resolved: '#10B981', closed: '#6B7280',
};
const PRIORITY_COLOR: Record<TicketPriority, string> = {
  urgent: '#EF4444', high: '#F59E0B', normal: '#6366F1', low: '#6B7280',
};
const PRIORITY_LABEL: Record<TicketPriority, string> = {
  urgent: '🔴 Срочно', high: '🟠 Высокий', normal: '🔵 Норм', low: '⚪ Низкий',
};

function TicketRow({ ticket, onPress }: { ticket: SupportTicket; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardTop}>
        <Text style={styles.subject} numberOfLines={1}>{ticket.subject}</Text>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[ticket.status] + '22' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLOR[ticket.status] }]}>{ticket.status}</Text>
        </View>
      </View>
      <View style={styles.cardMid}>
        <Text style={styles.user}>{ticket.user?.firstName} {ticket.user?.lastName} · {ticket.user?.email}</Text>
        <Text style={[styles.priority, { color: PRIORITY_COLOR[ticket.priority] }]}>
          {PRIORITY_LABEL[ticket.priority]}
        </Text>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.date}>{new Date(ticket.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
        {ticket.assignedTo
          ? <Text style={styles.assigned}>→ {ticket.assignedTo.firstName}</Text>
          : <Text style={styles.unassigned}>Не назначен</Text>
        }
      </View>
    </TouchableOpacity>
  );
}

export default function AdminSupportScreen() {
  const navigation = useNavigation<AdminNav>();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async (p: number, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const [res, cnts] = await Promise.all([
        adminService.getSupportTickets({ status: status || undefined, page: p, limit: 20 }),
        p === 1 ? adminService.getSupportCounts() : Promise.resolve(counts),
      ]);
      setTickets(append ? (prev) => [...prev, ...res.tickets] : res.tickets);
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
      if (p === 1) setCounts(cnts as Record<string, number>);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [status]);

  useEffect(() => { load(1); }, [status]);

  const loadMore = useCallback(() => {
    if (!loadingMore && page < pages) load(page + 1, true);
  }, [loadingMore, page, pages, load]);

  return (
    <View style={styles.container}>
      <View style={styles.tabsRow}>
        {STATUS_TABS.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[styles.tab, status === t.value && styles.tabActive]}
            onPress={() => setStatus(t.value as any)}
          >
            <Text style={[styles.tabText, status === t.value && styles.tabTextActive]}>{t.label}</Text>
            {counts[t.value] !== undefined && t.value !== '' && (
              <View style={styles.countBadge}><Text style={styles.countText}>{counts[t.value]}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.totalLabel}>Всего: {total}</Text>

      {loading ? (
        <ActivityIndicator style={styles.center} color="#6366F1" size="large" />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TicketRow
              ticket={item}
              onPress={() => navigation.navigate('AdminTicketScreen', { ticketId: item.id })}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(1)} tintColor="#6366F1" />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#6366F1" style={{ marginVertical: 16 }} /> : null}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Нет тикетов</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 6, flexWrap: 'wrap' },
  tab: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#1C1C1E', gap: 4 },
  tabActive: { backgroundColor: '#6366F1' },
  tabText: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  countBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  countText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700' },
  totalLabel: { fontSize: 12, color: '#6B7280', paddingHorizontal: 16, marginBottom: 4 },
  center: { flex: 1, justifyContent: 'center' },
  list: { padding: 12, paddingBottom: 32 },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 40, fontSize: 15 },
  card: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginBottom: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  subject: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', flex: 1, marginRight: 8 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardMid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  user: { fontSize: 12, color: '#9CA3AF', flex: 1, marginRight: 8 },
  priority: { fontSize: 12, fontWeight: '600' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  date: { fontSize: 11, color: '#6B7280' },
  assigned: { fontSize: 11, color: '#10B981' },
  unassigned: { fontSize: 11, color: '#6B7280' },
});
