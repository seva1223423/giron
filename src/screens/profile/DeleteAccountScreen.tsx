import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { useThemeStore, useAuthStore } from '../../store';
import { Button, Input } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { userService } from '../../services/userService';

export const DeleteAccountScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const logout = useAuthStore((s) => s.logout);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    userService.hasPassword()
      .then(setHasPassword)
      .catch(() => setHasPassword(false));
  }, []);

  const handleDelete = () => {
    if (hasPassword && !password) {
      setError('Введите пароль для подтверждения');
      return;
    }
    Alert.alert(
      'Вы уверены?',
      'Все данные будут удалены без возможности восстановления.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить навсегда',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            setError('');
            try {
              await userService.deleteAccount(hasPassword ? password : undefined);
              logout();
            } catch (e: any) {
              const code = e?.response?.data?.code;
              if (code === 'WRONG_PASSWORD') setError('Неверный пароль');
              else if (code === 'PASSWORD_REQUIRED') setError('Введите пароль для подтверждения');
              else setError(e?.response?.data?.error || 'Ошибка удаления');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  if (hasPassword === null) {
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf: 'flex-start', marginBottom: spacing.xl }}>
          <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: spacing.lg }}>⚠</Text>
        <Text style={[typography.h2, { color: colors.error, textAlign: 'center', marginBottom: spacing.md }]}>
          Удаление аккаунта
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 22 }]}>
          Это действие необратимо. Все ваши данные — тренировки, питание, прогресс, история — будут удалены навсегда.
        </Text>

        {hasPassword && (
          <Input
            label="Подтвердите паролем"
            placeholder="Введите текущий пароль"
            secureTextEntry
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            containerStyle={{ marginBottom: spacing.md }}
          />
        )}

        {error ? (
          <Text style={[typography.small, { color: colors.error, marginBottom: spacing.md, textAlign: 'center' }]}>{error}</Text>
        ) : null}

        <Button
          title="Удалить аккаунт навсегда"
          onPress={handleDelete}
          loading={loading}
          disabled={loading}
          fullWidth
          size="lg"
          style={{ backgroundColor: colors.error }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxl },
});
