import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { useThemeStore } from '../../store';
import { useAuthStore } from '../../store';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { api } from '../../services/api';
import { userService } from '../../services/userService';
import { useSafeTop } from '../../hooks/useSafeTop';
import { Button } from '../../components';

type Step = 'enter_phone' | 'enter_code' | 'enter_totp';

export const ChangePhoneScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const [step, setStep] = useState<Step>('enter_phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasTwoFactor, setHasTwoFactor] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifiedCodeRef = useRef('');

  useEffect(() => {
    api.get<{ enabled: boolean }>('/user/2fa/status')
      .then(({ data }) => setHasTwoFactor(data.enabled))
      .catch(() => {});
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const startCountdown = (seconds: number) => {
    setResendCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setResendCountdown((s) => {
        if (s <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const sendOtp = async (showAlert = true) => {
    const normalized = phone.trim().replace(/\D/g, '');
    if (normalized.length < 10) {
      if (showAlert) Alert.alert('Ошибка', 'Введите корректный номер телефона');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { phone: phone.trim(), purpose: 'phone-change' });
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

  const submitChange = async (smsOtp: string, totp?: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await userService.changePhone(phone.trim(), smsOtp, totp);
      // Update stored tokens — server issued fresh tokens after revoking all other sessions
      if (result.token && result.refreshToken) {
        await useAuthStore.getState().updateTokens(result.token, result.refreshToken);
      }
      Alert.alert('Готово', 'Номер телефона успешно изменён', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      const errCode = e?.response?.data?.code;
      const msg = e?.response?.data?.error || 'Ошибка смены номера';
      if (errCode === 'TOTP_REQUIRED' || errCode === 'INVALID_TOTP') {
        Alert.alert('Ошибка', 'Неверный код 2FA');
        setTotpCode('');
      } else {
        Alert.alert('Ошибка', msg);
        setCode('');
        setStep('enter_code');
      }
    } finally {
      setLoading(false);
    }
  };

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      if (hasTwoFactor) {
        verifiedCodeRef.current = digits;
        setTimeout(() => setStep('enter_totp'), 100);
      } else {
        setTimeout(() => submitChange(digits), 100);
      }
    }
  };

  const onTotpChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(digits);
    if (digits.length === 6) {
      setTimeout(() => submitChange(verifiedCodeRef.current, digits), 100);
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

      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>Сменить номер телефона</Text>

      {step === 'enter_phone' ? (
        <>
          <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
            Введите новый номер телефона. Мы отправим на него код подтверждения.
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="+7 (___) ___-__-__"
            placeholderTextColor={colors.textTertiary}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoFocus
          />
          <Button
            title="Получить код"
            onPress={() => sendOtp()}
            loading={loading}
            fullWidth
            style={{ marginTop: spacing.xl }}
          />
        </>
      ) : step === 'enter_code' ? (
        <>
          <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
            Код отправлен на номер {phone}. Введите 6-значный код из SMS.
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
            <Text style={[typography.body, { color: colors.textSecondary }]}>Не получили код?</Text>
            {resendCountdown > 0 ? (
              <Text style={[typography.body, { color: colors.textTertiary }]}>Повтор через {resendCountdown}с</Text>
            ) : (
              <TouchableOpacity onPress={() => sendOtp()}>
                <Text style={[typography.body, { color: colors.primary }]}>Отправить ещё раз</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity onPress={() => { setStep('enter_phone'); setCode(''); }} style={{ marginTop: spacing.lg, alignItems: 'center' }}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>Изменить номер</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
            Введите 6-значный код из приложения-аутентификатора для подтверждения смены номера телефона.
          </Text>
          <TextInput
            style={[styles.input, styles.codeInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="------"
            placeholderTextColor={colors.textTertiary}
            value={totpCode}
            onChangeText={onTotpChange}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />}

          <TouchableOpacity onPress={() => { setStep('enter_code'); setTotpCode(''); }} style={{ marginTop: spacing.xl, alignItems: 'center' }}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>← Назад</Text>
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
