import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useThemeStore, useAuthStore } from '../../store';
import { Button, Input } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { authService } from '../../services/authService';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB;
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS;
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID;
const googleConfigured = !!(GOOGLE_CLIENT_ID_WEB || GOOGLE_CLIENT_ID_IOS || GOOGLE_CLIENT_ID_ANDROID);

type Step = 'form' | 'otp';

export const RegisterScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { register, loginWithGoogle, isLoading, error, clearError } = useAuthStore();

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  // OTP step
  const [step, setStep] = useState<Step>('form');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Google OAuth
  const [googleLoading, setGoogleLoading] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID_WEB,
    iosClientId: GOOGLE_CLIENT_ID_IOS,
    androidClientId: GOOGLE_CLIENT_ID_ANDROID,
    scopes: ['openid', 'profile', 'email'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.authentication?.idToken;
      if (idToken) {
        setGoogleLoading(true);
        loginWithGoogle(idToken)
          .catch((e) => {
            const msg = e?.response?.data?.error || e?.message || 'Ошибка входа через Google';
            setLocalError(msg);
          })
          .finally(() => setGoogleLoading(false));
      } else {
        setLocalError('Не удалось получить токен от Google');
      }
    } else if (response?.type === 'error') {
      setLocalError('Ошибка авторизации через Google');
    }
  }, [response]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const startCountdown = () => {
    setOtpCountdown(60);
    countdownRef.current = setInterval(() => {
      setOtpCountdown((v) => {
        if (v <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  };

  const clearErrors = () => { setLocalError(''); clearError(); };

  const validateForm = (): boolean => {
    if (!firstName.trim()) { setLocalError('Введите имя'); return false; }
    if (!email.trim()) { setLocalError('Введите email'); return false; }
    if (!password) { setLocalError('Введите пароль'); return false; }
    if (password.length < 6) { setLocalError('Пароль должен быть не менее 6 символов'); return false; }
    if (password !== confirmPassword) { setLocalError('Пароли не совпадают'); return false; }
    return true;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;
    clearErrors();

    const trimmedPhone = phone.trim();

    if (trimmedPhone) {
      // Need OTP first
      setOtpSending(true);
      try {
        await authService.sendOtp({ phone: trimmedPhone, purpose: 'register' });
        setStep('otp');
        startCountdown();
      } catch (e: any) {
        const msg = e?.response?.data?.error || 'Не удалось отправить SMS';
        setLocalError(msg);
      } finally {
        setOtpSending(false);
      }
    } else {
      // No phone, register directly
      try {
        await register({ email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() || undefined });
      } catch {
        // Error is in the store
      }
    }
  };

  const handleVerifyOtp = async () => {
    const trimmedCode = otpCode.trim();
    if (trimmedCode.length !== 6) {
      setLocalError('Введите 6-значный код');
      return;
    }
    clearErrors();
    setOtpVerifying(true);
    try {
      const valid = await authService.verifyOtp({ phone: phone.trim(), code: trimmedCode, purpose: 'register' });
      if (!valid) {
        setLocalError('Неверный или истёкший код');
        return;
      }
      // OTP confirmed — complete registration
      await register({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: phone.trim(),
        otpToken: trimmedCode,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Ошибка подтверждения';
      setLocalError(msg);
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCountdown > 0) return;
    clearErrors();
    setOtpSending(true);
    try {
      await authService.sendOtp({ phone: phone.trim(), purpose: 'register' });
      startCountdown();
    } catch (e: any) {
      setLocalError(e?.response?.data?.error || 'Не удалось отправить SMS');
    } finally {
      setOtpSending(false);
    }
  };

  const handleGooglePress = async () => {
    if (!googleConfigured) { setLocalError('Google OAuth не настроен'); return; }
    clearErrors();
    await promptAsync();
  };

  const displayError = localError || error;
  const anyLoading = isLoading || otpSending || otpVerifying || googleLoading;

  // ─── OTP Step ─────────────────────────────────────────────────────────────

  if (step === 'otp') {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => { setStep('form'); setOtpCode(''); clearErrors(); }} style={{ alignSelf: 'flex-start', marginBottom: spacing.xl, padding: spacing.sm }}>
            <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={[typography.h1, { color: colors.text }]}>Подтверждение</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
              Введите код из SMS, отправленного на{'\n'}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{phone}</Text>
            </Text>
          </View>

          <View style={styles.otpContainer}>
            <TextInput
              style={[
                styles.otpInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: otpCode.length === 6 ? colors.primary : colors.border,
                  color: colors.text,
                },
              ]}
              value={otpCode}
              onChangeText={(t) => { setOtpCode(t.replace(/\D/g, '').slice(0, 6)); clearErrors(); }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="——————"
              placeholderTextColor={colors.textTertiary}
              autoFocus
            />
          </View>

          {displayError ? (
            <Text style={[typography.small, { color: colors.error, textAlign: 'center', marginBottom: spacing.md }]}>
              {displayError}
            </Text>
          ) : null}

          <Button
            title="Подтвердить"
            onPress={handleVerifyOtp}
            loading={isLoading || otpVerifying}
            disabled={anyLoading || otpCode.length !== 6}
            fullWidth
            size="lg"
            style={{ marginBottom: spacing.xl }}
          />

          <TouchableOpacity onPress={handleResendOtp} disabled={otpCountdown > 0 || otpSending} style={{ alignItems: 'center', padding: spacing.sm }}>
            {otpSending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[typography.small, { color: otpCountdown > 0 ? colors.textTertiary : colors.primary }]}>
                {otpCountdown > 0 ? `Отправить снова (${otpCountdown}с)` : 'Отправить код повторно'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ─── Registration Form ────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
          label="Телефон"
          placeholder="+7 999 000 00 00"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(t) => { setPhone(t); clearErrors(); }}
          containerStyle={{ marginTop: spacing.xl }}
        />
        <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
          Необязательно. При указании телефона потребуется SMS-подтверждение.
        </Text>

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
          title={phone.trim() ? 'Далее — подтвердить телефон' : 'Зарегистрироваться'}
          onPress={handleRegister}
          loading={isLoading || otpSending}
          disabled={anyLoading}
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
          onPress={handleGooglePress}
          disabled={anyLoading || !request}
          style={[
            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: spacing.md },
            (anyLoading || !request) && { opacity: 0.5 },
          ]}
        >
          {googleLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: spacing.sm }} />
          ) : (
            <Text style={{ fontSize: 18, marginRight: spacing.sm, fontWeight: '700', color: '#4285F4' }}>G</Text>
          )}
          <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>Регистрация через Google</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={[typography.body, { color: colors.textSecondary }]} numberOfLines={1}>
            Уже есть аккаунт?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[typography.bodySemibold, { color: colors.primary }]} numberOfLines={1}>Войти</Text>
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
  otpContainer: {
    alignItems: 'center',
    marginVertical: spacing.xxxl,
  },
  otpInput: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 12,
    textAlign: 'center',
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    width: 240,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xxxl,
  },
});
