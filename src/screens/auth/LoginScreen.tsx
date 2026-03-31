import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useThemeStore, useAuthStore } from '../../store';
import { Button, Input } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

export const LoginScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Заполните все поля');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // TODO: Replace with actual API call
      const mockUser = {
        id: '1',
        email,
        firstName: 'Пользователь',
        lastName: '',
        healthRestrictions: [],
        role: 'client' as const,
        createdAt: new Date().toISOString(),
      };
      login(mockUser, 'mock-jwt-token');
    } catch (e: any) {
      setError(e.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[typography.h1, { color: colors.primary }]}>Iron Gym</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
            Войди в аккаунт, чтобы продолжить
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Email"
            placeholder="email@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            containerStyle={{ marginBottom: spacing.xl }}
          />
          <Input
            label="Пароль"
            placeholder="Введите пароль"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            containerStyle={{ marginBottom: spacing.md }}
          />

          {error ? (
            <Text style={[typography.small, { color: colors.error, marginBottom: spacing.md }]}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity style={{ alignSelf: 'flex-end', marginBottom: spacing.xxl }}>
            <Text style={[typography.smallMedium, { color: colors.primary }]}>
              Забыли пароль?
            </Text>
          </TouchableOpacity>

          <Button
            title="Войти"
            onPress={handleLogin}
            loading={loading}
            fullWidth
            size="lg"
          />

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[typography.small, { color: colors.textTertiary, marginHorizontal: spacing.lg }]}>
              или
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <Button
            title="Войти через Google"
            variant="secondary"
            onPress={() => {}}
            fullWidth
            style={{ marginBottom: spacing.md }}
          />
          <Button
            title="Войти через Apple"
            variant="secondary"
            onPress={() => {}}
            fullWidth
          />
        </View>

        <View style={styles.footer}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            Нет аккаунта?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={[typography.bodySemibold, { color: colors.primary }]}>
              Зарегистрируйся
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl },
  header: { alignItems: 'center', marginBottom: spacing.huge },
  form: {},
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xxl,
  },
  dividerLine: { flex: 1, height: 1 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xxxl,
  },
});
