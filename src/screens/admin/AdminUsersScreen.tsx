import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { adminService } from '../../services/adminService';
import type { AdminUserSummary, UserRole } from '../../types';
import { useAdminStepUp, StepUpCancelledError } from './useAdminStepUp';

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

// Quickly grant/revoke subscription inline from the list.
// `withStepUp` is hoisted up to the parent screen so the modal renders
// once at root rather than per-row (R240 audit follow-up).
type StepUpRunner = <T>(fn: (creds?: import('../../services/adminService').AdminStepUpCreds) => Promise<T>) => Promise<T>;

function SubActions({ user, onDone, withStepUp }: { user: AdminUserSummary; onDone: () => void; withStepUp: StepUpRunner }) {
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
              await withStepUp((creds) => adminService.changeUserSubscription(user.id, { plan, status: 'active' }, creds));
              onDone();
            } catch (e) {
              if (!(e instanceof StepUpCancelledError)) Alert.alert('Ошибка', 'Не удалось выдать подписку');
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
              await withStepUp((creds) => adminService.changeUserSubscription(user.id, { plan: 'free', status: 'cancelled' }, creds));
              onDone();
            } catch (e) {
              if (!(e instanceof StepUpCancelledError)) Alert.alert('Ошибка', 'Не удалось отозвать подписку');
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
  user, onPress, onRefresh, withStepUp,
}: {
  user: AdminUserSummary;
  onPress: () => void;
  onRefresh: () => void;
  withStepUp: StepUpRunner;
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
                await withStepUp((creds) => adminService.banUser(user.id, reason.trim(), creds));
                onRefresh();
              } catch (e) {
                if (!(e instanceof StepUpCancelledError)) Alert.alert('Ошибка', 'Не удалось заблокировать');
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
                {sub.endDate && (() => {
                  const daysLeft = Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / DAY_MS);
                  if (daysLeft <= 7 && daysLeft > 0) {
                    return (
                      <>
                        <Text style={styles.metaDot}>·</Text>
                        <Text style={{ fontSize: 11, color: '#F59E0B', fontWeight: '600' }}>⏰ {daysLeft}д</Text>
                      </>
                    );
                  }
                  return null;
                })()}
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
      {!user.isBanned && <SubActions user={user} onDone={onRefresh} withStepUp={withStepUp} />}
    </View>
  );
}

