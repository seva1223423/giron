import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity,
} from 'react-native';
import { useThemeColors } from '../../store';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { userService } from '../../services/userService';
import { useSafeTop } from '../../hooks/useSafeTop';

interface SecurityEvent {
  id: string;
  action: string;
  ip: string | null;
  userAgent?: string | null;
  createdAt: string;
  details?: string | null;
}

const ACTION_META: Record<string, { icon: string; label: string; color: string }> = {
  REGISTER:           { icon: '+', label: 'Регистрация', color: '#34C759' },
  LOGIN_SUCCESS:      { icon: '✓', label: 'Вход выполнен', color: '#34C759' },
  LOGIN_FAIL:         { icon: '✗', label: 'Неверный пароль', color: '#FF9F0A' },
  ACCOUNT_LOCKED:     { icon: '!', label: 'Аккаунт заблокирован', color: '#EF4444' },
  SUSPICIOUS_LOGIN:   { icon: '!', label: 'Вход с нового IP', color: '#EF4444' },
  PASSWORD_CHANGE: { icon: 'P', label: 'Смена пароля', color: '#D4B07A' },
  EMAIL_VERIFIED:  { icon: '@', label: 'Email подтверждён', color: '#34C759' },
  PHONE_VERIFIED:  { icon: '#', label: 'Телефон подтверждён', color: '#34C759' },
  PHONE_CHANGED:   { icon: '#', label: 'Смена номера телефона', color: '#D4B07A' },
  ACCOUNT_DELETED: { icon: 'X', label: 'Удаление аккаунта', color: '#EF4444' },
  OTP_BRUTEFORCE:  { icon: '!', label: 'Подбор OTP-кода', color: '#EF4444' },
  TOKEN_REVOKED:   { icon: 'O', label: 'Сессии завершены', color: '#FF9F0A' },
  TOTP_ENABLED:    { icon: 'A', label: '2FA включена', color: '#34C759' },
  TOTP_DISABLED:   { icon: 'A', label: '2FA отключена', color: '#FF9F0A' },
  EMAIL_CHANGED:   { icon: '@', label: 'Смена email', color: '#D4B07A' },
  ACCOUNT_UPDATED: { icon: 'U', label: 'Изменение аккаунта', color: '#D4B07A' },
};

const DETAILS_LABELS: Record<string, string> = {
  'backup_codes_regenerated': 'Резервные коды обновлены',
  'all_sessions': 'Все сессии',
  'unlinked:yandex': 'Яндекс отвязан',
  'unlinked:vk': 'VK отвязан',
  'unlinked:google': 'Google отвязан',
  'method=change_password': '',
};

function getDetailsLabel(details?: string | null): string {
  if (!details) return '';
  return DETAILS_LABELS[details] ?? details;
}

function parseDevice(ua?: string | null): string {
  if (!ua) return '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) {
    const model = ua.match(/Android[^;]*;\s*([^)]+)\)/)?.[1]?.trim();
    return model ? `Android · ${model}` : 'Android';
  }
  if (/Expo/i.test(ua)) return 'Expo Go';
  if (/okhttp/i.test(ua)) return 'Android';
  if (/CFNetwork/i.test(ua)) return 'iOS';
  return '';
}

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
  const colors = useThemeColors();
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
                <Text style={[typography.smallMedium, { color: colors.text }]}>
                  {meta.label}{getDetailsLabel(evt.details) ? ` · ${getDetailsLabel(evt.details)}` : ''}
                </Text>
                <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                  {formatDate(evt.createdAt)}
                  {evt.ip ? `  ·  ${evt.ip}` : ''}
                </Text>
                {(evt.action === 'SUSPICIOUS_LOGIN' || evt.action === 'LOGIN_SUCCESS') && parseDevice(evt.userAgent) ? (
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>
                    {parseDevice(evt.userAgent)}
                  </Text>
                ) : null}
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
