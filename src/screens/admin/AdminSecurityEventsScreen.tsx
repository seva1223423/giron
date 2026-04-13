import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { adminService } from '../../services/adminService';

const ACTION_META: Record<string, { icon: string; label: string; color: string }> = {
  LOGIN_SUCCESS:   { icon: '✓', label: 'Вход выполнен', color: '#34C759' },
  LOGIN_FAIL:      { icon: '✗', label: 'Неверный пароль', color: '#FF9F0A' },
  ACCOUNT_LOCKED:  { icon: '🔒', label: 'Аккаунт заблокирован', color: '#EF4444' },
  PASSWORD_CHANGE: { icon: '🔑', label: 'Смена пароля', color: '#6366F1' },
  EMAIL_VERIFIED:  { icon: '@', label: 'Email подтверждён', color: '#34C759' },
  PHONE_VERIFIED:  { icon: '#', label: 'Телефон подтверждён', color: '#34C759' },
  ACCOUNT_DELETED: { icon: '✕', label: 'Удаление аккаунта', color: '#EF4444' },
  OTP_BRUTEFORCE:  { icon: '⚠', label: 'Подбор OTP-кода', color: '#EF4444' },
  TOKEN_REVOKED:   { icon: '◻', label: 'Сессии завершены', color: '#FF9F0A' },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? { icon: '·', label: action, color: '#6B7280' };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

type RouteParams = { userId: string };

export default function AdminSecurityEventsScreen() {
  const route = useRoute<RouteProp<{ AdminSecurityEventsScreen: RouteParams }, 'AdminSecurityEventsScreen'>>();
  const { userId } = route.params;

  const [events, setEvents] = useState<Array<{ id: string; action: string; ip: string | null; userAgent: string | null; details: string | null; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminService.getUserSecurityEvents(userId)
      .then(setEvents)
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loading ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
      ) : events.length === 0 ? (
        <Text style={styles.empty}>Нет событий безопасности</Text>
      ) : (
        events.map((evt, i) => {
          const meta = getActionMeta(evt.action);
          const isLast = i === events.length - 1;
          return (
            <View key={evt.id} style={[styles.row, isLast ? {} : styles.rowBorder]}>
              <View style={[styles.iconWrap, { backgroundColor: meta.color + '18', borderColor: meta.color + '35' }]}>
                <Text style={{ fontSize: 13, color: meta.color, fontWeight: '700' }}>{meta.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{meta.label}</Text>
                <Text style={styles.meta}>
                  {formatDate(evt.createdAt)}
                  {evt.ip ? `  ·  ${evt.ip}` : ''}
                </Text>
                {evt.details ? <Text style={styles.details}>{evt.details}</Text> : null}
                {evt.userAgent ? (
                  <Text style={styles.meta} numberOfLines={1}>{evt.userAgent}</Text>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  content: { padding: 16, paddingBottom: 40 },
  empty: { color: '#6B7280', textAlign: 'center', marginTop: 40, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  iconWrap: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#F9FAFB' },
  meta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  details: { fontSize: 11, color: '#4B5563', marginTop: 1 },
});
