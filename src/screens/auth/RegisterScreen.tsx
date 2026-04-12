import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useThemeStore, useAuthStore } from '../../store';
import { Button, Input } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';

export const RegisterScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { register, isLoading, error, clearError } = useAuthStore();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleRegister = async () => {
    if (!firstName || !email || !password) {
      setLocalError('Заполните обязательные поля');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Пароли не совпадают');
      return;
    }
    if (password.length < 6) {
      setLocalError('Пароль должен быть не менее 6 символов');
      return;
    }

    setLocalError('');
    clearError();
    try {
      await register({ email, password, firstName, lastName: lastName || undefined });
    } catch {
      // Error is set in the store
    }
  };

  const displayError = localError || error;
  const clearErrors = () => { setLocalError(''); clearError(); };

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
            onChangeText={(t) => { setFirstName(t); clearErrors(); }}
            containerStyle={{ flex: 1, marginRight: spacing.md }}
          />
          <Input
            label="Фамилия"
            placeholder="Иванов"
            value={lastName}
            onChangeText={(t) => { setLastName(t); clearErrors(); }}
            containerStyle={{ flex: 1 }}
          />
        </View>

        <Input
          label="Email *"
          placeholder="email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={(t) => { setEmail(t); clearErrors(); }}
          containerStyle={{ marginTop: spacing.xl }}
        />

        <Input
          label="Пароль *"
          placeholder="Минимум 6 символов"
          secureTextEntry
          value={password}
          onChangeText={(t) => { setPassword(t); clearErrors(); }}
          containerStyle={{ marginTop: spacing.xl }}
        />

        <Input
          label="Подтвердите пароль *"
          placeholder="Повторите пароль"
          secureTextEntry
          value={confirmPassword}
          onChangeText={(t) => { setConfirmPassword(t); clearErrors(); }}
          containerStyle={{ marginTop: spacing.xl }}
        />

        {displayError ? (
          <Text style={[typography.small, { color: colors.error, marginTop: spacing.md }]}>
            {displayError}
          </Text>
        ) : null}

        <Button
          title="Зарегистрироваться"
          onPress={handleRegister}
          loading={isLoading}
          fullWidth
          size="lg"
          style={{ marginTop: spacing.xxl }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xxl }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={[typography.small, { color: colors.textTertiary, marginHorizontal: spacing.lg }]}>или</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <TouchableOpacity
          onPress={() => Alert.alert('Скоро', 'Авторизация через Google будет доступна в следующем обновлении.')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#DDD', backgroundColor: colors.surface, marginBottom: spacing.md }}
        >
          <Text style={{ fontSize: 18, marginRight: spacing.sm }}>G</Text>
          <Text style={[typography.bodySemibold, { color: colors.text }]}>Регистрация через Google</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Alert.alert('Скоро', 'Авторизация через VK будет доступна в следующем обновлении.')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: '#0077FF' }}
        >
          <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Регистрация через VK</Text>
        </TouchableOpacity>

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
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xxxl,
  },
});
