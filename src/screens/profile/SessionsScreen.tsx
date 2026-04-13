import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { useThemeStore } from '../../store';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { userService } from '../../services/userService';
import { Card, Button } from '../../components';
import { useSafeTop } from '../../hooks/useSafeTop';

interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent?: string | null;
  ip?: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function parseDevice(ua?: string | null): string {
  if (!ua) return 'Неизвестное устройство';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) {
    const model = ua.match(/Android[^;]*;\s*([^)]+)\)/)?.[1]?.trim();
    return model ? `Android · ${model}` : 'Android';
  }
  if (/Expo/i.test(ua)) return 'Expo Go';
  if (/okhttp/i.test(ua)) return 'Android';
  if (/CFNetwork/i.test(ua)) return 'iOS';
  return 'Мобильное приложение';
}

export const SessionsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await userService.getSessions();
      setSessions(data);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить сессии');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const revokeOne = async (id: string) => {
    setRevoking(id);
    try {
      await userService.revokeSession(id);
      setSessions((s) => s.filter((x) => x.id !== id));
    } catch {
      Alert.alert('Ошибка', 'Не удалось отозвать сессию');
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = () => {
    Alert.alert(
      'Выйти со всех устройств?',
      'Все активные сессии, кроме текущей, будут завершены.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти везде',
          style: 'destructive',
          onPress: async () => {
            setRevokingAll(true);
            try {
              await userService.revokeAllSessions();
              setSessions([]);
            } catch {
              Alert.alert('Ошибка', 'Не удалось завершить сессии');
            } finally {
              setRevokingAll(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: safeTop + spacing.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}
    >
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: spacing.xl }}>
        <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
      </TouchableOpacity>

      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>Активные сессии</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
        Список устройств, с которых выполнен вход в аккаунт.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : sessions.length === 0 ? (
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl }]}>
          Нет активных сессий
        </Text>
      ) : (
        <>
          {sessions.map((s, i) => (
            <Card key={s.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.smallMedium, { color: colors.text }]}>
                    {i === 0 ? 'Текущая сессия' : parseDevice(s.userAgent)}
                  </Text>
                  {s.ip && (
                    <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                      IP: {s.ip}
                    </Text>
                  )}
                  <Text style={[typography.caption, { color: colors.textTertiary, marginTop: s.ip ? 0 : 2 }]}>
                    Вход: {formatDate(s.createdAt)}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>
                    Истекает: {formatDate(s.expiresAt)}
                  </Text>
                </View>
                {i !== 0 && (
                  <TouchableOpacity
                    onPress={() => revokeOne(s.id)}
                    disabled={revoking === s.id}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                      borderRadius: borderRadius.sm,
                      backgroundColor: colors.error + '15',
                      borderWidth: 1,
                      borderColor: colors.error + '40',
                    }}
                  >
                    <Text style={[typography.caption, { color: colors.error, fontWeight: '700' }]}>
                      {revoking === s.id ? '...' : 'Завершить'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </Card>
          ))}

          {sessions.length > 1 && (
            <Button
              title="Завершить все остальные сессии"
              variant="outline"
              onPress={revokeAll}
              loading={revokingAll}
              fullWidth
              style={{ marginTop: spacing.lg }}
              textStyle={{ color: colors.error }}
            />
          )}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
});
