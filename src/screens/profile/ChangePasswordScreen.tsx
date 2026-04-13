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

  useEffect(() => {
    userService.hasPassword()
      .then((has) => setIsSocialOnly(!has))
      .catch(() => setIsSocialOnly(false)); // default: assume password exists (safe)
  }, []);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const strength = passwordStrength(newPassword);

  const handleSubmit = async () => {
    if (!newPassword) { setError('Введите новый пароль'); return; }
    if (newPassword.length < 6) { setError('Пароль минимум 6 символов'); return; }
    if (newPassword !== confirmPassword) { setError('Пароли не совпадают'); return; }
    if (!isSocialOnly && !currentPassword) { setError('Введите текущий пароль'); return; }
    setError('');
    setLoading(true);
    try {
      await userService.changePassword(currentPassword, newPassword);
      setDone(true);
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === 'WRONG_CURRENT_PASSWORD') setError('Неверный текущий пароль');
      else if (code === 'PASSWORD_REUSED') setError(`Нельзя использовать один из последних 3 паролей`);
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
          placeholder="Минимум 6 символов"
          secureTextEntry
          value={newPassword}
          onChangeText={(t) => { setNewPassword(t); setError(''); }}
          containerStyle={{ marginBottom: newPassword.length > 0 ? spacing.xs : spacing.xl }}
        />
        {newPassword.length > 0 && (
          <View style={{ marginBottom: spacing.xl }}>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= strength ? STRENGTH_COLORS[strength] : colors.border }} />
              ))}
            </View>
            <Text style={[typography.caption, { color: STRENGTH_COLORS[strength] || colors.textTertiary }]}>
              {STRENGTH_LABELS[strength] || ''}
            </Text>
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
