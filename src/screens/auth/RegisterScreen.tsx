import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, TextInput,
} from 'react-native';
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

/** Compute password strength 0–4 */
function passwordStrength(p: string): number {
  if (!p) return 0;
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  return Math.min(4, score);
}

const STRENGTH_LABELS = ['', 'Слабый', 'Средний', 'Хороший', 'Отличный'];
const STRENGTH_COLORS = ['', '#EF4444', '#FF9F0A', '#34C759', '#8B5CF6'];

/** Format phone digits into display string */
function formatPhone(digits: string): string {
  if (!digits) return '';
  let result = '+7';
  if (digits.length > 0) result += ' (' + digits.slice(0, 3);
  if (digits.length >= 3) result += ') ' + digits.slice(3, 6);
  if (digits.length >= 6) result += '-' + digits.slice(6, 8);
  if (digits.length >= 8) result += '-' + digits.slice(8, 10);
  return result;
}

export const RegisterScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { register, loginWithGoogle, isLoading, error, clearError } = useAuthStore();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneDigits, setPhoneDigits] = useState(''); // 10 local digits
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const [step, setStep] = useState<Step>('form');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          .catch((e) => setLocalError(e?.response?.data?.error || 'Ошибка через Google'))
          .finally(() => setGoogleLoading(false));
      } else {
        setLocalError('Не удалось получить токен от Google');
      }
    } else if (response?.type === 'error') {
      setLocalError('Ошибка авторизации через Google');
    }
  }, [response]);

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const startCountdown = (seconds = 60) => {
    setOtpCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setOtpCountdown((v) => {
        if (v <= 1) { if (countdownRef.current) clearInterval(countdownRef.current); return 0; }
        return v - 1;
      });
    }, 1000);
  };

  const clearErrors = () => { setLocalError(''); clearError(); };

  const validateForm = (): boolean => {
    if (!firstName.trim()) { setLocalError('Введите имя'); return false; }
    if (!email.trim() || !email.includes('@')) { setLocalError('Введите корректный email'); return false; }
    if (!password) { setLocalError('Введите пароль'); return false; }
    if (password.length < 6) { setLocalError('Пароль минимум 6 символов'); return false; }
    if (password !== confirmPassword) { setLocalError('Пароли не совпадают'); return false; }
    return true;
  };

  const fullPhone = phoneDigits ? `+7${phoneDigits}` : '';

  const handleRegister = async () => {
    if (!validateForm()) return;
    clearErrors();

    if (phoneDigits.length === 10) {
      // Need to send OTP first
      setOtpSending(true);
      try {
        await authService.sendOtp({ phone: fullPhone, purpose: 'register' });
        setStep('otp');
        startCountdown();
      } catch (e: any) {
        setLocalError(e?.response?.data?.error || 'Не удалось отправить SMS');
      } finally {
        setOtpSending(false);
      }
    } else {
      // Register without phone
      try {
        await register({ email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() || undefined });
      } catch { /* error in store */ }
    }
  };

  const handleVerifyAndRegister = async () => {
    const trimmedCode = otpCode.trim();
    if (trimmedCode.length !== 6) { setLocalError('Введите 6-значный код'); return; }
    clearErrors();

    // Pass the code directly to register — server validates the OTP there.
    // Do NOT call verifyOtp separately (that was causing the double-use bug).
    try {
      await register({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: fullPhone,
        otpToken: trimmedCode,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Ошибка регистрации';
      setLocalError(msg);
    }
  };

  const handleResendOtp = async () => {
    if (otpCountdown > 0) return;
    clearErrors();
    setOtpSending(true);
    try {
      await authService.sendOtp({ phone: fullPhone, purpose: 'register' });
      startCountdown();
    } catch (e: any) {
      setLocalError(e?.response?.data?.error || 'Не удалось отправить SMS');
    } finally {
      setOtpSending(false);
    }
  };

  const strength = passwordStrength(password);
  const anyLoading = isLoading || otpSending || googleLoading;
  const displayError = localError || error;

  // ── OTP step ─────────────────────────────────────────────────────────────────

  if (step === 'otp') {
    return (
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => { setStep('form'); setOtpCode(''); clearErrors(); }} style={{ alignSelf: 'flex-start', marginBottom: spacing.xl }}>
            <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={[typography.h1, { color: colors.text }]}>Подтверждение</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
              Введите код из SMS, отправленного на{'\n'}
              <Text style={{ color: colors.text, fontWeight: '700' }}>{formatPhone(phoneDigits)}</Text>
            </Text>
          </View>

          <TextInput
            style={[styles.otpInput, { backgroundColor: colors.surface, borderColor: otpCode.length === 6 ? colors.primary : colors.border, color: colors.text }]}
            value={otpCode}
            onChangeText={(t) => { setOtpCode(t.replace(/\D/g, '').slice(0, 6)); clearErrors(); }}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="——————"
            placeholderTextColor={colors.textTertiary}
            autoFocus
          />

          {displayError ? <Text style={[typography.small, { color: colors.error, textAlign: 'center', marginBottom: spacing.md }]}>{displayError}</Text> : null}

          <Button
            title="Зарегистрироваться"
            onPress={handleVerifyAndRegister}
            loading={isLoading}
            disabled={anyLoading || otpCode.length !== 6}
            fullWidth size="lg" style={{ marginBottom: spacing.xl }}
          />

          <TouchableOpacity onPress={handleResendOtp} disabled={otpCountdown > 0 || otpSending} style={{ alignItems: 'center', padding: spacing.sm }}>
            {otpSending
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[typography.small, { color: otpCountdown > 0 ? colors.textTertiary : colors.primary }]}>
                  {otpCountdown > 0 ? `Отправить снова (${otpCountdown}с)` : 'Отправить повторно'}
                </Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Registration form ─────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[typography.h1, { color: colors.primary }]}>Iron Gym</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>Создай аккаунт</Text>
        </View>

        <View style={styles.row}>
          <Input label="Имя *" placeholder="Александр" value={firstName}
            onChangeText={(t) => { setFirstName(t); clearErrors(); }}
            containerStyle={{ flex: 1, marginRight: spacing.md }} />
          <Input label="Фамилия" placeholder="Иванов" value={lastName}
            onChangeText={(t) => { setLastName(t); clearErrors(); }}
            containerStyle={{ flex: 1 }} />
        </View>

        <Input
          label="Email *" placeholder="email@example.com"
          keyboardType="email-address" autoCapitalize="none"
          value={email} onChangeText={(t) => { setEmail(t); clearErrors(); }}
          containerStyle={{ marginTop: spacing.xl }}
        />

        {/* Phone with +7 prefix */}
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[typography.small, { color: colors.textSecondary, marginBottom: 6 }]}>Телефон</Text>
          <View style={[styles.phoneRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[typography.body, { color: colors.textSecondary, marginRight: 8 }]}>🇷🇺 +7</Text>
            <TextInput
              style={[styles.phoneField, { color: colors.text }]}
              value={formatPhone(phoneDigits).slice(3)} // strip "+7 " for display
              onChangeText={(t) => {
                const d = t.replace(/\D/g, '').slice(0, 10);
                setPhoneDigits(d);
                clearErrors();
              }}
              keyboardType="phone-pad"
              placeholder="(999) 000-00-00"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 4 }]}>
            {phoneDigits.length === 10
              ? 'Потребуется SMS-подтверждение'
              : 'Необязательно — для входа по SMS'}
          </Text>
        </View>

        {/* Password with strength indicator */}
        <Input
          label="Пароль *" placeholder="Минимум 6 символов" secureTextEntry
          value={password} onChangeText={(t) => { setPassword(t); clearErrors(); }}
          containerStyle={{ marginTop: spacing.xl }}
        />
        {password.length > 0 && (
          <View style={{ marginTop: 6 }}>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= strength ? STRENGTH_COLORS[strength] : colors.border }} />
              ))}
            </View>
            <Text style={[typography.caption, { color: STRENGTH_COLORS[strength] }]}>{STRENGTH_LABELS[strength]}</Text>
          </View>
        )}

        <Input
          label="Подтвердите пароль *" placeholder="Повторите пароль" secureTextEntry
          value={confirmPassword} onChangeText={(t) => { setConfirmPassword(t); clearErrors(); }}
          containerStyle={{ marginTop: spacing.xl }}
        />

        {displayError ? <Text style={[typography.small, { color: colors.error, marginTop: spacing.md }]}>{displayError}</Text> : null}

        <Button
          title={phoneDigits.length === 10 ? 'Далее — подтвердить телефон' : 'Зарегистрироваться'}
          onPress={handleRegister}
          loading={isLoading || otpSending}
          disabled={anyLoading}
          fullWidth size="lg" style={{ marginTop: spacing.xxl }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xxl }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={[typography.small, { color: colors.textTertiary, marginHorizontal: spacing.lg }]}>или</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <TouchableOpacity
          onPress={async () => { if (!googleConfigured) { setLocalError('Google OAuth не настроен'); return; } clearErrors(); await promptAsync(); }}
          disabled={anyLoading || !request}
          style={[styles.socialBtn, { borderColor: colors.border, backgroundColor: colors.surface, marginBottom: spacing.sm }, (anyLoading || !request) && { opacity: 0.5 }]}
        >
          {googleLoading
            ? <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: spacing.sm }} />
            : <Text style={{ fontSize: 18, marginRight: spacing.sm, fontWeight: '700', color: '#4285F4' }}>G</Text>
          }
          <Text style={[typography.bodySemibold, { color: colors.text }]}>Регистрация через Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setLocalError('Укажите VK_APP_ID в настройках сервера')}
          style={[styles.socialBtn, { backgroundColor: '#0077FF', borderColor: '#0077FF' }]}
        >
          <Text style={{ fontSize: 16, marginRight: spacing.sm, color: '#FFF', fontWeight: '800' }}>ВК</Text>
          <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Регистрация через VK</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>Уже есть аккаунт? </Text>
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
  phoneRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 14,
  },
  phoneField: { flex: 1, fontSize: 16 },
  otpInput: {
    fontSize: 32, fontWeight: '700', letterSpacing: 12, textAlign: 'center',
    borderWidth: 2, borderRadius: 16, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    marginVertical: spacing.xl, alignSelf: 'center', width: 240,
  },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, borderWidth: 1,
  },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xxxl },
});
