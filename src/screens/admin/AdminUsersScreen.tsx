import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { adminService } from '../../services/adminService';
import type { AdminUserSummary, UserRole } from '../../types';

type AdminNav = NativeStackNavigationProp<any>;

const ROLES: (UserRole | '')[] = ['', 'client', 'trainer', 'support', 'admin'];
const ROLE_LABEL: Record<string, string> = {
  '': 'Все', client: 'Клиент', trainer: 'Тренер',
  support: 'Поддержка', admin: 'Админ', visitor: 'Гость', guest: 'Guest',
};
const PLAN_COLOR: Record<string, string> = {
  free: '#6B7280', pro: '#6366F1', trainer: '#F59E0B', club: '#10B981',
};

// Quickly grant/revoke subscription inline from the list
function SubActions({ user, onDone }: { user: AdminUserSummary; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const sub = user.subscription;
  const currentPlan = sub?.plan ?? 'free';
  const isActive = sub?.status === 'active' && currentPlan !== 'free';

  const grant = (plan: 'pro' | 'trainer' | 'club') => {
    Alert.alert(
      `Выдать подписку "${plan}"?`,
      `Пользователь ${user.firstName} ${user.lastName ?? ''} получит план ${plan}.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выдать',
          onPress: async () => {
            setBusy(true);
            try {
              await adminService.changeUserSubscription(user.id, { plan, status: 'active' });
              onDone();
            } catch {
              Alert.alert('Ошибка', 'Не удалось выдать подписку');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const revoke = () => {
    Alert.alert(
      'Отозвать подписку?',
      `Пользователь ${user.firstName} ${user.lastName ?? ''} будет переведён на бесплатный план.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отозвать',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await adminService.changeUserSubscription(user.id, { plan: 'free', status: 'cancelled' });
              onDone();
            } catch {
              Alert.alert('Ошибка', 'Не удалось отозвать подписку');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  if (busy) return <ActivityIndicator size="small" color="#6366F1" />;

  return (
    <View style={subStyles.row}>
      {isActive ? (
        <TouchableOpacity style={[subStyles.btn, subStyles.revokeBtn]} onPress={revoke}>
          <Text style={[subStyles.btnText, { color: '#EF4444' }]}>Отозвать</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity style={[subStyles.btn, { borderColor: PLAN_COLOR.pro }]} onPress={() => grant('pro')}>
            <Text style={[subStyles.btnText, { color: PLAN_COLOR.pro }]}>PRO</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[subStyles.btn, { borderColor: PLAN_COLOR.club }]} onPress={() => grant('club')}>
            <Text style={[subStyles.btnText, { color: PLAN_COLOR.club }]}>Club</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const subStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, marginTop: 8 },
  btn: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  revokeBtn: { borderColor: '#EF4444' },
  btnText: { fontSize: 11, fontWeight: '700' },
});

function UserRow({
  user, onPress, onRefresh,
}: {
  user: AdminUserSummary;
  onPress: () => void;
  onRefresh: () => void;
}) {
  const sub = user.subscription;
  const planColor = PLAN_COLOR[sub?.plan ?? 'free'] ?? '#6B7280';

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowTop} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.avatar, { backgroundColor: planColor + '33', borderColor: planColor }]}>
          <Text style={[styles.avatarText, { color: planColor }]}>
            {user.firstName[0]}{user.lastName?.[0] ?? ''}
          </Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
          <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text style={styles.meta}>{ROLE_LABEL[user.role] ?? user.role}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.meta}>{user._count.workouts} тренировок</Text>
            {sub && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <View style={[styles.planBadge, { backgroundColor: planColor + '22' }]}>
                  <Text style={[styles.planText, { color: planColor }]}>{sub.plan}</Text>
                </View>
              </>
            )}
          </View>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
      <SubActions user={user} onDone={onRefresh} />
    </View>
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
    } catch {
      if (p === 1) Alert.alert('Ошибка', 'Не удалось загрузить список пользователей');
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
          clearButtonMode="while-editing"
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
              onRefresh={() => load(1)}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => load(1)} tintColor="#6366F1" />
          }
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator color="#6366F1" style={{ marginVertical: 16 }} />
              : null
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
    borderWidth: 1,
    borderColor: '#2C2C2E',
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
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5,
  },
  avatarText: { fontSize: 16, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', marginBottom: 1 },
  email: { fontSize: 12, color: '#9CA3AF', marginBottom: 2 },
  meta: { fontSize: 11, color: '#6B7280' },
  metaDot: { fontSize: 11, color: '#374151' },
  arrow: { fontSize: 20, color: '#4B5563' },
  planBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  planText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
});
