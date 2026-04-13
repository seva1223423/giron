import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity,
} from 'react-native';
import { useThemeStore } from '../../store';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { userService } from '../../services/userService';
import { useSafeTop } from '../../hooks/useSafeTop';

interface SecurityEvent {
  id: string;
  action: string;
  ip: string | null;
  createdAt: string;
}

const ACTION_META: Record<string, { icon: string; label: string; color: string }> = {
  LOGIN_SUCCESS:      { icon: '✓', label: 'Вход выполнен', color: '#34C759' },
  LOGIN_FAIL:         { icon: '✗', label: 'Неверный пароль', color: '#FF9F0A' },
  ACCOUNT_LOCKED:     { icon: '!', label: 'Аккаунт заблокирован', color: '#EF4444' },
  SUSPICIOUS_LOGIN:   { icon: '!', label: 'Вход с нового IP', color: '#EF4444' },
  PASSWORD_CHANGE: { icon: 'P', label: 'Смена пароля', color: '#6366F1' },
  EMAIL_VERIFIED:  { icon: '@', label: 'Email подтверждён', color: '#34C759' },
  PHONE_VERIFIED:  { icon: '#', label: 'Телефон подтверждён', color: '#34C759' },
  PHONE_CHANGED:   { icon: '#', label: 'Смена номера телефона', color: '#6366F1' },
  ACCOUNT_DELETED: { icon: 'X', label: 'Удаление аккаунта', color: '#EF4444' },
  OTP_BRUTEFORCE:  { icon: '!', label: 'Подбор OTP-кода', color: '#EF4444' },
  TOKEN_REVOKED:   { icon: 'O', label: 'Сессии завершены', color: '#FF9F0A' },
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

export const SecurityEventsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await userService.getSecurityEvents();
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: safeTop + spacing.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}
    >
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: spacing.xl }}>
        <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
      </TouchableOpacity>

      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>
        История безопасности
      </Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
        Последние 30 событий безопасности вашего аккаунта.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : events.length === 0 ? (
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl }]}>
          Нет событий
        </Text>
      ) : (
        events.map((evt, i) => {
          const meta = getActionMeta(evt.action);
          const isLast = i === events.length - 1;
          return (
            <View
              key={evt.id}
              style={[
                styles.row,
                { borderBottomColor: colors.border, borderBottomWidth: isLast ? 0 : 1 },
              ]}
            >
              <View style={[
                styles.iconWrap,
                { backgroundColor: meta.color + '18', borderColor: meta.color + '35' },
              ]}>
                <Text style={{ fontSize: 14, color: meta.color, fontWeight: '700' }}>{meta.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.smallMedium, { color: colors.text }]}>{meta.label}</Text>
                <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                  {formatDate(evt.createdAt)}
                  {evt.ip ? `  ·  IP: ${evt.ip}` : ''}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
