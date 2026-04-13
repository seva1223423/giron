import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity,
} from 'react-native';
import { useThemeStore } from '../../store';
import { Button, Input } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { userService } from '../../services/userService';
import { api } from '../../services/api';

function passwordStrength(p: string): number {
  if (!p) return 0;
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  return Math.min(4, score);
}

const STRENGTH_COLORS = ['', '#EF4444', '#FF9F0A', '#34C759', '#8B5CF6'];
const STRENGTH_LABELS = ['', 'Слабый', 'Средний', 'Хороший', 'Отличный'];

export const ChangePasswordScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  // isSocialOnly is determined server-side — we ask the /has-password endpoint
  const [isSocialOnly, setIsSocialOnly] = useState<boolean | null>(null); // null = loading
  const [hasTwoFactor, setHasTwoFactor] = useState(false);

  useEffect(() => {
    Promise.all([
      userService.hasPassword().then((has) => !has).catch(() => false),
      api.get<{ enabled: boolean }>('/user/2fa/status').then(({ data }) => data.enabled).catch(() => false),
    ]).then(([social, totp]) => {
      setIsSocialOnly(social);
      setHasTwoFactor(totp);
    });
  }, []);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const strength = passwordStrength(newPassword);

  const handleSubmit = async () => {
    if (!newPassword) { setError('Введите новый пароль'); return; }
    if (newPassword.length < 8) { setError('Пароль минимум 8 символов'); return; }
    if (!/[A-Z]/.test(newPassword)) { setError('Пароль должен содержать хотя бы одну заглавную букву'); return; }
    if (!/[a-z]/.test(newPassword)) { setError('Пароль должен содержать хотя бы одну строчную букву'); return; }
    if (!/[0-9]/.test(newPassword)) { setError('Пароль должен содержать хотя бы одну цифру'); return; }
    if (newPassword !== confirmPassword) { setError('Пароли не совпадают'); return; }
    if (!isSocialOnly && !currentPassword) { setError('Введите текущий пароль'); return; }
    if (hasTwoFactor && totpCode.length !== 6) { setError('Введите код из аутентификатора'); return; }
    setError('');
    setLoading(true);
    try {
      await userService.changePassword(currentPassword, newPassword, hasTwoFactor ? totpCode : undefined);
      setDone(true);
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === 'WRONG_CURRENT_PASSWORD') setError('Неверный текущий пароль');
      else if (code === 'PASSWORD_REUSED') setError(`Нельзя использовать один из последних 3 паролей`);
      else if (code === 'TOTP_REQUIRED' || code === 'INVALID_TOTP') setError('Неверный код 2FA');
      else setError(e?.response?.data?.error || 'Ошибка изменения пароля');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <Text style={{ fontSize: 64, textAlign: 'center', marginBottom: spacing.xl }}>✅</Text>
          <Text style={[typography.h2, { color: colors.text, textAlign: 'center', marginBottom: spacing.md }]}>Пароль изменён</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.huge }]}>
            Другие устройства будут автоматически отключены при следующем обновлении сессии.
          </Text>
          <Button title="Готово" onPress={() => navigation.goBack()} fullWidth size="lg" />
        </View>
      </View>
    );
  }

  if (isSocialOnly === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={[typography.body, { color: colors.textSecondary }]}>Загрузка...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf: 'flex-start', marginBottom: spacing.xl }}>
            <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
          </TouchableOpacity>
          <Text style={[typography.h2, { color: colors.text }]}>Сменить пароль</Text>
          {isSocialOnly && (
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 }]}>
              Вы вошли через соцсеть — создайте пароль, чтобы также входить по email
            </Text>
          )}
        </View>

        {!isSocialOnly && (
          <Input
            label="Текущий пароль"
            placeholder="Введите текущий пароль"
            secureTextEntry
            value={currentPassword}
            onChangeText={(t) => { setCurrentPassword(t); setError(''); }}
            containerStyle={{ marginBottom: spacing.xl }}
          />
        )}

        <Input
          label="Новый пароль"
          placeholder="Минимум 8 символов"
          secureTextEntry
          value={newPassword}
          onChangeText={(t) => { setNewPassword(t); setError(''); }}
          containerStyle={{ marginBottom: newPassword.length > 0 ? spacing.xs : spacing.xl }}
        />
        {newPassword.length > 0 && (
          <View style={{ marginBottom: spacing.xl }}>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= strength ? STRENGTH_COLORS[strength] : colors.border }} />
              ))}
            </View>
            <Text style={[typography.caption, { color: STRENGTH_COLORS[strength] || colors.textTertiary, marginBottom: 4 }]}>
              {STRENGTH_LABELS[strength] || ''}
            </Text>
            {[
              { ok: newPassword.length >= 8, label: 'Не менее 8 символов' },
              { ok: /[A-Z]/.test(newPassword), label: 'Заглавная буква (A–Z)' },
              { ok: /[a-z]/.test(newPassword), label: 'Строчная буква (a–z)' },
              { ok: /[0-9]/.test(newPassword), label: 'Цифра (0–9)' },
            ].map(({ ok, label }) => (
              <Text key={label} style={[typography.caption, { color: ok ? '#34C759' : colors.textTertiary }]}>
                {ok ? '✓' : '·'} {label}
              </Text>
            ))}
          </View>
        )}

        <Input
          label="Повторите новый пароль"
          placeholder="Повторите пароль"
          secureTextEntry
          value={confirmPassword}
          onChangeText={(t) => { setConfirmPassword(t); setError(''); }}
          containerStyle={{ marginBottom: spacing.md }}
        />

        {hasTwoFactor && (
          <Input
            label="Код двухфакторной аутентификации"
            placeholder="6 цифр из приложения"
            value={totpCode}
            onChangeText={(t) => { setTotpCode(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
            keyboardType="number-pad"
            maxLength={6}
            containerStyle={{ marginBottom: spacing.md }}
          />
        )}

        {error ? <Text style={[typography.small, { color: colors.error, marginBottom: spacing.md }]}>{error}</Text> : null}

        <Button
          title="Сохранить"
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          fullWidth size="lg"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxl },
  header: { alignItems: 'flex-start', marginBottom: spacing.xxxl },
});
