import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useThemeStore } from '../../store';
import { Button, Input } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { authService } from '../../services/authService';

export const ForgotPasswordScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Введите email');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authService.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Ошибка отправки. Попробуй позже.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <Text style={{ fontSize: 64, textAlign: 'center', marginBottom: spacing.xl }}>📬</Text>
          <Text style={[typography.h2, { color: colors.text, textAlign: 'center', marginBottom: spacing.md }]}>
            Письмо отправлено
          </Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.huge }]}>
            Проверь почту {email}.{'\n'}Ссылка для сброса действительна 1 час.
          </Text>
          <Button title="Вернуться к входу" onPress={() => navigation.navigate('Login')} fullWidth size="lg" />
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
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}><Text style={{ fontSize: 22, fontWeight: '700', color: colors.primary }}>◈</Text></View>
          <Text style={[typography.h2, { color: colors.text }]}>Забыли пароль?</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', lineHeight: 22 }]}>
            Введи email и мы отправим ссылку для сброса пароля
          </Text>
        </View>

        <Input
          label="Email"
          placeholder="email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={(t) => { setEmail(t); setError(''); }}
          containerStyle={{ marginBottom: spacing.md }}
        />

        {error ? (
          <Text style={[typography.small, { color: colors.error, marginBottom: spacing.md }]}>
            {error}
          </Text>
        ) : null}

        <Button
          title="Отправить ссылку"
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
