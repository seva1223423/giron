import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useThemeStore, useAuthStore } from '../../store';
import { Button, Input } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';

export const RegisterScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { login } = useAuthStore();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!firstName || !email || !password) {
      setError('Заполните обязательные поля');
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // TODO: Replace with actual API call
      const mockUser = {
        id: '1',
        email,
        firstName,
        lastName,
        healthRestrictions: [],
        role: 'client' as const,
        createdAt: new Date().toISOString(),
      };
      login(mockUser, 'mock-jwt-token');
    } catch (e: any) {
      setError(e.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[typography.h1, { color: colors.primary }]}>Iron Gym</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
            Создай аккаунт
          </Text>
        </View>

        <View style={styles.row}>
          <Input
            label="Имя *"
            placeholder="Александр"
            value={firstName}
            onChangeText={setFirstName}
            containerStyle={{ flex: 1, marginRight: spacing.md }}
          />
          <Input
            label="Фамилия"
            placeholder="Иванов"
            value={lastName}
            onChangeText={setLastName}
            containerStyle={{ flex: 1 }}
          />
        </View>

        <Input
          label="Email *"
          placeholder="email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          containerStyle={{ marginTop: spacing.xl }}
        />

        <Input
          label="Пароль *"
          placeholder="Минимум 6 символов"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          containerStyle={{ marginTop: spacing.xl }}
        />

        <Input
          label="Подтвердите пароль *"
          placeholder="Повторите пароль"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          containerStyle={{ marginTop: spacing.xl }}
        />

        {error ? (
          <Text style={[typography.small, { color: colors.error, marginTop: spacing.md }]}>
            {error}
          </Text>
        ) : null}

        <Button
          title="Зарегистрироваться"
          onPress={handleRegister}
          loading={loading}
          fullWidth
          size="lg"
          style={{ marginTop: spacing.xxl }}
        />

        <View style={styles.footer}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            Уже есть аккаунт?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[typography.bodySemibold, { color: colors.primary }]}>Войти</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.huge },
  header: { alignItems: 'center', marginBottom: spacing.xxxl },
  row: { flexDirection: 'row' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xxxl,
  },
});
