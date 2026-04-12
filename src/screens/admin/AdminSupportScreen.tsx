import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { adminService } from '../../services/adminService';
import { useAuthStore } from '../../store/useAuthStore';
import type { SupportTicket, TicketStatus, TicketPriority } from '../../types';

type AdminNav = NativeStackNavigationProp<any>;

const STATUS_TABS: { value: TicketStatus | ''; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'open', label: 'Открытые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'resolved', label: 'Решённые' },
  { value: 'closed', label: 'Закрытые' },
];
const PRIORITY_TABS: { value: TicketPriority | ''; label: string; color: string }[] = [
  { value: '', label: 'Все', color: '#6B7280' },
  { value: 'urgent', label: '🔴 Срочно', color: '#EF4444' },
  { value: 'high', label: '🟠 Высокий', color: '#F59E0B' },
  { value: 'normal', label: '🔵 Норм', color: '#6366F1' },
  { value: 'low', label: '⚪ Низкий', color: '#6B7280' },
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

function formatWait(dateStr: string): { label: string; color: string } {
  const ms = Date.now() - new Date(dateStr).getTime();
  const h = ms / 3600000;
  if (h < 1) return { label: `${Math.round(ms / 60000)}м`, color: '#10B981' };
  if (h < 8) return { label: `${Math.round(h)}ч`, color: '#F59E0B' };
  return { label: `${Math.round(h)}ч`, color: '#EF4444' };
}

function TicketRow({ ticket, onPress }: { ticket: SupportTicket; onPress: () => void }) {
  const isUrgent = ticket.priority === 'urgent' && ticket.status !== 'closed';
  const lastMsg = ticket.messages?.[0];
  const needsReply = lastMsg && !lastMsg.isStaff && ticket.status !== 'closed' && ticket.status !== 'resolved';
  const wait = needsReply && lastMsg ? formatWait(lastMsg.createdAt) : null;
  return (
    <TouchableOpacity
      style={[
        styles.card,
        isUrgent && { borderLeftWidth: 3, borderLeftColor: '#EF4444', borderColor: '#EF444430' },
        needsReply && !isUrgent && { borderLeftWidth: 3, borderLeftColor: '#F59E0B', borderColor: '#F59E0B20' },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <Text style={styles.subject} numberOfLines={1}>{ticket.subject}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {wait && (
            <View style={[styles.waitBadge, { backgroundColor: wait.color + '22' }]}>
              <Text style={[styles.waitText, { color: wait.color }]}>⏱ {wait.label}</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[ticket.status] + '22' }]}>
            <Text style={[styles.statusText, { color: STATUS_COLOR[ticket.status] }]}>{ticket.status}</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardMid}>
        <Text style={styles.user} numberOfLines={1}>{ticket.user?.firstName} {ticket.user?.lastName} · {ticket.user?.email}</Text>
        <Text style={[styles.priority, { color: PRIORITY_COLOR[ticket.priority] }]}>
          {PRIORITY_LABEL[ticket.priority]}
        </Text>
      </View>
      {lastMsg && (
        <Text style={[styles.lastMsg, needsReply && { color: '#9CA3AF' }]} numberOfLines={1}>
          {lastMsg.isStaff ? '↩ ' : '↳ '}{lastMsg.content}
        </Text>
      )}
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
  const myId = useAuthStore((s) => s.user?.id);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [needsReplyFilter, setNeedsReplyFilter] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const exportCSV = useCallback(async () => {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) { Alert.alert('Недоступно', 'Функция недоступна на этом устройстве'); return; }
    setExporting(true);
    try {
      const csv = await adminService.exportTicketsCSV();
      const fileName = `tickets_${new Date().toISOString().split('T')[0]}.csv`;
      const path = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Экспорт тикетов' });
    } catch { Alert.alert('Ошибка', 'Не удалось экспортировать тикеты'); }
    finally { setExporting(false); }
  }, []);

  const load = useCallback(async (p: number, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const [res, cnts] = await Promise.all([
        adminService.getSupportTickets({ status: status || undefined, priority: priority || undefined, assignedToMe: assignedToMe || undefined, search: search || undefined, page: p, limit: 20 }),
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
  }, [status, assignedToMe, search]);

  useEffect(() => { load(1); }, [status, priority, assignedToMe, search]);

  const loadMore = useCallback(() => {
    if (!loadingMore && page < pages) load(page + 1, true);
  }, [loadingMore, page, pages, load]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск по теме, email, имени..."
          placeholderTextColor="#6B7280"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>
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

      <View style={styles.priorityRow}>
        {PRIORITY_TABS.map((p) => (
          <TouchableOpacity
            key={p.value}
            style={[styles.priorityBtn, priority === p.value && { backgroundColor: p.color + '22', borderColor: p.color + '60' }]}
            onPress={() => setPriority(p.value as any)}
          >
            <Text style={[styles.priorityText, priority === p.value && { color: p.color }]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.priorityRow}>
        <TouchableOpacity
          style={[styles.priorityBtn, assignedToMe && { backgroundColor: '#10B98122', borderColor: '#10B98160' }]}
          onPress={() => setAssignedToMe(!assignedToMe)}
        >
          <Text style={[styles.priorityText, assignedToMe && { color: '#10B981' }]}>
            {assignedToMe ? '✓ Мои тикеты' : 'Мои тикеты'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.priorityBtn, needsReplyFilter && { backgroundColor: '#F59E0B22', borderColor: '#F59E0B60' }]}
          onPress={() => setNeedsReplyFilter(!needsReplyFilter)}
        >
          <Text style={[styles.priorityText, needsReplyFilter && { color: '#F59E0B' }]}>
            {needsReplyFilter ? '✓ Ждут ответа' : 'Ждут ответа'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 4 }}>
        <Text style={styles.totalLabel}>Всего: {total}</Text>
        <TouchableOpacity onPress={exportCSV} disabled={exporting} style={styles.exportBtn}>
          {exporting ? <ActivityIndicator size="small" color="#6366F1" /> : <Text style={styles.exportBtnText}>CSV</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} color="#6366F1" size="large" />
      ) : (
        <FlatList
          data={needsReplyFilter
            ? tickets.filter((t) => {
                const m = t.messages?.[0];
                return m && !m.isStaff && t.status !== 'closed' && t.status !== 'resolved';
              })
            : tickets
          }
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
  searchBar: { padding: 12, paddingBottom: 4 },
  searchInput: {
    backgroundColor: '#1C1C1E', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 14, color: '#FFFFFF', borderWidth: 1, borderColor: '#2C2C2E',
  },
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
  lastMsg: { fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginBottom: 6 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  date: { fontSize: 11, color: '#6B7280' },
  assigned: { fontSize: 11, color: '#10B981' },
  unassigned: { fontSize: 11, color: '#6B7280' },
  priorityRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  priorityBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#2C2C2E' },
  priorityText: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  waitBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  waitText: { fontSize: 10, fontWeight: '700' },
  exportBtn: { backgroundColor: '#1C1C1E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#2C2C2E' },
  exportBtnText: { fontSize: 12, color: '#6366F1', fontWeight: '700' },
});
