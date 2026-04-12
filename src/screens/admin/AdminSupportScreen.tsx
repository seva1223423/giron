import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Alert, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { adminService } from '../../services/adminService';
import { supportService } from '../../services/supportService';
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

function TicketRow({
  ticket, onPress, onLongPress, selected, selectMode,
}: {
  ticket: SupportTicket;
  onPress: () => void;
  onLongPress: () => void;
  selected: boolean;
  selectMode: boolean;
}) {
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
        selected && { backgroundColor: '#6366F115', borderColor: '#6366F150' },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        {selectMode && (
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
            {selected && <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '800' }}>✓</Text>}
          </View>
        )}
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

type SupportMetrics = {
  resolvedToday: number;
  openCount: number;
  unassigned: number;
  avgResponseHours: number | null;
  categoryBreakdown: Record<string, number>;
  staffWorkload?: Array<{ id: string; name: string; count: number }>;
};

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
  const [metrics, setMetrics] = useState<SupportMetrics | null>(null);
  // Bulk select
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'priority' | 'oldest' | 'newest'>('priority');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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
      const [res, cnts, met] = await Promise.all([
        adminService.getSupportTickets({ status: status || undefined, priority: priority || undefined, assignedToMe: assignedToMe || undefined, search: search || undefined, sort: sortOrder, page: p, limit: 20 }),
        p === 1 ? adminService.getSupportCounts() : Promise.resolve(counts),
        p === 1 ? adminService.getSupportMetrics() : Promise.resolve(null),
      ]);
      setTickets(append ? (prev) => [...prev, ...res.tickets] : res.tickets);
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
      if (p === 1) setCounts(cnts as Record<string, number>);
      if (p === 1 && met) setMetrics(met);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [status, assignedToMe, search, sortOrder]);

  useEffect(() => { load(1); }, [status, priority, assignedToMe, search, sortOrder]);

  const loadMore = useCallback(() => {
    if (!loadingMore && page < pages) load(page + 1, true);
  }, [loadingMore, page, pages, load]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const selectAll = useCallback(() => {
    const displayedTickets = needsReplyFilter
      ? tickets.filter((t) => {
          const m = t.messages?.[0];
          return m && !m.isStaff && t.status !== 'closed' && t.status !== 'resolved';
        })
      : tickets;
    setSelected(new Set(displayedTickets.map((t) => t.id)));
  }, [tickets, needsReplyFilter]);

  const bulkUpdate = useCallback(async (update: { status?: TicketStatus; priority?: TicketPriority }) => {
    if (selected.size === 0 || bulkBusy) return;
    const label = update.status === 'closed' ? 'Закрыть' : update.status === 'resolved' ? 'Решить' : 'Эскалировать';
    Alert.alert(
      `${label} ${selected.size} тикетов?`,
      'Это действие изменит выбранные тикеты.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Применить',
          onPress: async () => {
            setBulkBusy(true);
            try {
              await Promise.all(
                Array.from(selected).map((id) =>
                  supportService.updateTicketStatus(id, update)
                )
              );
              exitSelectMode();
              await load(1);
            } catch {
              Alert.alert('Ошибка', 'Не удалось обновить часть тикетов');
            } finally {
              setBulkBusy(false);
            }
          },
        },
      ]
    );
  }, [selected, bulkBusy, exitSelectMode, load]);

  const displayedTickets = tickets.filter((t) => {
    if (needsReplyFilter) {
      const m = t.messages?.[0];
      if (!m || m.isStaff || t.status === 'closed' || t.status === 'resolved') return false;
    }
    if (unassignedOnly && t.assignedToId) return false;
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Performance metrics bar */}
      {metrics && (
        <View style={styles.metricsBar}>
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>{metrics.resolvedToday}</Text>
            <Text style={styles.metricLabel}>Решено сегодня</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={[styles.metricValue, metrics.unassigned > 0 && { color: '#F59E0B' }]}>{metrics.unassigned}</Text>
            <Text style={styles.metricLabel}>Без агента</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={[styles.metricValue, (metrics.avgResponseHours ?? 0) > 8 && { color: '#EF4444' }]}>
              {metrics.avgResponseHours != null ? `${metrics.avgResponseHours}ч` : '—'}
            </Text>
            <Text style={styles.metricLabel}>Ср. ответ (7д)</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>{metrics.openCount}</Text>
            <Text style={styles.metricLabel}>В очереди</Text>
          </View>
        </View>
      )}

      {/* Category breakdown */}
      {metrics && Object.keys(metrics.categoryBreakdown).length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {Object.entries(metrics.categoryBreakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => {
              const CAT_COLORS: Record<string, string> = {
                billing: '#F59E0B', technical: '#EF4444', feature_request: '#6366F1',
                account: '#8B5CF6', bug: '#EF4444', other: '#6B7280',
              };
              const color = CAT_COLORS[cat] ?? '#6B7280';
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, priority === '' && status === '' && { opacity: 1 }]}
                  onPress={() => setSearch(cat === 'feature_request' ? 'feature' : cat)}
                >
                  <Text style={[styles.catCount, { color }]}>{count}</Text>
                  <Text style={styles.catLabel}>{cat.replace('_', ' ')}</Text>
                </TouchableOpacity>
              );
            })}
        </ScrollView>
      )}

      {/* Staff workload */}
      {metrics?.staffWorkload && metrics.staffWorkload.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {metrics.staffWorkload.sort((a, b) => b.count - a.count).map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.catChip, { borderColor: '#10B98140' }]}
              onPress={() => setAssignedToMe(false)}
            >
              <Text style={[styles.catCount, { color: '#10B981' }]}>{s.count}</Text>
              <Text style={styles.catLabel}>{s.name || 'Агент'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

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
        <TouchableOpacity
          style={[styles.priorityBtn, unassignedOnly && { backgroundColor: '#EF444422', borderColor: '#EF444460' }]}
          onPress={() => setUnassignedOnly(!unassignedOnly)}
        >
          <Text style={[styles.priorityText, unassignedOnly && { color: '#EF4444' }]}>
            {unassignedOnly ? '✓ Без агента' : 'Без агента'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.priorityBtn, selectMode && { backgroundColor: '#6366F122', borderColor: '#6366F160' }]}
          onPress={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }}
        >
          <Text style={[styles.priorityText, selectMode && { color: '#6366F1' }]}>
            {selectMode ? `✓ Выбор (${selected.size})` : 'Выбрать'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.priorityRow}>
        {([
          { value: 'priority', label: 'По приоритету' },
          { value: 'oldest', label: 'Сначала старые' },
          { value: 'newest', label: 'Последние' },
        ] as const).map((s) => (
          <TouchableOpacity
            key={s.value}
            style={[styles.priorityBtn, sortOrder === s.value && { backgroundColor: '#6366F122', borderColor: '#6366F160' }]}
            onPress={() => setSortOrder(s.value)}
          >
            <Text style={[styles.priorityText, sortOrder === s.value && { color: '#6366F1' }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={styles.totalLabel}>Всего: {total}</Text>
          {selectMode && (
            <TouchableOpacity onPress={selectAll}>
              <Text style={{ fontSize: 12, color: '#6366F1', fontWeight: '600' }}>Выбрать все</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={exportCSV} disabled={exporting} style={styles.exportBtn}>
          {exporting ? <ActivityIndicator size="small" color="#6366F1" /> : <Text style={styles.exportBtnText}>CSV</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} color="#6366F1" size="large" />
      ) : (
        <FlatList
          data={displayedTickets}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TicketRow
              ticket={item}
              selectMode={selectMode}
              selected={selected.has(item.id)}
              onPress={() => {
                if (selectMode) { toggleSelect(item.id); return; }
                navigation.navigate('AdminTicketScreen', { ticketId: item.id });
              }}
              onLongPress={() => {
                if (selectMode) { toggleSelect(item.id); return; }
                // Quick action context menu
                const isOpen = item.status === 'open' || item.status === 'in_progress';
                const options: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
                  { text: 'Открыть тикет', onPress: () => navigation.navigate('AdminTicketScreen', { ticketId: item.id }) },
                ];
                if (isOpen) {
                  options.push({
                    text: '✓ Пометить решённым',
                    onPress: async () => {
                      try {
                        await supportService.updateTicketStatus(item.id, { status: 'resolved' });
                        load(1);
                      } catch { Alert.alert('Ошибка', 'Не удалось обновить тикет'); }
                    },
                  });
                  options.push({
                    text: '✕ Закрыть',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await supportService.updateTicketStatus(item.id, { status: 'closed' });
                        load(1);
                      } catch { Alert.alert('Ошибка', 'Не удалось закрыть тикет'); }
                    },
                  });
                  if (!item.assignedToId || item.assignedToId !== myId) {
                    options.push({
                      text: '👤 Назначить себе',
                      onPress: async () => {
                        try {
                          await adminService.assignTicket(item.id, myId ?? null);
                          load(1);
                        } catch { Alert.alert('Ошибка', 'Не удалось назначить'); }
                      },
                    });
                  }
                }
                options.push({
                  text: '☑ Выбрать',
                  onPress: () => { setSelectMode(true); toggleSelect(item.id); },
                });
                options.push({ text: 'Отмена', style: 'cancel' });
                Alert.alert(item.subject, `${item.user?.firstName ?? ''} · ${item.status} · ${PRIORITY_LABEL[item.priority]}`, options);
              }}
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

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <View style={styles.bulkBar}>
          {bulkBusy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <TouchableOpacity style={styles.bulkBtn} onPress={() => bulkUpdate({ status: 'resolved' })}>
                <Text style={styles.bulkBtnText}>✓ Решить ({selected.size})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bulkBtn, styles.bulkBtnClose]} onPress={() => bulkUpdate({ status: 'closed' })}>
                <Text style={[styles.bulkBtnText, { color: '#EF4444' }]}>✕ Закрыть ({selected.size})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bulkBtn, { borderColor: '#F59E0B60' }]} onPress={() => bulkUpdate({ priority: 'urgent' })}>
                <Text style={[styles.bulkBtnText, { color: '#F59E0B' }]}>🔴 Urgent</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bulkCancelBtn} onPress={exitSelectMode}>
                <Text style={styles.bulkCancelText}>Отмена</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
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
  totalLabel: { fontSize: 12, color: '#6B7280' },
  center: { flex: 1, justifyContent: 'center' },
  list: { padding: 12, paddingBottom: 80 },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 40, fontSize: 15 },

  card: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2C2C2E' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
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

  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#4B5563',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#6366F1', borderColor: '#6366F1' },

  bulkBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#1C1C1E', borderTopWidth: 1, borderTopColor: '#2C2C2E',
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 24,
  },
  bulkBtn: { flex: 1, backgroundColor: '#10B98122', borderRadius: 10, borderWidth: 1, borderColor: '#10B98150', paddingVertical: 10, alignItems: 'center' },
  bulkBtnClose: { backgroundColor: '#EF444415', borderColor: '#EF444440' },
  bulkBtnText: { fontSize: 13, fontWeight: '700', color: '#10B981' },
  bulkCancelBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  bulkCancelText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },

  metricsBar: { flexDirection: 'row', backgroundColor: '#1C1C1E', borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  metricItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  metricValue: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  metricLabel: { fontSize: 9, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  metricDivider: { width: 1, backgroundColor: '#2C2C2E', marginVertical: 8 },

  catRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  catChip: { alignItems: 'center', backgroundColor: '#1C1C1E', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#2C2C2E', minWidth: 50 },
  catCount: { fontSize: 14, fontWeight: '800' },
  catLabel: { fontSize: 9, color: '#6B7280', textTransform: 'capitalize', marginTop: 1 },
});
