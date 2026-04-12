import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { adminService } from '../../services/adminService';
import type { AdminUserSummary, UserRole } from '../../types';

type AdminNav = NativeStackNavigationProp<any>;

const ROLES: (UserRole | '')[] = ['', 'client', 'trainer', 'support', 'admin'];
const ROLE_LABEL: Record<string, string> = { '': 'Все', client: 'Клиент', trainer: 'Тренер', support: 'Поддержка', admin: 'Админ', visitor: 'Гость', guest: 'Guest' };
const PLAN_COLOR: Record<string, string> = { free: '#6B7280', pro: '#6366F1', trainer: '#F59E0B', club: '#10B981' };

function UserRow({ user, onPress }: { user: AdminUserSummary; onPress: () => void }) {
  const sub = user.subscription;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user.firstName[0]}{user.lastName?.[0] ?? ''}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
        <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
        <Text style={styles.meta}>{ROLE_LABEL[user.role] ?? user.role} · {user._count.workouts} тренировок</Text>
      </View>
      {sub && (
        <View style={[styles.planBadge, { backgroundColor: (PLAN_COLOR[sub.plan] ?? '#6B7280') + '22' }]}>
          <Text style={[styles.planText, { color: PLAN_COLOR[sub.plan] ?? '#6B7280' }]}>{sub.plan}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function AdminUsersScreen() {
  const navigation = useNavigation<AdminNav>();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (p: number, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res = await adminService.getUsers({ search, role: role || undefined, page: p, limit: 20 });
      setUsers(append ? (prev) => [...prev, ...res.users] : res.users);
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, role]);

  useEffect(() => { load(1); }, [search, role]);

  const loadMore = useCallback(() => {
    if (!loadingMore && page < pages) load(page + 1, true);
  }, [loadingMore, page, pages, load]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск по имени или email..."
          placeholderTextColor="#6B7280"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.filterRow}>
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.filterBtn, role === r && styles.filterBtnActive]}
            onPress={() => setRole(r)}
          >
            <Text style={[styles.filterText, role === r && styles.filterTextActive]}>
              {ROLE_LABEL[r]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.totalLabel}>Всего: {total}</Text>

      {loading ? (
        <ActivityIndicator style={styles.center} color="#6366F1" size="large" />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <UserRow
              user={item}
              onPress={() => navigation.navigate('AdminUserDetailScreen', { userId: item.id })}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(1)} tintColor="#6366F1" />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#6366F1" style={{ marginVertical: 16 }} /> : null}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  searchBar: { padding: 12, paddingBottom: 8 },
  searchInput: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#FFFFFF',
  },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  filterBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#1C1C1E' },
  filterBtnActive: { backgroundColor: '#6366F1' },
  filterText: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  filterTextActive: { color: '#FFFFFF' },
  totalLabel: { fontSize: 12, color: '#6B7280', paddingHorizontal: 16, marginBottom: 4 },
  center: { flex: 1, justifyContent: 'center' },
  list: { paddingHorizontal: 12, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', marginBottom: 2 },
  email: { fontSize: 12, color: '#9CA3AF', marginBottom: 2 },
  meta: { fontSize: 11, color: '#6B7280' },
  planBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  planText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
});
