import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useThemeStore } from '../../store';
import { Button, Input } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { authService } from '../../services/authService';

export const ResetPasswordScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { colors } = useThemeStore();
  const [token, setToken] = useState(route.params?.token || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (route.params?.token) {
      setToken(route.params.token);
    }
  }, [route.params?.token]);

  const handleSubmit = async () => {
    if (!token.trim()) {
      setError('Токен сброса отсутствует. Перейди по ссылке из письма.');
      return;
    }
    if (password.length < 6) {
      setError('Пароль минимум 6 символов');
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authService.resetPassword(token.trim(), password);
      setDone(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Ссылка недействительна или истекла');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#10B981' + '18', alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl }}><Text style={{ fontSize: 28, fontWeight: '700', color: '#10B981' }}>✓</Text></View>
          <Text style={[typography.h2, { color: colors.text, textAlign: 'center', marginBottom: spacing.md }]}>
            Пароль изменён
          </Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.huge }]}>
            Теперь ты можешь войти с новым паролем
          </Text>
          <Button title="Войти" onPress={() => navigation.navigate('Login')} fullWidth size="lg" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}><Text style={{ fontSize: 22, fontWeight: '700', color: colors.primary }}>◈</Text></View>
          <Text style={[typography.h2, { color: colors.text }]}>Новый пароль</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
            Придумай надёжный пароль (минимум 6 символов)
          </Text>
        </View>

        <Input
          label="Новый пароль"
          placeholder="Минимум 6 символов"
          secureTextEntry
          value={password}
          onChangeText={(t) => { setPassword(t); setError(''); }}
          containerStyle={{ marginBottom: spacing.xl }}
        />
        <Input
          label="Повтори пароль"
          placeholder="Введи пароль ещё раз"
          secureTextEntry
          value={confirmPassword}
          onChangeText={(t) => { setConfirmPassword(t); setError(''); }}
          containerStyle={{ marginBottom: spacing.md }}
        />

        {error ? (
          <Text style={[typography.small, { color: colors.error, marginBottom: spacing.md }]}>
            {error}
          </Text>
        ) : null}

        <Button
          title="Сохранить пароль"
          onPress={handleSubmit}
          loading={loading}
          fullWidth
          size="lg"
          style={{ marginBottom: spacing.xl }}
        />

        <Button
          title="Назад"
          variant="outline"
          onPress={() => navigation.goBack()}
          fullWidth
        />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl },
  header: { alignItems: 'center', marginBottom: spacing.huge },
});
