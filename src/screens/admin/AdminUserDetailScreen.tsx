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
const PLANS = ['free', 'pro', 'trainer', 'club'] as const;
const PLAN_COLOR: Record<string, string> = { free: '#6B7280', pro: '#6366F1', trainer: '#F59E0B', club: '#10B981' };

export default function AdminUserDetailScreen() {
  const route = useRoute<RouteProp<{ AdminUserDetailScreen: RouteParams }, 'AdminUserDetailScreen'>>();
  const { userId } = route.params;

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.getUser(userId);
      setUser(data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, []);

  const changeRole = useCallback((newRole: UserRole) => {
    Alert.alert(
      'Изменить роль?',
      `Роль пользователя будет изменена на "${newRole}"`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Изменить',
          onPress: async () => {
            try {
              await adminService.changeUserRole(userId, newRole.toUpperCase());
              await load();
            } catch {
              Alert.alert('Ошибка', 'Не удалось изменить роль');
            }
          },
        },
      ]
    );
  }, [userId, load]);

  const changePlan = useCallback((plan: string) => {
    Alert.alert(
      'Изменить подписку?',
      `План будет изменён на "${plan}"`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Изменить',
          onPress: async () => {
            try {
              await adminService.changeUserSubscription(userId, { plan: plan as any, status: 'active' });
              await load();
            } catch {
              Alert.alert('Ошибка', 'Не удалось изменить подписку');
            }
          },
        },
      ]
    );
  }, [userId, load]);

  if (loading) return <ActivityIndicator style={styles.center} color="#6366F1" size="large" />;
  if (!user) return null;

  const sub = (user as any).subscription;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.firstName[0]}{user.lastName?.[0] ?? ''}</Text>
        </View>
        <View>
          <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {user.phone && <Text style={styles.meta}>{user.phone}</Text>}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: 'Трен.', value: user._count.workouts },
          { label: 'Приёмы', value: user._count.meals },
          { label: 'ИИ-сообщ', value: user._count.chatMessages },
          { label: 'Кардио', value: user._count.cardioSessions },
          { label: 'Тикеты', value: user._count.supportTickets },
        ].map((s) => (
          <View key={s.label} style={styles.statItem}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Fitness info */}
      {(user.weightKg || user.heightCm || user.goal) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Физ. данные</Text>
          {user.weightKg && <Text style={styles.cardRow}>Вес: {user.weightKg} кг</Text>}
          {user.heightCm && <Text style={styles.cardRow}>Рост: {user.heightCm} см</Text>}
          {user.goal && <Text style={styles.cardRow}>Цель: {user.goal}</Text>}
          {user.fitnessLevel && <Text style={styles.cardRow}>Уровень: {user.fitnessLevel}</Text>}
        </View>
      )}

      {/* Role management */}
      <Text style={styles.sectionLabel}>Роль</Text>
      <View style={styles.chipsRow}>
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.chip, user.role === r && styles.chipActive]}
            onPress={() => user.role !== r && changeRole(r)}
          >
            <Text style={[styles.chipText, user.role === r && styles.chipTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Subscription management */}
      <Text style={styles.sectionLabel}>Подписка {sub ? `(текущий: ${sub.plan} · ${sub.status})` : '(нет)'}</Text>
      <View style={styles.chipsRow}>
        {PLANS.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, sub?.plan === p && { backgroundColor: PLAN_COLOR[p] + '33', borderColor: PLAN_COLOR[p] }]}
            onPress={() => changePlan(p)}
          >
            <Text style={[styles.chipText, sub?.plan === p && { color: PLAN_COLOR[p] }]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent workouts */}
      {user.workouts?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Последние тренировки</Text>
          {user.workouts.map((w) => (
            <View key={w.id} style={styles.listRow}>
              <Text style={styles.listMain} numberOfLines={1}>{w.name}</Text>
              <Text style={styles.listMeta}>
                {w.completedAt ? new Date(w.completedAt).toLocaleDateString('ru-RU') : '—'}
                {w.totalVolume ? ` · ${w.totalVolume} кг` : ''}
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

      <Text style={styles.createdAt}>Зарегистрирован: {new Date(user.createdAt).toLocaleDateString('ru-RU')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  email: { fontSize: 14, color: '#9CA3AF', marginTop: 2 },
  meta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  statsRow: { flexDirection: 'row', backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginBottom: 16, justifyContent: 'space-between' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#6366F1' },
  statLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: 'transparent' },
  chipActive: { backgroundColor: '#6366F122', borderColor: '#6366F1' },
  chipText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  chipTextActive: { color: '#6366F1' },
  card: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginTop: 16 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#9CA3AF', marginBottom: 10 },
  cardRow: { fontSize: 14, color: '#FFFFFF', paddingVertical: 4 },
  listRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  listMain: { fontSize: 14, color: '#FFFFFF', marginBottom: 2 },
  listMeta: { fontSize: 12, color: '#9CA3AF' },
  createdAt: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 24 },
});