export default function AdminUsersScreen() {
  const navigation = useNavigation<AdminNav>();
  const route = useRoute<RouteProp<{ AdminUsersScreen: { initialSearch?: string; subExpiringSoon?: boolean; dormant?: boolean } }, 'AdminUsersScreen'>>();
  const params = (route.params as any) ?? {};
  const initialSearch = params.initialSearch ?? '';
  const { withStepUp, modal: stepUpModal } = useAdminStepUp();
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
  const [dormant, setDormant] = useState<boolean>(params.dormant ?? false);
  const [bannedOnly, setBannedOnly] = useState(false);
  const [lockedOnly, setLockedOnly] = useState(false);
  const [subExpiringSoon, setSubExpiringSoon] = useState<boolean>(params.subExpiringSoon ?? false);
  const [recentlyActive, setRecentlyActive] = useState(false);
  const [sortIdx, setSortIdx] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMassMsg, setShowMassMsg] = useState(false);
  const [massMsgSubject, setMassMsgSubject] = useState('');
  const [massMsgBody, setMassMsgBody] = useState('');
  const [sendingMass, setSendingMass] = useState(false);
  const [showBulkSub, setShowBulkSub] = useState(false);
  const [bulkSubPlan, setBulkSubPlan] = useState<'pro' | 'trainer' | 'club'>('pro');
  const [bulkSubBusy, setBulkSubBusy] = useState(false);

  const load = useCallback(async (p: number, append = false, silent = false) => {
    if (p === 1 && !silent) setLoading(true);
    else if (p === 1 && silent) setRefreshing(true);
    else setLoadingMore(true);
    const { sort, order } = SORT_OPTIONS[sortIdx];
    try {
      const res = await adminService.getUsers({ search, role: role || undefined, plan: planFilter || undefined, dormant: dormant || undefined, banned: bannedOnly || undefined, locked: lockedOnly || undefined, subExpiringSoon: subExpiringSoon || undefined, recentlyActive: recentlyActive || undefined, sort, order, page: p, limit: 20 });
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
  }, [search, role, dormant, bannedOnly, lockedOnly, subExpiringSoon, recentlyActive, sortIdx]);

  useEffect(() => { load(1); }, [search, role, planFilter, dormant, bannedOnly, lockedOnly, subExpiringSoon, recentlyActive, sortIdx]);

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
        banned: bannedOnly || undefined,
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

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const sendMassMessage = useCallback(async () => {
    if (!massMsgSubject.trim() || !massMsgBody.trim() || sendingMass || selectedIds.size === 0) return;
    setSendingMass(true);
    try {
      const result = await adminService.massMessage(Array.from(selectedIds), massMsgSubject.trim(), massMsgBody.trim());
      setShowMassMsg(false);
      setMassMsgSubject('');
      setMassMsgBody('');
      exitSelectMode();
      Alert.alert('Готово', `Отправлено ${result.sent} из ${result.total} пользователей${result.failed > 0 ? `. Ошибок: ${result.failed}` : ''}`);
    } catch {
      Alert.alert('Ошибка', 'Не удалось отправить рассылку');
    } finally {
      setSendingMass(false);
    }
  }, [massMsgSubject, massMsgBody, sendingMass, selectedIds, exitSelectMode]);

  const bulkGrantSubscription = useCallback(async () => {
    if (selectedIds.size === 0 || bulkSubBusy) return;
    setBulkSubBusy(true);
    try {
      // R240: bulk grant — collect step-up creds ONCE, reuse for all N
      // calls. Without this the user would re-enter their password for
      // every selected user (unbearable UX for batches). The first call
      // pops the modal via withStepUp; we capture the creds via a side
      // channel and pass them directly to the rest.
      let cachedCreds: import('../../services/adminService').AdminStepUpCreds | undefined;
      const firstId = Array.from(selectedIds)[0];
      const restIds = Array.from(selectedIds).slice(1);

      await withStepUp(async (creds) => {
        cachedCreds = creds;
        return adminService.changeUserSubscription(firstId, { plan: bulkSubPlan, status: 'active' }, creds);
      });

      const results = await Promise.allSettled(
        restIds.map((id) =>
          adminService.changeUserSubscription(id, { plan: bulkSubPlan, status: 'active' }, cachedCreds)
        )
      );
      const succeeded = 1 + results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      setShowBulkSub(false);
      exitSelectMode();
      await load(1, false, true);
      Alert.alert('Готово', `Подписка ${bulkSubPlan.toUpperCase()} выдана ${succeeded} пользователям${failed > 0 ? `. Ошибок: ${failed}` : ''}`);
    } catch (e) {
      if (!(e instanceof StepUpCancelledError)) Alert.alert('Ошибка', 'Не удалось выдать подписки');
    } finally {
      setBulkSubBusy(false);
    }
  }, [selectedIds, bulkSubPlan, bulkSubBusy, exitSelectMode, load, withStepUp]);

  return (
    <View style={styles.container}>
      {/* R240: step-up re-auth modal for inline grant/revoke actions */}
      {stepUpModal}
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
        <TouchableOpacity
          style={[styles.filterBtn, lockedOnly && { backgroundColor: '#F59E0B' }]}
          onPress={() => setLockedOnly(!lockedOnly)}
        >
          <Text style={[styles.filterText, lockedOnly && styles.filterTextActive]}>
            {lockedOnly ? '🔒 Залочены входом' : 'Залочены входом'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, subExpiringSoon && { backgroundColor: '#F59E0B' }]}
          onPress={() => setSubExpiringSoon(!subExpiringSoon)}
        >
          <Text style={[styles.filterText, subExpiringSoon && styles.filterTextActive]}>
            {subExpiringSoon ? '⏰ Истекает ≤7д' : 'Истекает ≤7д'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, recentlyActive && { backgroundColor: '#10B981' }]}
          onPress={() => setRecentlyActive(!recentlyActive)}
        >
          <Text style={[styles.filterText, recentlyActive && styles.filterTextActive]}>
            {recentlyActive ? '✅ Активны 24ч' : 'Активны 24ч'}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.totalLabel}>Всего: {total}</Text>
          {selectMode && (
            <Text style={{ fontSize: 12, color: '#6366F1', fontWeight: '600' }}>
              ({selectedIds.size} выбрано)
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[styles.exportBtn, selectMode && { backgroundColor: '#6366F122', borderColor: '#6366F160' }]}
            onPress={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }}
          >
            <Text style={[styles.exportBtnText, selectMode && { color: '#6366F1' }]}>
              {selectMode ? 'Отмена' : 'Выбрать'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={exportCSV} disabled={exporting}>
            {exporting
              ? <ActivityIndicator size="small" color="#6366F1" />
              : <Text style={styles.exportBtnText}>CSV</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} color="#6366F1" size="large" />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => selectMode ? toggleSelect(item.id) : navigation.navigate('AdminUserDetailScreen', { userId: item.id })}
              onLongPress={() => { if (!selectMode) setSelectMode(true); toggleSelect(item.id); }}
              delayLongPress={400}
              activeOpacity={0.8}
            >
              {selectMode && (
                <View style={[styles.checkboxRow]}>
                  <View style={[styles.checkbox, selectedIds.has(item.id) && styles.checkboxSelected]}>
                    {selectedIds.has(item.id) && <Text style={{ fontSize: 10, color: '#FFF', fontWeight: '800' }}>✓</Text>}
                  </View>
                </View>
              )}
              <UserRow
                user={item}
                onPress={() => selectMode ? toggleSelect(item.id) : navigation.navigate('AdminUserDetailScreen', { userId: item.id })}
                onRefresh={() => load(1, false, true)}
                withStepUp={withStepUp}
              />
            </TouchableOpacity>
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

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <View style={styles.bulkBar}>
          <TouchableOpacity style={styles.bulkBtn} onPress={() => setShowMassMsg(true)}>
            <Text style={styles.bulkBtnText}>💬 Написать ({selectedIds.size})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.bulkBtn, { borderColor: '#F59E0B60', backgroundColor: '#F59E0B10' }]} onPress={() => setShowBulkSub(true)}>
            <Text style={[styles.bulkBtnText, { color: '#F59E0B' }]}>💳 Подписка</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.bulkBtn, { borderColor: '#6B728060' }]} onPress={exitSelectMode}>
            <Text style={[styles.bulkBtnText, { color: '#6B7280' }]}>Отмена</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Mass message modal */}
      <Modal visible={showMassMsg} transparent animationType="slide" onRequestClose={() => setShowMassMsg(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Рассылка ({selectedIds.size} польз.)</Text>
                <TouchableOpacity onPress={() => setShowMassMsg(false)}>
                  <Text style={{ color: '#6B7280', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.modalHint}>Каждому пользователю будет создан тикет поддержки с вашим сообщением</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Тема..."
                placeholderTextColor="#6B7280"
                value={massMsgSubject}
                onChangeText={setMassMsgSubject}
                maxLength={200}
              />
              <TextInput
                style={[styles.modalInput, { height: 100 }]}
                placeholder="Текст сообщения..."
                placeholderTextColor="#6B7280"
                value={massMsgBody}
                onChangeText={setMassMsgBody}
                multiline
                maxLength={2000}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.modalSendBtn, (!massMsgSubject.trim() || !massMsgBody.trim() || sendingMass) && { opacity: 0.5 }]}
                onPress={sendMassMessage}
                disabled={!massMsgSubject.trim() || !massMsgBody.trim() || sendingMass}
              >
                {sendingMass
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={styles.modalSendBtnText}>Отправить {selectedIds.size} сообщений</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bulk subscription modal */}
      <Modal visible={showBulkSub} transparent animationType="slide" onRequestClose={() => setShowBulkSub(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Выдать подписку ({selectedIds.size} польз.)</Text>
              <TouchableOpacity onPress={() => setShowBulkSub(false)}>
                <Text style={{ color: '#6B7280', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>Все выбранные пользователи получат выбранный план</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
              {(['pro', 'trainer', 'club'] as const).map((plan) => (
                <TouchableOpacity
                  key={plan}
                  style={[
                    styles.exportBtn,
                    { flex: 1, justifyContent: 'center', paddingVertical: 10 },
                    bulkSubPlan === plan && { backgroundColor: (PLAN_COLOR[plan] ?? '#6366F1') + '25', borderColor: PLAN_COLOR[plan] ?? '#6366F1' },
                  ]}
                  onPress={() => setBulkSubPlan(plan)}
                >
                  <Text style={[styles.exportBtnText, bulkSubPlan === plan && { color: PLAN_COLOR[plan] }]}>
                    {plan.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.modalSendBtn, bulkSubBusy && { opacity: 0.6 }]}
              onPress={bulkGrantSubscription}
              disabled={bulkSubBusy}
            >
              {bulkSubBusy
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.modalSendBtnText}>Выдать {bulkSubPlan.toUpperCase()} · {selectedIds.size} польз.</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  checkboxRow: { position: 'absolute', left: 6, top: '50%', zIndex: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#4B5563', backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: '#6366F1', borderColor: '#6366F1' },

  bulkBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12,
    paddingBottom: 28, backgroundColor: '#1C1C1E', borderTopWidth: 1, borderTopColor: '#2C2C2E',
  },
  bulkBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#6366F140', alignItems: 'center', backgroundColor: '#6366F112' },
  bulkBtnText: { fontSize: 13, fontWeight: '700', color: '#6366F1' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  modalHint: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  modalInput: { backgroundColor: '#2C2C2E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#FFFFFF', marginBottom: 10, borderWidth: 1, borderColor: '#3C3C3E' },
  modalSendBtn: { backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  modalSendBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
