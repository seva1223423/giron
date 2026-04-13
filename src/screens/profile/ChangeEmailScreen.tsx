import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { useThemeStore, useAuthStore } from '../../store';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { api } from '../../services/api';
import { userService } from '../../services/userService';
import { useSafeTop } from '../../hooks/useSafeTop';
import { Button } from '../../components';

type Step = 'enter_email' | 'enter_code';

export const ChangeEmailScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const { setUser, user } = useAuthStore();
  const [step, setStep] = useState<Step>('enter_email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = (seconds: number) => {
    setResendCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setResendCountdown((s) => {
        if (s <= 1) { clearInterval(countdownRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const sendOtp = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@') || !trimmed.includes('.')) {
      Alert.alert('Ошибка', 'Введите корректный email');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { email: trimmed, purpose: 'email-change' });
      setStep('enter_code');
      startCountdown(60);
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Не удалось отправить код';
      const secondsLeft = e?.response?.data?.secondsLeft;
      if (secondsLeft) {
        setStep('enter_code');
        startCountdown(secondsLeft);
      } else {
        Alert.alert('Ошибка', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (codeValue: string) => {
    if (codeValue.length !== 6) return;
    setLoading(true);
    try {
      await api.post('/user/change-email', { email: email.trim().toLowerCase(), code: codeValue });
      if (user) setUser({ ...user, email: email.trim().toLowerCase(), emailVerified: true });
      Alert.alert('Готово', 'Email успешно изменён', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Ошибка смены email';
      Alert.alert('Ошибка', msg);
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      setTimeout(() => submitCode(digits), 100);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: safeTop + spacing.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: spacing.xl }}>
        <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
      </TouchableOpacity>

      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>Сменить email</Text>

      {step === 'enter_email' ? (
        <>
          <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
            Введите новый адрес электронной почты. Мы отправим на него код подтверждения.
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="новый@email.com"
            placeholderTextColor={colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
          />
          <Button
            title="Получить код"
            onPress={sendOtp}
            loading={loading}
            fullWidth
            style={{ marginTop: spacing.xl }}
          />
        </>
      ) : (
        <>
          <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
            Код отправлен на {email}. Введите 6-значный код из письма.
          </Text>
          <TextInput
            style={[styles.input, styles.codeInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="------"
            placeholderTextColor={colors.textTertiary}
            value={code}
            onChangeText={onCodeChange}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />}

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl, gap: spacing.sm }}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>Не получили письмо?</Text>
            {resendCountdown > 0 ? (
              <Text style={[typography.body, { color: colors.textTertiary }]}>Повтор через {resendCountdown}с</Text>
            ) : (
              <TouchableOpacity onPress={sendOtp}>
                <Text style={[typography.body, { color: colors.primary }]}>Отправить ещё раз</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity onPress={() => { setStep('enter_email'); setCode(''); }} style={{ marginTop: spacing.lg, alignItems: 'center' }}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>Изменить email</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  input: {
    height: 52,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 8,
    height: 64,
  },
});
