import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { useThemeStore, useAuthStore } from '../../store';
import { Button, Input } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';

export const LoginScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setLocalError('Заполните все поля');
      return;
    }
    setLocalError('');
    clearError();
    try {
      await login(email, password);
    } catch {
      // Error is set in the store
    }
  };

  const displayError = localError || error;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFF' }}>IG</Text>
          </View>
          <Text style={{ fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -1 }}>Iron Gym</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            Твой персональный AI-тренер
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Email"
            placeholder="email@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={(t) => { setEmail(t); setLocalError(''); clearError(); }}
            containerStyle={{ marginBottom: spacing.xl }}
          />
          <Input
            label="Пароль"
            placeholder="Введите пароль"
            secureTextEntry
            value={password}
            onChangeText={(t) => { setPassword(t); setLocalError(''); clearError(); }}
            containerStyle={{ marginBottom: spacing.md }}
          />

          {displayError ? (
            <Text style={[typography.small, { color: colors.error, marginBottom: spacing.md }]}>
              {displayError}
            </Text>
          ) : null}

          <TouchableOpacity style={{ alignSelf: 'flex-end', marginBottom: spacing.xxl }} onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={[typography.smallMedium, { color: colors.primary }]}>
              Забыли пароль?
            </Text>
          </TouchableOpacity>

          <Button
            title="Войти"
            onPress={handleLogin}
            loading={isLoading}
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

          <TouchableOpacity
            onPress={() => Alert.alert('Скоро', 'Авторизация через Google будет доступна в следующем обновлении.')}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: spacing.md }}
          >
            <Text style={{ fontSize: 18, marginRight: spacing.sm }}>G</Text>
            <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>Войти через Google</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Alert.alert('Скоро', 'Авторизация через VK будет доступна в следующем обновлении.')}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: '#0077FF' }}
          >
            <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Войти через VK</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={[typography.body, { color: colors.textSecondary }]} numberOfLines={1}>
            Нет аккаунта?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={[typography.bodySemibold, { color: colors.primary }]} numberOfLines={1}>
              Зарегистрируйся
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xl }]}>v1.0.0</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxl },
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
