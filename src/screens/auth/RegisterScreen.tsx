import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, TextInput, Linking,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { useThemeStore, useAuthStore } from '../../store';
import { Button, Input, GoogleAuthButton } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { authService } from '../../services/authService';
import { features } from '../../config/store';

const googleConfigured = !!(
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ||
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ||
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID
);
const VK_APP_ID = process.env.EXPO_PUBLIC_VK_APP_ID;
const YANDEX_CLIENT_ID = process.env.EXPO_PUBLIC_YANDEX_CLIENT_ID;
const OK_APP_ID = process.env.EXPO_PUBLIC_OK_APP_ID;
const MAILRU_APP_ID = process.env.EXPO_PUBLIC_MAILRU_APP_ID;

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
  const { register, loginWithYandex, isLoading, error, clearError } = useAuthStore();

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

  const [vkLoading, setVkLoading] = useState(false);
  const [yandexLoading, setYandexLoading] = useState(false);
  const [okLoading, setOkLoading] = useState(false);
  const [mailruLoading, setMailruLoading] = useState(false);

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
    if (password.length < 8) { setLocalError('Пароль минимум 8 символов'); return false; }
    if (!/[A-Z]/.test(password)) { setLocalError('Пароль должен содержать хотя бы одну заглавную букву'); return false; }
    if (!/[a-z]/.test(password)) { setLocalError('Пароль должен содержать хотя бы одну строчную букву'); return false; }
    if (!/[0-9]/.test(password)) { setLocalError('Пароль должен содержать хотя бы одну цифру'); return false; }
    if (password !== confirmPassword) { setLocalError('Пароли не совпадают'); return false; }
    return true;
  };

  const fullPhone = phoneDigits ? `+7${phoneDigits}` : '';

  const handleRegister = async () => {
    if (!validateForm()) return;
    clearErrors();

    // Pre-check email availability before burning an SMS quota on a registration
    // that the server will just reject. checkEmail swallows network errors and
    // returns { exists: false } — in that case we fall through and let the final
    // register call surface any server-side 409 instead.
    const emailTrimmed = email.trim().toLowerCase();
    setOtpSending(true); // reuses the spinner — we're doing a network call here too
    try {
      const check = await authService.checkEmail(emailTrimmed);
      if (check.exists) {
        const methods: string[] = [];
        if (check.hasPassword) methods.push('паролем');
        if (check.hasGoogle) methods.push('Google');
        if (check.hasVk) methods.push('VK');
        if (check.hasYandex) methods.push('Яндекс');
        if (check.hasOk) methods.push('OK.ru');
        if (check.hasMailru) methods.push('Mail.ru');
        const hint = methods.length > 0
          ? ` Войдите через ${methods.join(' / ')}.`
          : '';
        setLocalError(`Email уже зарегистрирован.${hint}`);
        return;
      }
    } catch {
      // Non-fatal — proceed; the registration itself will surface conflicts
    } finally {
      setOtpSending(false);
    }

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
        await register({ email: emailTrimmed, password, firstName: firstName.trim(), lastName: lastName.trim() || undefined });
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
        email: email.trim().toLowerCase(),
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

  const handleYandexPress = async () => {
    if (!YANDEX_CLIENT_ID) { setLocalError('Yandex OAuth не настроен (нужен EXPO_PUBLIC_YANDEX_CLIENT_ID)'); return; }
    clearErrors();
    setYandexLoading(true);
    try {
      const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const redirectUri = makeRedirectUri({ scheme: 'irongym', path: 'auth/yandex' });
      const authUrl = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${YANDEX_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === 'success') {
        const fragment = result.url.split('#')[1] || '';
        const params = new URLSearchParams(fragment);
        const returnedState = params.get('state');
        if (returnedState !== state) { setLocalError('Ошибка безопасности: невалидный state'); return; }
        const accessToken = params.get('access_token');
        if (accessToken) {
          await loginWithYandex(accessToken);
        } else {
          setLocalError('Не удалось получить токен от Яндекса');
        }
      }
    } catch (e: any) {
      if (e?.code === 'TOTP_REQUIRED') { navigation.navigate('Login'); return; }
      setLocalError(e?.response?.data?.error || 'Ошибка через Яндекс');
    } finally {
      setYandexLoading(false);
    }
  };

  const handleVkPress = async () => {
    if (!VK_APP_ID) { setLocalError('VK OAuth не настроен (нужен EXPO_PUBLIC_VK_APP_ID)'); return; }
    clearErrors();
    setVkLoading(true);
    try {
      const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const redirectUri = makeRedirectUri({ scheme: 'irongym', path: 'auth/vk' });
      const authUrl = `https://oauth.vk.com/authorize?client_id=${VK_APP_ID}&display=mobile&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&v=5.199&scope=email&state=${state}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === 'success') {
        const fragment = result.url.split('#')[1] || '';
        const params = new URLSearchParams(fragment);
        const returnedState = params.get('state');
        if (returnedState !== state) { setLocalError('Ошибка безопасности: невалидный state'); return; }
        const accessToken = params.get('access_token');
        const userId = parseInt(params.get('user_id') || '0', 10);
        const email = params.get('email') || undefined;
        if (accessToken && userId) {
          const store = useAuthStore.getState();
          await store.loginWithVk({ accessToken, userId, email });
        } else {
          setLocalError('Не удалось получить данные от VK');
        }
      }
    } catch (e: any) {
      if (e?.code === 'TOTP_REQUIRED') { navigation.navigate('Login'); return; }
      setLocalError(e?.response?.data?.error || 'Ошибка через VK');
    } finally {
      setVkLoading(false);
    }
  };

  const handleOkPress = async () => {
    if (!OK_APP_ID) return;
    clearErrors();
    setOkLoading(true);
    try {
      const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const redirectUri = makeRedirectUri({ scheme: 'irongym', path: 'auth/ok' });
      const authUrl = `https://connect.ok.ru/oauth/authorize?client_id=${OK_APP_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=VALUABLE_ACCESS&state=${state}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type !== 'success') return;
      const fragment = result.url.split('#')[1] ?? '';
      const params = new URLSearchParams(fragment);
      const returnedState = params.get('state');
      if (returnedState !== state) { setLocalError('Ошибка безопасности: невалидный state'); return; }
      const accessToken = params.get('access_token');
      const userId = params.get('logged_in_as');
      if (!accessToken || !userId) { setLocalError('Не удалось получить данные от OK.ru'); return; }
      await useAuthStore.getState().loginWithOk({ accessToken, userId });
    } catch (e: any) {
      if (e?.code === 'TOTP_REQUIRED') { navigation.navigate('Login'); return; }
      setLocalError(e?.response?.data?.error ?? 'Ошибка регистрации через OK.ru');
    } finally {
      setOkLoading(false);
    }
  };

  const handleMailruPress = async () => {
    if (!MAILRU_APP_ID) return;
    clearErrors();
    setMailruLoading(true);
    try {
      const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const redirectUri = makeRedirectUri({ scheme: 'irongym', path: 'auth/mailru' });
      const authUrl = `https://oauth.mail.ru/login?client_id=${MAILRU_APP_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=userinfo&state=${state}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type !== 'success') return;
      const fragment = result.url.split('#')[1] ?? '';
      const params = new URLSearchParams(fragment);
      const returnedState = params.get('state');
      if (returnedState !== state) { setLocalError('Ошибка безопасности: невалидный state'); return; }
      const accessToken = params.get('access_token');
      if (!accessToken) { setLocalError('Не удалось получить токен от Mail.ru'); return; }
      await useAuthStore.getState().loginWithMailru(accessToken);
    } catch (e: any) {
      if (e?.code === 'TOTP_REQUIRED') { navigation.navigate('Login'); return; }
      setLocalError(e?.response?.data?.error ?? 'Ошибка регистрации через Mail.ru');
    } finally {
      setMailruLoading(false);
    }
  };

  const anyLoading = isLoading || otpSending || vkLoading || yandexLoading || okLoading || mailruLoading;
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

        {/* Phone with +7 prefix — explicitly labelled optional so users
            don't accidentally enter it and trigger the SMS+OTP loop, which
            adds 30s-2min to TTFV. The hint text below the field reinforces
            this once they start typing. */}
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[typography.small, { color: colors.textSecondary, marginBottom: 6 }]}>Телефон (необязательно)</Text>
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
          label="Пароль *" placeholder="Минимум 8 символов" secureTextEntry
          value={password} onChangeText={(t) => { setPassword(t); clearErrors(); }}
          containerStyle={{ marginTop: spacing.xl }}
        />
        {password.length > 0 && (
          <View style={{ marginTop: 6 }}>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= strength ? STRENGTH_COLORS[strength] : colors.border }} />
              ))}
            </View>
            <Text style={[typography.caption, { color: STRENGTH_COLORS[strength], marginBottom: 4 }]}>{STRENGTH_LABELS[strength]}</Text>
            {[
              { ok: password.length >= 8, label: 'Не менее 8 символов' },
              { ok: /[A-Z]/.test(password), label: 'Заглавная буква (A–Z)' },
              { ok: /[a-z]/.test(password), label: 'Строчная буква (a–z)' },
              { ok: /[0-9]/.test(password), label: 'Цифра (0–9)' },
            ].map(({ ok, label }) => (
              <Text key={label} style={[typography.caption, { color: ok ? '#34C759' : colors.textTertiary }]}>
                {ok ? '✓' : '·'} {label}
              </Text>
            ))}
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

        <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md, paddingHorizontal: spacing.md, lineHeight: 18 }]}>
          Нажимая «Зарегистрироваться», вы подтверждаете согласие на{' '}
          <Text style={{ color: colors.primary }} onPress={() => Linking.openURL('https://irongym.app/privacy.html')}>
            обработку персональных данных
          </Text>
          {' '}в соответствии с 152-ФЗ и принимаете{' '}
          <Text style={{ color: colors.primary }} onPress={() => Linking.openURL('https://irongym.app/terms.html')}>
            условия использования
          </Text>.
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xxl }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={[typography.small, { color: colors.textTertiary, marginHorizontal: spacing.lg }]}>или</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        {features.googleOAuth && googleConfigured && (
          <GoogleAuthButton
            onError={setLocalError}
            onTotpRequired={() => navigation.navigate('Login')}
            disabled={anyLoading}
          />
        )}

        <TouchableOpacity
          onPress={handleVkPress}
          disabled={anyLoading}
          style={[styles.socialBtn, { backgroundColor: '#0077FF', borderColor: '#0077FF' }, anyLoading && { opacity: 0.5 }]}
        >
          {vkLoading
            ? <ActivityIndicator size="small" color="#FFF" style={{ marginRight: spacing.sm }} />
            : <Text style={{ fontSize: 16, marginRight: spacing.sm, color: '#FFF', fontWeight: '800' }}>ВК</Text>
          }
          <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Регистрация через VK</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleYandexPress}
          disabled={anyLoading}
          style={[styles.socialBtn, { backgroundColor: '#FC3F1D', borderColor: '#FC3F1D', marginTop: spacing.sm }, anyLoading && { opacity: 0.5 }]}
        >
          {yandexLoading
            ? <ActivityIndicator size="small" color="#FFF" style={{ marginRight: spacing.sm }} />
            : <Text style={{ fontSize: 16, marginRight: spacing.sm, color: '#FFF', fontWeight: '800' }}>Я</Text>
          }
          <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Регистрация через Яндекс</Text>
        </TouchableOpacity>

        {!!OK_APP_ID && (
          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: '#EE8208', borderColor: '#EE8208', marginTop: spacing.sm }, anyLoading && { opacity: 0.5 }]}
            onPress={handleOkPress}
            disabled={anyLoading}
            activeOpacity={0.8}
          >
            {okLoading
              ? <ActivityIndicator color="#fff" size="small" style={{ marginRight: spacing.sm }} />
              : <Text style={{ fontSize: 16, marginRight: spacing.sm, color: '#FFF', fontWeight: '800' }}>ОК</Text>
            }
            <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Регистрация через OK.ru</Text>
          </TouchableOpacity>
        )}

        {!!MAILRU_APP_ID && (
          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: '#FF6600', borderColor: '#FF6600', marginTop: spacing.sm }, anyLoading && { opacity: 0.5 }]}
            onPress={handleMailruPress}
            disabled={anyLoading}
            activeOpacity={0.8}
          >
            {mailruLoading
              ? <ActivityIndicator color="#fff" size="small" style={{ marginRight: spacing.sm }} />
              : <Text style={{ fontSize: 16, marginRight: spacing.sm, color: '#FFF', fontWeight: '800' }}>M</Text>
            }
            <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Регистрация через Mail.ru</Text>
          </TouchableOpacity>
        )}

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
