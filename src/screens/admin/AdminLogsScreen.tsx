import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { adminService } from '../../services/adminService';
import type { AdminLog } from '../../types';

const ACTION_COLOR: Record<string, string> = {
  CHANGE_ROLE: '#6366F1',
  CHANGE_SUBSCRIPTION: '#F59E0B',
};

function LogRow({ log }: { log: AdminLog }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={[styles.actionBadge, { backgroundColor: (ACTION_COLOR[log.action] ?? '#6B7280') + '22' }]}>
          <Text style={[styles.actionText, { color: ACTION_COLOR[log.action] ?? '#9CA3AF' }]}>{log.action}</Text>
        </View>
        <Text style={styles.date}>
          {new Date(log.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <Text style={styles.admin}>Администратор: {log.admin.firstName} {log.admin.lastName}</Text>
      {log.targetId && <Text style={styles.target}>Цель: {log.targetId}</Text>}
      {log.details && <Text style={styles.details}>{log.details}</Text>}
    </View>
  );
}

export default function AdminLogsScreen() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (p: number, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const data = await adminService.getLogs({ page: p, limit: 50 });
      setLogs(append ? (prev) => [...prev, ...data] : data);
      setPage(p);
      setHasMore(data.length === 50);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(1); }, []);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) load(page + 1, true);
  }, [loadingMore, hasMore, page, load]);

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={styles.center} color="#6366F1" size="large" />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => <LogRow log={item} />}
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
  list: { padding: 12, paddingBottom: 32 },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 40, fontSize: 15 },
  row: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginBottom: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  actionBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  actionText: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 11, color: '#6B7280' },
  admin: { fontSize: 13, color: '#9CA3AF', marginBottom: 4 },
  target: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  details: { fontSize: 13, color: '#FFFFFF', marginTop: 4, fontStyle: 'italic' },
});
