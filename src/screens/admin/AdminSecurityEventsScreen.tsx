import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { adminService } from '../../services/adminService';

const ACTION_META: Record<string, { icon: string; label: string; color: string }> = {
  REGISTER:           { icon: '+', label: 'Регистрация', color: '#9AC28C' },
  LOGIN_SUCCESS:      { icon: '✓', label: 'Вход выполнен', color: '#9AC28C' },
  LOGIN_FAIL:         { icon: '✗', label: 'Неверный пароль', color: '#E8A36A' },
  ACCOUNT_LOCKED:     { icon: '!', label: 'Аккаунт заблокирован', color: '#E07A6B' },
  SUSPICIOUS_LOGIN:   { icon: '!', label: 'Вход с нового IP', color: '#E07A6B' },
  PASSWORD_CHANGE: { icon: 'P', label: 'Смена пароля', color: '#D4B07A' },
  EMAIL_VERIFIED:  { icon: '@', label: 'Email подтверждён', color: '#9AC28C' },
  PHONE_VERIFIED:  { icon: '#', label: 'Телефон подтверждён', color: '#9AC28C' },
  PHONE_CHANGED:   { icon: '#', label: 'Смена номера телефона', color: '#D4B07A' },
  ACCOUNT_DELETED: { icon: 'X', label: 'Удаление аккаунта', color: '#E07A6B' },
  OTP_BRUTEFORCE:  { icon: '!', label: 'Подбор OTP-кода', color: '#E07A6B' },
  TOKEN_REVOKED:   { icon: 'O', label: 'Сессии завершены', color: '#E8A36A' },
  TOTP_ENABLED:    { icon: 'A', label: '2FA включена', color: '#9AC28C' },
  TOTP_DISABLED:   { icon: 'A', label: '2FA отключена', color: '#E8A36A' },
  EMAIL_CHANGED:   { icon: '@', label: 'Смена email', color: '#D4B07A' },
  ACCOUNT_UPDATED: { icon: 'U', label: 'Изменение аккаунта', color: '#D4B07A' },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? { icon: '·', label: action, color: '#A8A49C' };
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
  const { userId } = route.params ?? {};

  const [events, setEvents] = useState<Array<{ id: string; action: string; ip: string | null; userAgent: string | null; details: string | null; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Round 231: add .catch to prevent unhandled rejection on network
    // failure. Without this, a failed admin call surfaced as a yellow
    // box in dev and silent failure (loading stuck false) in prod.
    let cancelled = false;
    adminService.getUserSecurityEvents(userId)
      .then((evts) => { if (!cancelled) setEvents(evts); })
      .catch(() => { /* network error or 403 — leave events empty */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loading ? (
        <ActivityIndicator color="#D4B07A" style={{ marginTop: 40 }} />
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
  container: { flex: 1, backgroundColor: '#0E0E0F' },
  content: { padding: 16, paddingBottom: 40 },
  empty: { color: '#A8A49C', textAlign: 'center', marginTop: 40, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#17171A' },
  iconWrap: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#F4F1EA' },
  meta: { fontSize: 12, color: '#A8A49C', marginTop: 2 },
  details: { fontSize: 11, color: '#2A2A2F', marginTop: 1 },
});
