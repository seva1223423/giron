import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { adminService } from '../../services/adminService';
import type { AdminStats } from '../../types';

type AdminNav = NativeStackNavigationProp<any>;

function StatCard({ title, value, sub, color = '#6366F1' }: { title: string; value: string | number; sub?: string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

export default function AdminDashboardScreen() {
  const navigation = useNavigation<AdminNav>();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await adminService.getStats();
      setStats(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) return <ActivityIndicator style={styles.center} color="#6366F1" size="large" />;
  if (!stats) return null;

  const memPct = Math.round((stats.server.memoryUsedMb / stats.server.memoryTotalMb) * 100);
  const sysPct = stats.server.systemMemUsedPct;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#6366F1" />}
    >
      {/* Quick nav */}
      <View style={styles.navRow}>
        {[
          { label: '👥 Пользователи', screen: 'AdminUsersScreen' },
          { label: '🎧 Поддержка', screen: 'AdminSupportScreen' },
          { label: '📋 Логи', screen: 'AdminLogsScreen' },
        ].map((b) => (
          <TouchableOpacity
            key={b.screen}
            style={styles.navBtn}
            onPress={() => navigation.navigate(b.screen)}
            activeOpacity={0.7}
          >
            <Text style={styles.navBtnText}>{b.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionTitle title="Пользователи" />
      <View style={styles.row}>
        <StatCard title="Всего" value={stats.users.total} />
        <StatCard title="Онлайн (5м)" value={stats.users.activeNow} color="#10B981" />
        <StatCard title="Час" value={stats.users.activeHour} color="#F59E0B" />
      </View>
      <View style={styles.row}>
        <StatCard title="Сегодня" value={stats.users.newToday} sub="новых" />
        <StatCard title="7 дней" value={stats.users.newThisWeek} sub="новых" />
        <StatCard title="30 дней" value={stats.users.newThisMonth} sub="новых" />
      </View>

      {/* Role breakdown */}
      <View style={styles.rolesCard}>
        <Text style={styles.rolesTitle}>Роли пользователей</Text>
        {Object.entries(stats.users.byRole).map(([role, count]) => (
          <View key={role} style={styles.roleRow}>
            <Text style={styles.roleLabel}>{role}</Text>
            <Text style={styles.roleCount}>{count}</Text>
          </View>
        ))}
      </View>

      <SectionTitle title="Тренировки" />
      <View style={styles.row}>
        <StatCard title="Сегодня" value={stats.workouts.completedToday} sub="завершено" />
        <StatCard title="7 дней" value={stats.workouts.completedThisWeek} sub="завершено" />
      </View>

      <SectionTitle title="ИИ-ассистент" />
      <View style={styles.row}>
        <StatCard title="Запросов сегодня" value={stats.ai.requestsToday} />
        <StatCard title="Кеш-хитрейт" value={`${Math.round(stats.ai.cacheHitRate * 100)}%`} color="#10B981" />
      </View>
      <View style={styles.row}>
        <StatCard title="Сообщ. сегодня" value={stats.ai.messagesToday} />
        <StatCard title="Сообщ. 7 дней" value={stats.ai.messagesThisWeek} />
        <StatCard
          title="Токены (оценка)"
          value={stats.ai.totalTokensEstimate > 1000
            ? `${Math.round(stats.ai.totalTokensEstimate / 1000)}k`
            : stats.ai.totalTokensEstimate}
        />
      </View>

      <SectionTitle title="Поддержка" />
      <View style={styles.row}>
        <StatCard title="Открытых" value={stats.support.openTickets} color="#EF4444" />
        <StatCard title="В работе" value={stats.support.inProgressTickets} color="#F59E0B" />
      </View>

      <SectionTitle title="Сервер" />
      <View style={styles.row}>
        <StatCard title="Аптайм" value={formatUptime(stats.server.uptimeSeconds)} color="#10B981" />
        <StatCard title="Платформа" value={stats.server.platform} />
        <StatCard title="Node" value={stats.server.nodeVersion} />
      </View>

      {/* Memory bars */}
      <View style={styles.memCard}>
        <Text style={styles.memTitle}>Память процесса</Text>
        <View style={styles.memBar}><View style={[styles.memFill, { width: `${memPct}%`, backgroundColor: memPct > 80 ? '#EF4444' : '#6366F1' }]} /></View>
        <Text style={styles.memLabel}>{stats.server.memoryUsedMb} МБ / {stats.server.memoryTotalMb} МБ ({memPct}%)</Text>

        <Text style={[styles.memTitle, { marginTop: 12 }]}>Системная память</Text>
        <View style={styles.memBar}><View style={[styles.memFill, { width: `${sysPct}%`, backgroundColor: sysPct > 85 ? '#EF4444' : '#F59E0B' }]} /></View>
        <Text style={styles.memLabel}>{sysPct}% использовано · {stats.server.systemMemFreeMb} МБ свободно</Text>

        {stats.server.loadAvg && stats.server.loadAvg.length > 0 && (
          <Text style={[styles.memLabel, { marginTop: 8 }]}>
            Load avg: {stats.server.loadAvg.map((v: number) => v.toFixed(2)).join(' / ')}
          </Text>
        )}
      </View>

      {/* Subscriptions */}
      {stats.subscriptions.length > 0 && (
        <>
          <SectionTitle title="Подписки" />
          <View style={styles.rolesCard}>
            {stats.subscriptions.map((s, i) => (
              <View key={i} style={styles.roleRow}>
                <Text style={styles.roleLabel}>{s.plan} · {s.status}</Text>
                <Text style={styles.roleCount}>{s.count}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center' },
  navRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  navBtn: { flex: 1, backgroundColor: '#1C1C1E', borderRadius: 12, padding: 12, alignItems: 'center' },
  navBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14 },
  statTitle: { fontSize: 11, color: '#9CA3AF', marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#6366F1' },
  statSub: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  rolesCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginBottom: 8 },
  rolesTitle: { fontSize: 13, color: '#9CA3AF', fontWeight: '600', marginBottom: 12 },
  roleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  roleLabel: { color: '#FFFFFF', fontSize: 14, textTransform: 'capitalize' },
  roleCount: { color: '#6366F1', fontSize: 14, fontWeight: '700' },
  memCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginTop: 8 },
  memTitle: { fontSize: 13, color: '#9CA3AF', fontWeight: '600', marginBottom: 8 },
  memBar: { height: 8, backgroundColor: '#2C2C2E', borderRadius: 4, overflow: 'hidden' },
  memFill: { height: '100%', borderRadius: 4 },
  memLabel: { fontSize: 12, color: '#9CA3AF', marginTop: 6 },
});
