import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { adminService } from '../../services/adminService';
import type { AdminUserSummary, UserRole } from '../../types';

type AdminNav = NativeStackNavigationProp<any>;

const ROLES: (UserRole | '')[] = ['', 'client', 'trainer', 'support', 'admin'];
const ROLE_LABEL: Record<string, string> = {
  '': 'Все', client: 'Клиент', trainer: 'Тренер',
  support: 'Поддержка', admin: 'Админ', visitor: 'Гость', guest: 'Guest',
};
const SORT_OPTIONS = [
  { sort: 'createdAt', order: 'desc' as const, label: 'Новые' },
  { sort: 'createdAt', order: 'asc' as const, label: 'Старые' },
  { sort: 'firstName', order: 'asc' as const, label: 'А→Я' },
  { sort: 'email', order: 'asc' as const, label: 'Email' },
];

const PLAN_FILTERS = [
  { key: '', label: 'Все планы' },
  { key: 'pro', label: 'PRO' },
  { key: 'trainer', label: 'Trainer' },
  { key: 'club', label: 'Club' },
  { key: 'free', label: 'Free' },
];
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

const DAY_MS = 86400 * 1000;

function engagementScore(user: AdminUserSummary): number {
  const workoutPts = Math.min(user._count.workouts * 2, 50);
  const aiPts = Math.min(user._count.chatMessages, 25);
  const subPts = user.subscription?.plan && user.subscription.plan !== 'free' ? 25 : 0;
  return Math.round(workoutPts + aiPts + subPts);
}

function engColor(score: number): string {
  if (score >= 70) return '#10B981';
  if (score >= 35) return '#F59E0B';
  return '#EF4444';
}

function UserRow({
  user, onPress, onRefresh,
}: {
  user: AdminUserSummary;
  onPress: () => void;
  onRefresh: () => void;
}) {
  const handleLongPress = useCallback(() => {
    const options: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: 'Подробнее', onPress },
    ];
    if (user.isBanned) {
      options.push({
        text: 'Разблокировать',
        onPress: async () => {
          try {
            await adminService.unbanUser(user.id);
            onRefresh();
          } catch {
            Alert.alert('Ошибка', 'Не удалось разблокировать');
          }
        },
      });
    } else {
      options.push({
        text: 'Заблокировать',
        style: 'destructive',
        onPress: () => {
          Alert.prompt(
            'Причина блокировки',
            `Укажи причину для ${user.firstName}:`,
            async (reason) => {
              if (!reason?.trim()) return;
              try {
                await adminService.banUser(user.id, reason.trim());
                onRefresh();
              } catch {
                Alert.alert('Ошибка', 'Не удалось заблокировать');
              }
            },
            'plain-text'
          );
        },
      });
    }
    options.push({ text: 'Отмена', style: 'cancel' });
    Alert.alert(`${user.firstName} ${user.lastName ?? ''}`, user.email, options);
  }, [user, onPress, onRefresh]);
  const sub = user.subscription;
  const planColor = PLAN_COLOR[sub?.plan ?? 'free'] ?? '#6B7280';
  const isNew = Date.now() - new Date(user.createdAt).getTime() < DAY_MS;
  const lastWorkoutAt = user.workouts?.[0]?.completedAt;
  const daysSinceWorkout = lastWorkoutAt
    ? Math.floor((Date.now() - new Date(lastWorkoutAt).getTime()) / DAY_MS)
    : null;
  const score = engagementScore(user);
  const scoreColor = engColor(score);
  // Churn risk: was active (5+ workouts) but hasn't trained in 21+ days
  const isChurnRisk = !user.isBanned && user._count.workouts >= 5 && daysSinceWorkout !== null && daysSinceWorkout >= 21;

  return (
    <View style={[styles.row, user.isBanned && styles.rowBanned, isChurnRisk && styles.rowChurn]}>
      <TouchableOpacity style={styles.rowTop} onPress={onPress} onLongPress={handleLongPress} delayLongPress={400} activeOpacity={0.7}>
        <View style={[styles.avatar, { backgroundColor: user.isBanned ? '#EF444433' : planColor + '33', borderColor: user.isBanned ? '#EF4444' : planColor }]}>
          <Text style={[styles.avatarText, { color: user.isBanned ? '#EF4444' : planColor }]}>
            {user.firstName[0]}{user.lastName?.[0] ?? ''}
          </Text>
        </View>
        <View style={styles.info}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
            {user.isBanned && (
              <View style={styles.bannedBadge}><Text style={styles.bannedText}>БАН</Text></View>
            )}
            {isNew && !user.isBanned && (
              <View style={styles.newBadge}><Text style={styles.newText}>NEW</Text></View>
            )}
            {isChurnRisk && (
              <View style={styles.churnBadge}><Text style={styles.churnText}>CHURN</Text></View>
            )}
          </View>
          <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            <Text style={styles.meta}>{ROLE_LABEL[user.role] ?? user.role}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.meta}>{user._count.workouts} тр</Text>
            {daysSinceWorkout !== null && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={[styles.meta, daysSinceWorkout > 14 && { color: '#EF444480' }]}>
                  {daysSinceWorkout === 0 ? 'сегодня' : `${daysSinceWorkout}д назад`}
                </Text>
              </>
            )}
            {sub && sub.plan !== 'free' && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <View style={[styles.planBadge, { backgroundColor: planColor + '22', borderWidth: 1, borderColor: planColor + '50' }]}>
                  <Text style={[styles.planText, { color: planColor }]}>{sub.plan.toUpperCase()}</Text>
                </View>
              </>
            )}
          </View>
          {user.isBanned && user.banReason && (
            <Text style={styles.banReason} numberOfLines={1}>Причина: {user.banReason}</Text>
          )}
        </View>
        {/* Engagement score badge */}
        <View style={styles.scoreCol}>
          <View style={[styles.scoreBadge, { borderColor: scoreColor + '60', backgroundColor: scoreColor + '18' }]}>
            <Text style={[styles.scoreNum, { color: scoreColor }]}>{score}</Text>
          </View>
          <Text style={styles.scoreLabel}>eng</Text>
        </View>
      </TouchableOpacity>
      {!user.isBanned && <SubActions user={user} onDone={onRefresh} />}
    </View>
  );
}

