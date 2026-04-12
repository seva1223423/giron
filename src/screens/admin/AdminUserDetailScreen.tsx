import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { adminService } from '../../services/adminService';
import type { AdminUserDetail, UserRole } from '../../types';

type RouteParams = { userId: string };

const ROLES: UserRole[] = ['guest', 'visitor', 'client', 'trainer', 'support', 'admin'];
const PLANS = [
  { key: 'free', label: 'Free', color: '#6B7280' },
  { key: 'pro', label: 'PRO', color: '#6366F1' },
  { key: 'trainer', label: 'Trainer', color: '#F59E0B' },
  { key: 'club', label: 'Club', color: '#10B981' },
] as const;

type Plan = typeof PLANS[number]['key'];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function AdminUserDetailScreen() {
  const route = useRoute<RouteProp<{ AdminUserDetailScreen: RouteParams }, 'AdminUserDetailScreen'>>();
  const { userId } = route.params;

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.getUser(userId);
      setUser(data);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить данные пользователя');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, []);

  const changeRole = useCallback((newRole: UserRole) => {
    Alert.alert(
      'Изменить роль?',
      `Роль пользователя ${user?.firstName} будет изменена на "${newRole.toUpperCase()}"`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Изменить',
          onPress: async () => {
            setBusy(true);
            try {
              await adminService.changeUserRole(userId, newRole.toUpperCase());
              await load();
            } catch {
              Alert.alert('Ошибка', 'Не удалось изменить роль');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [userId, user, load]);

  const grantPlan = useCallback((plan: Plan) => {
    const planInfo = PLANS.find((p) => p.key === plan)!;
    Alert.alert(
      `Выдать "${planInfo.label}"?`,
      `${user?.firstName} ${user?.lastName ?? ''} получит доступ к плану ${planInfo.label}.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выдать',
          onPress: async () => {
            setBusy(true);
            try {
              await adminService.changeUserSubscription(userId, { plan, status: 'active' });
              await load();
            } catch {
              Alert.alert('Ошибка', 'Не удалось выдать подписку');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [userId, user, load]);

  const revokeSubscription = useCallback(() => {
    Alert.alert(
      'Отозвать подписку?',
      `${user?.firstName} ${user?.lastName ?? ''} будет переведён на бесплатный план. Это действие нельзя отменить автоматически.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отозвать',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await adminService.changeUserSubscription(userId, { plan: 'free', status: 'cancelled' });
              await load();
            } catch {
              Alert.alert('Ошибка', 'Не удалось отозвать подписку');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [userId, user, load]);

  if (loading) return <ActivityIndicator style={styles.center} color="#6366F1" size="large" />;
  if (!user) return null;

  const sub = user.subscription;
  const currentPlan: Plan = (sub?.plan as Plan) ?? 'free';
  const isActiveSub = sub?.status === 'active' && currentPlan !== 'free';
  // Server returns Prisma enum values (uppercase); normalize for comparisons
  const roleLower = user.role.toLowerCase() as typeof user.role;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {busy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color="#6366F1" size="large" />
        </View>
      )}

      {/* User header */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: '#6366F133', borderColor: '#6366F1' }]}>
          <Text style={styles.avatarText}>{user.firstName[0]}{user.lastName?.[0] ?? ''}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {user.phone && <Text style={styles.meta}>{user.phone}</Text>}
          <Text style={[styles.roleBadge, { color: roleLower === 'admin' ? '#F59E0B' : '#9CA3AF' }]}>
            {roleLower.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: 'Тренировки', value: user._count.workouts },
          { label: 'Питание', value: user._count.meals },
          { label: 'ИИ', value: user._count.chatMessages },
          { label: 'Кардио', value: user._count.cardioSessions },
          { label: 'Тикеты', value: user._count.supportTickets },
        ].map((s) => (
          <View key={s.label} style={styles.statItem}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Subscription block */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Подписка</Text>

        {/* Current status */}
        <View style={styles.subStatus}>
          {PLANS.map((p) => {
            const isActive = currentPlan === p.key;
            return (
              <View
                key={p.key}
                style={[styles.planChip, isActive && { backgroundColor: p.color + '22', borderColor: p.color }]}
              >
                <Text style={[styles.planChipText, { color: isActive ? p.color : '#6B7280' }]}>
                  {p.label}
                  {isActive && sub?.status ? ` · ${sub.status}` : ''}
                </Text>
              </View>
            );
          })}
        </View>

        {sub?.endDate && (
          <Text style={styles.subMeta}>
            До: {new Date(sub.endDate).toLocaleDateString('ru-RU')}
          </Text>
        )}

        {/* Grant buttons */}
        <Text style={styles.subSectionLabel}>Выдать подписку</Text>
        <View style={styles.subActions}>
          {PLANS.filter((p) => p.key !== 'free').map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.grantBtn, { borderColor: p.color }, currentPlan === p.key && { backgroundColor: p.color + '22' }]}
              onPress={() => grantPlan(p.key as Plan)}
              disabled={busy}
            >
              <Text style={[styles.grantBtnText, { color: p.color }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Revoke button — only shown when user has an active non-free plan */}
        {isActiveSub && (
          <>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.revokeBtn}
              onPress={revokeSubscription}
              disabled={busy}
            >
              <Text style={styles.revokeBtnText}>Отозвать подписку</Text>
              <Text style={styles.revokeBtnSub}>Переведёт на Free · cancelled</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Role management */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Роль пользователя</Text>
        <View style={styles.chipsRow}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.chip, roleLower === r && styles.chipActive]}
              onPress={() => roleLower !== r && changeRole(r)}
              disabled={busy}
            >
              <Text style={[styles.chipText, roleLower === r && styles.chipTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.cardHint}>Роль ADMIN даёт доступ к этой панели. Будьте осторожны.</Text>
      </View>

      {/* Fitness info */}
      {(user.weightKg || user.heightCm || user.goal) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Физ. данные</Text>
          {user.weightKg && <Row label="Вес" value={`${user.weightKg} кг`} />}
          {user.heightCm && <Row label="Рост" value={`${user.heightCm} см`} />}
          {user.goal && <Row label="Цель" value={user.goal} />}
          {user.fitnessLevel && <Row label="Уровень" value={user.fitnessLevel} />}
        </View>
      )}

      {/* Recent workouts */}
      {user.workouts?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Последние тренировки</Text>
          {user.workouts.map((w) => (
            <View key={w.id} style={styles.listRow}>
              <Text style={styles.listMain} numberOfLines={1}>{w.name}</Text>
              <Text style={styles.listMeta}>
                {w.completedAt ? new Date(w.completedAt).toLocaleDateString('ru-RU') : '—'}
                {w.totalVolume ? ` · ${Math.round(w.totalVolume)} кг` : ''}
                {w.durationMinutes ? ` · ${w.durationMinutes} мин` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Recent tickets */}
      {user.supportTickets?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Обращения в поддержку</Text>
          {user.supportTickets.map((t) => (
            <View key={t.id} style={styles.listRow}>
              <Text style={styles.listMain} numberOfLines={1}>{t.subject}</Text>
              <Text style={styles.listMeta}>{t.status} · {new Date(t.createdAt).toLocaleDateString('ru-RU')}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.createdAt}>
        Зарегистрирован: {new Date(user.createdAt).toLocaleDateString('ru-RU')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center' },

  busyOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#00000060', zIndex: 99, justifyContent: 'center', alignItems: 'center',
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  avatar: {
    width: 60, height: 60, borderRadius: 30,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2,
  },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  email: { fontSize: 13, color: '#9CA3AF', marginTop: 1 },
  meta: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  roleBadge: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 4 },

  statsRow: {
    flexDirection: 'row', backgroundColor: '#1C1C1E', borderRadius: 14,
    padding: 14, marginBottom: 16, justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#6366F1' },
  statLabel: { fontSize: 9, color: '#6B7280', marginTop: 2, textAlign: 'center' },

  card: {
    backgroundColor: '#1C1C1E', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#2C2C2E',
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  cardHint: { fontSize: 11, color: '#4B5563', marginTop: 10 },

  // Subscription
  subStatus: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  planChip: {
    borderRadius: 8, borderWidth: 1, borderColor: 'transparent',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  planChipText: { fontSize: 12, fontWeight: '600' },
  subMeta: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  subSectionLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginTop: 12, marginBottom: 8 },
  subActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  grantBtn: {
    borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8,
  },
  grantBtnText: { fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#2C2C2E', marginVertical: 12 },
  revokeBtn: {
    backgroundColor: '#EF444412', borderRadius: 10, borderWidth: 1,
    borderColor: '#EF4444', padding: 12, alignItems: 'center',
  },
  revokeBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
  revokeBtnSub: { color: '#EF444480', fontSize: 11, marginTop: 2 },

  // Role chips
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#0F0F0F', borderWidth: 1, borderColor: '#2C2C2E',
  },
  chipActive: { backgroundColor: '#6366F122', borderColor: '#6366F1' },
  chipText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  chipTextActive: { color: '#6366F1' },

  // Info rows
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  infoLabel: { fontSize: 13, color: '#6B7280' },
  infoValue: { fontSize: 13, color: '#FFFFFF', fontWeight: '500' },

  // List items
  listRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  listMain: { fontSize: 14, color: '#FFFFFF', marginBottom: 2 },
  listMeta: { fontSize: 12, color: '#6B7280' },

  createdAt: { fontSize: 12, color: '#374151', textAlign: 'center', marginTop: 24 },
});
