import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl,
  TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { adminService } from '../../services/adminService';
import type { AdminLog } from '../../types';

const ACTION_META: Record<string, { color: string; icon: string; label: string }> = {
  CHANGE_ROLE:         { color: '#6366F1', icon: '🎭', label: 'Роль' },
  CHANGE_SUBSCRIPTION: { color: '#F59E0B', icon: '💳', label: 'Подписка' },
  BAN_USER:            { color: '#EF4444', icon: '⛔', label: 'Бан' },
  UNBAN_USER:          { color: '#10B981', icon: '✅', label: 'Разбан' },
  DELETE_USER:         { color: '#EF4444', icon: '🗑', label: 'Удаление' },
  UPDATE_NOTE:         { color: '#9CA3AF', icon: '📝', label: 'Заметка' },
  CLOSE_TICKET:        { color: '#6B7280', icon: '🎫', label: 'Тикет' },
  REPLY_TICKET:        { color: '#6B7280', icon: '💬', label: 'Ответ' },
  EXPORT_USERS:        { color: '#10B981', icon: '📤', label: 'Экспорт' },
  ASSIGN_TICKET:       { color: '#8B5CF6', icon: '👤', label: 'Назначение' },
  SEND_MESSAGE:        { color: '#6366F1', icon: '💬', label: 'Сообщение' },
};

const ACTION_FILTERS = ['', ...Object.keys(ACTION_META)];

// Date range presets
type DatePreset = 'all' | 'today' | 'week' | 'month';
const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all',   label: 'Всё время' },
  { key: 'today', label: 'Сегодня' },
  { key: 'week',  label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
];

function getDateRange(preset: DatePreset): { from?: string; to?: string } {
  const now = new Date();
  if (preset === 'all') return {};
  if (preset === 'today') {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    return { from: from.toISOString() };
  }
  if (preset === 'week') {
    const from = new Date(now); from.setDate(from.getDate() - 7);
    return { from: from.toISOString() };
  }
  if (preset === 'month') {
    const from = new Date(now); from.setDate(from.getDate() - 30);
    return { from: from.toISOString() };
  }
  return {};
}

function LogRow({ log, onUserPress }: { log: AdminLog; onUserPress: (id: string) => void }) {
  const meta = ACTION_META[log.action] ?? { color: '#6B7280', icon: '•', label: log.action };
  const hasUserTarget = log.targetId && log.action !== 'EXPORT_USERS';
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={[styles.iconBadge, { backgroundColor: meta.color + '22' }]}>
          <Text style={{ fontSize: 14 }}>{meta.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={[styles.actionBadge, { backgroundColor: meta.color + '22' }]}>
            <Text style={[styles.actionText, { color: meta.color }]}>{log.action}</Text>
          </View>
          <Text style={styles.admin}>{log.admin.firstName} {log.admin.lastName ?? ''} · {log.admin.email}</Text>
        </View>
        <Text style={styles.date}>
          {new Date(log.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      {log.targetId && (
        <TouchableOpacity
          onPress={() => hasUserTarget && onUserPress(log.targetId!)}
          disabled={!hasUserTarget}
        >
          <Text style={[styles.target, hasUserTarget && { color: '#6366F190', textDecorationLine: 'underline' }]}>
            {hasUserTarget ? 'Открыть пользователя' : `ID: ${log.targetId}`}
          </Text>
        </TouchableOpacity>
      )}
      {log.details && <Text style={styles.details}>{log.details}</Text>}
    </View>
  );
}

export default function AdminLogsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchDebounced(text), 400);
  };

  const load = useCallback(async (p: number, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const range = getDateRange(datePreset);
      const data = await adminService.getLogs({
        page: p,
        limit: 50,
        action: actionFilter || undefined,
        search: searchDebounced.trim() || undefined,
        from: range.from,
        to: range.to,
      });
      setLogs(append ? (prev) => [...prev, ...data.logs] : data.logs);
      setTotal(data.total);
      setPage(p);
      setPages(data.pages);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [actionFilter, datePreset, searchDebounced]);

  useEffect(() => { load(1); }, [actionFilter, datePreset, searchDebounced]);

  const loadMore = useCallback(() => {
    if (!loadingMore && page < pages) load(page + 1, true);
  }, [loadingMore, page, pages, load]);

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={handleSearchChange}
          placeholder="Поиск по админу или деталям..."
          placeholderTextColor="#4B5563"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Date preset chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateFilters}>
        {DATE_PRESETS.map((d) => (
          <TouchableOpacity
            key={d.key}
            style={[styles.dateChip, datePreset === d.key && styles.dateChipActive]}
            onPress={() => setDatePreset(d.key)}
          >
            <Text style={[styles.dateChipText, datePreset === d.key && { color: '#FFFFFF' }]}>{d.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Action filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {ACTION_FILTERS.map((a) => {
          const m = ACTION_META[a];
          const isActive = actionFilter === a;
          return (
            <TouchableOpacity
              key={a}
              style={[styles.filterChip, isActive && { backgroundColor: (m?.color ?? '#6366F1') }]}
              onPress={() => setActionFilter(a)}
            >
              {m && <Text style={{ fontSize: 11, marginRight: 4 }}>{m.icon}</Text>}
              <Text style={[styles.filterText, isActive && { color: '#FFFFFF' }]}>
                {m?.label ?? 'Все'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.totalLabel}>
        Записей: {total}{searchDebounced ? ` (поиск: "${searchDebounced}")` : ''}
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.center} color="#6366F1" size="large" />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => (
            <LogRow
              log={item}
              onUserPress={(id) => navigation.navigate('AdminUserDetailScreen', { userId: id })}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(1)} tintColor="#6366F1" />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#6366F1" style={{ marginVertical: 16 }} /> : null}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Нет записей</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  center: { flex: 1, justifyContent: 'center' },

  searchRow: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  searchInput: {
    backgroundColor: '#1C1C1E', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: '#FFFFFF', borderWidth: 1, borderColor: '#2C2C2E',
  },

  dateFilters: { paddingHorizontal: 12, paddingBottom: 6, gap: 6 },
  dateChip: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#2C2C2E',
  },
  dateChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  dateChipText: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },

  filters: { paddingHorizontal: 12, paddingVertical: 4, gap: 6 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#1C1C1E',
  },
  filterText: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },

  totalLabel: { fontSize: 12, color: '#6B7280', paddingHorizontal: 16, marginBottom: 4 },
  list: { padding: 12, paddingBottom: 32 },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 40, fontSize: 15 },
  row: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2C2C2E' },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  iconBadge: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 4 },
  actionText: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 11, color: '#6B7280' },
  admin: { fontSize: 12, color: '#9CA3AF' },
  target: { fontSize: 11, color: '#6B7280', marginTop: 4, fontFamily: 'monospace' },
  details: { fontSize: 13, color: '#D1D5DB', marginTop: 4, fontStyle: 'italic' },
});