export default function AdminUsersScreen() {
  const navigation = useNavigation<AdminNav>();
  const route = useRoute<RouteProp<{ AdminUsersScreen: { initialSearch?: string } }, 'AdminUsersScreen'>>();
  const initialSearch = (route.params as any)?.initialSearch ?? '';
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState(initialSearch);
  const [role, setRole] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dormant, setDormant] = useState(false);
  const [bannedOnly, setBannedOnly] = useState(false);
  const [sortIdx, setSortIdx] = useState(0);

  const load = useCallback(async (p: number, append = false, silent = false) => {
    if (p === 1 && !silent) setLoading(true);
    else if (p === 1 && silent) setRefreshing(true);
    else setLoadingMore(true);
    const { sort, order } = SORT_OPTIONS[sortIdx];
    try {
      const res = await adminService.getUsers({ search, role: role || undefined, plan: planFilter || undefined, dormant: dormant || undefined, banned: bannedOnly || undefined, sort, order, page: p, limit: 20 });
      setUsers(append ? (prev) => [...prev, ...res.users] : res.users);
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
    } catch {
      if (p === 1) Alert.alert('Ошибка', 'Не удалось загрузить список пользователей');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [search, role, dormant, bannedOnly, sortIdx]);

  useEffect(() => { load(1); }, [search, role, planFilter, dormant, bannedOnly, sortIdx]);

  const loadMore = useCallback(() => {
    if (!loadingMore && page < pages) load(page + 1, true);
  }, [loadingMore, page, pages, load]);

  const exportCSV = useCallback(async () => {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Недоступно', 'Функция экспорта недоступна на этом устройстве');
      return;
    }
    setExporting(true);
    try {
      const csv = await adminService.exportUsersCSV({
        role: role || undefined,
        plan: planFilter || undefined,
      });
      const fileName = `users_${new Date().toISOString().split('T')[0]}.csv`;
      const path = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Экспорт пользователей' });
    } catch {
      Alert.alert('Ошибка', 'Не удалось экспортировать');
    } finally {
      setExporting(false);
    }
  }, [role, planFilter]);

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

      <View style={styles.filterRow}>
        {PLAN_FILTERS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.filterBtn, planFilter === p.key && { backgroundColor: PLAN_COLOR[p.key] ?? '#6366F1' }]}
            onPress={() => setPlanFilter(p.key)}
          >
            <Text style={[styles.filterText, planFilter === p.key && styles.filterTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, dormant && { backgroundColor: '#F59E0B' }]}
          onPress={() => setDormant(!dormant)}
        >
          <Text style={[styles.filterText, dormant && styles.filterTextActive]}>
            Неактивные (30д)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, bannedOnly && { backgroundColor: '#EF4444' }]}
          onPress={() => setBannedOnly(!bannedOnly)}
        >
          <Text style={[styles.filterText, bannedOnly && styles.filterTextActive]}>
            {bannedOnly ? '⛔ Заблокированные' : 'Заблокированные'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {SORT_OPTIONS.map((opt, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.filterBtn, sortIdx === i && { backgroundColor: '#374151' }]}
            onPress={() => setSortIdx(i)}
          >
            <Text style={[styles.filterText, sortIdx === i && { color: '#9CA3AF' }]}>
              {sortIdx === i ? '↕ ' : ''}{opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Всего: {total}</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={exportCSV} disabled={exporting}>
          {exporting
            ? <ActivityIndicator size="small" color="#6366F1" />
            : <Text style={styles.exportBtnText}>CSV</Text>
          }
        </TouchableOpacity>
      </View>

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
              onRefresh={() => load(1, false, true)}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(1, false, true)} tintColor="#6366F1" />
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
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 4 },
  totalLabel: { fontSize: 12, color: '#6B7280' },
  exportBtn: { borderRadius: 6, borderWidth: 1, borderColor: '#6366F1', paddingHorizontal: 10, paddingVertical: 3, minWidth: 36, alignItems: 'center' },
  exportBtnText: { fontSize: 11, fontWeight: '700', color: '#6366F1' },
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
  rowBanned: { borderColor: '#EF444440', backgroundColor: '#1A0A0A' },
  rowChurn: { borderColor: '#F59E0B40' },
  bannedBadge: { backgroundColor: '#EF444422', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#EF444450' },
  bannedText: { fontSize: 9, fontWeight: '800', color: '#EF4444', letterSpacing: 0.5 },
  banReason: { fontSize: 11, color: '#EF444488', marginTop: 2, fontStyle: 'italic' },
  newBadge: { backgroundColor: '#10B98122', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#10B98150' },
  newText: { fontSize: 9, fontWeight: '800', color: '#10B981', letterSpacing: 0.5 },
  churnBadge: { backgroundColor: '#F59E0B22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#F59E0B50' },
  churnText: { fontSize: 9, fontWeight: '800', color: '#F59E0B', letterSpacing: 0.5 },
  scoreCol: { alignItems: 'center', gap: 2, marginLeft: 4 },
  scoreBadge: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontSize: 12, fontWeight: '800' },
  scoreLabel: { fontSize: 9, color: '#4B5563', fontWeight: '600', letterSpacing: 0.5 },
});
