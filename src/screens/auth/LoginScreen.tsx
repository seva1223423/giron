import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, TextInput,
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

type LoginTab = 'email' | 'phone';
type PhoneStep = 'input' | 'otp';

/** Format Russian phone to +7 (XXX) XXX-XX-XX display format */
function formatPhoneDisplay(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (!d) return '';
  const local = d.startsWith('7') || d.startsWith('8') ? d.slice(1) : d;
  let result = '+7';
  if (local.length > 0) result += ' (' + local.slice(0, 3);
  if (local.length >= 3) result += ') ' + local.slice(3, 6);
  if (local.length >= 6) result += '-' + local.slice(6, 8);
  if (local.length >= 8) result += '-' + local.slice(8, 10);
  return result;
}

export const LoginScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { login, loginByPhone, loginWithTotp, loginWithYandex, isLoading, error, clearError } = useAuthStore();

  const [tab, setTab] = useState<LoginTab>('email');
  const [showTotpInput, setShowTotpInput] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);

  // Email tab state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [emailChecking, setEmailChecking] = useState(false);
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Phone tab state
  const [phoneRaw, setPhoneRaw] = useState('');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('input');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Shared
  const [localError, setLocalError] = useState('');
  const [vkLoading, setVkLoading] = useState(false);
  const [yandexLoading, setYandexLoading] = useState(false);

  // Countdown timer cleanup
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  // Debounced email check
  useEffect(() => {
    if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    setEmailHint('');
    const trimmed = email.trim();
    if (!trimmed.includes('@') || !trimmed.includes('.')) return;

    emailCheckTimer.current = setTimeout(async () => {
      setEmailChecking(true);
      try {
        const result = await authService.checkEmail(trimmed);
        if (!result.exists) setEmailHint('Email не зарегистрирован');
        else if (!result.hasPassword && (result.hasGoogle || result.hasVk))
          setEmailHint('Используйте вход через соцсеть');
      } finally {
        setEmailChecking(false);
      }
    }, 600);
    return () => { if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current); };
  }, [email]);

  const startCountdown = (seconds = 60) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setOtpCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setOtpCountdown((v) => {
        if (v <= 1) { if (countdownRef.current) clearInterval(countdownRef.current); return 0; }
        return v - 1;
      });
    }, 1000);
  };

  const clearErrors = () => { setLocalError(''); clearError(); };

  // ── Email login ─────────────────────────────────────────────────────────────

  const handleEmailLogin = async () => {
    if (!email || !password) { setLocalError('Заполните все поля'); return; }
    clearErrors();
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      if (e?.code === 'TOTP_REQUIRED') {
        setShowTotpInput(true);
        setTotpCode('');
        return;
      }
      const code = e?.response?.data?.code;
      const serverMsg = e?.response?.data?.error;
      if (code === 'EMAIL_NOT_FOUND' || code === 'INVALID_CREDENTIALS') setLocalError(serverMsg || 'Неверный email или пароль');
      else if (code === 'SOCIAL_ONLY') setLocalError('Войдите через VK или Яндекс');
      else if (code === 'WRONG_PASSWORD') setLocalError(serverMsg || 'Неверный email или пароль');
      else if (code === 'ACCOUNT_LOCKED') setLocalError(serverMsg || 'Аккаунт временно заблокирован');
      else if (code === 'BANNED') setLocalError(serverMsg || 'Аккаунт заблокирован');
      else setLocalError(serverMsg || 'Ошибка входа');
    }
  };

  const handleTotpSubmit = async (codeValue: string) => {
    if (codeValue.length !== 6) return;
    clearErrors();
    try {
      await loginWithTotp(codeValue, rememberDevice);
    } catch (e: any) {
      const serverMsg = e?.response?.data?.error;
      const errCode = e?.response?.data?.code;
      if (errCode === 'PENDING_TOKEN_EXPIRED') {
        setShowTotpInput(false);
        setTotpCode('');
        setUseBackupCode(false);
        setBackupCode('');
        setLocalError('Время сессии истекло. Войдите снова.');
      } else {
        setLocalError(serverMsg || 'Неверный код');
        setTotpCode('');
      }
    }
  };

  const handleBackupCodeSubmit = async () => {
    if (!backupCode.trim()) return;
    clearErrors();
    // useAuthStore's loginWithTotp can pass backupCode via authService.verifyTotp
    // We need to call the API directly here since loginWithTotp only handles TOTP codes
    const { totpPendingToken } = useAuthStore.getState();
    if (!totpPendingToken) { setLocalError('Сессия истекла. Войдите снова.'); return; }
    try {
      const response = await authService.verifyTotp(totpPendingToken, '', backupCode.trim().replace(/-/g, '').toUpperCase());
      await useAuthStore.getState().updateTokens(response.token, response.refreshToken);
      useAuthStore.setState({
        user: response.user,
        isAuthenticated: true,
        totpPendingToken: null,
      });
    } catch (e: any) {
      const serverMsg = e?.response?.data?.error;
      setLocalError(serverMsg || 'Неверный резервный код');
      setBackupCode('');
    }
  };

  const handleTotpCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(digits);
    if (digits.length === 6) {
      setTimeout(() => handleTotpSubmit(digits), 100);
    }
  };

  // ── Phone login ─────────────────────────────────────────────────────────────

  const handleSendPhoneOtp = async () => {
    if (phoneRaw.replace(/\D/g, '').length < 10) { setLocalError('Введите корректный номер телефона'); return; }
    clearErrors();
    setOtpSending(true);
    try {
      await authService.sendOtp({ phone: phoneRaw, purpose: 'phone-login' });
      setPhoneStep('otp');
      startCountdown();
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === 'PHONE_NOT_FOUND') setLocalError('Номер не зарегистрирован. Пройдите регистрацию.');
      else setLocalError(e?.response?.data?.error || 'Не удалось отправить SMS');
    } finally {
      setOtpSending(false);
    }
  };

  const handlePhoneOtpLogin = async () => {
    if (anyLoading || otpCode.length !== 6) { if (otpCode.length !== 6) setLocalError('Введите 6-значный код'); return; }
    clearErrors();
    try {
      await loginByPhone(phoneRaw, otpCode);
    } catch (e: any) {
      setLocalError(e?.response?.data?.error || 'Неверный код');
    }
  };

  const handleResendOtp = async () => {
    if (otpCountdown > 0) return;
    clearErrors();
    setOtpSending(true);
    try {
      await authService.sendOtp({ phone: phoneRaw, purpose: 'phone-login' });
      startCountdown();
    } catch (e: any) {
      setLocalError(e?.response?.data?.error || 'Не удалось отправить SMS');
    } finally {
      setOtpSending(false);
    }
  };

  const handleVkPress = async () => {
    if (!VK_APP_ID) { setLocalError('VK OAuth не настроен (нужен EXPO_PUBLIC_VK_APP_ID)'); return; }
    clearErrors();
    setVkLoading(true);
    try {
      const redirectUri = makeRedirectUri({ scheme: 'irongym', path: 'auth/vk' });
      const authUrl = `https://oauth.vk.com/authorize?client_id=${VK_APP_ID}&display=mobile&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&v=5.199&scope=email`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === 'success') {
        const fragment = result.url.split('#')[1] || '';
        const params = new URLSearchParams(fragment);
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
      setLocalError(e?.response?.data?.error || 'Ошибка авторизации через VK');
    } finally {
      setVkLoading(false);
    }
  };

  const handleYandexPress = async () => {
    if (!YANDEX_CLIENT_ID) { setLocalError('Yandex OAuth не настроен (нужен EXPO_PUBLIC_YANDEX_CLIENT_ID)'); return; }
    clearErrors();
    setYandexLoading(true);
    try {
      const redirectUri = makeRedirectUri({ scheme: 'irongym', path: 'auth/yandex' });
      const authUrl = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${YANDEX_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === 'success') {
        const fragment = result.url.split('#')[1] || '';
        const params = new URLSearchParams(fragment);
        const accessToken = params.get('access_token');
        if (accessToken) {
          await loginWithYandex(accessToken);
        } else {
          setLocalError('Не удалось получить токен от Яндекса');
        }
      }
    } catch (e: any) {
      setLocalError(e?.response?.data?.error || 'Ошибка авторизации через Яндекс');
    } finally {
      setYandexLoading(false);
    }
  };

  const displayError = localError || error;
  const anyLoading = isLoading || otpSending || vkLoading || yandexLoading;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Logo */}
        <View style={styles.header}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primary, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFF' }}>IG</Text>
          </View>
          <Text style={{ fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -1 }}>Iron Gym</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            Твой персональный AI-тренер
          </Text>
        </View>

        {/* Tabs */}
        {!showTotpInput && <View style={[styles.tabRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(['email', 'phone'] as LoginTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => { setTab(t); clearErrors(); setPhoneStep('input'); setOtpCode(''); }}
              style={[styles.tabBtn, tab === t && { backgroundColor: colors.primary }]}
            >
              <Text style={[typography.smallMedium, { color: tab === t ? '#FFF' : colors.textSecondary }]}>
                {t === 'email' ? 'Email' : 'Телефон'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>}

        {/* ── TOTP Step ── */}
        {showTotpInput && (
          <View style={styles.form}>
            <Text style={[typography.h3, { color: colors.text, textAlign: 'center', marginBottom: spacing.sm }]}>
              Двухфакторная аутентификация
            </Text>
            {!useBackupCode ? (
              <>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>
                  Введите 6-значный код из приложения-аутентификатора.
                </Text>
                <TextInput
                  style={[{
                    height: 64, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16,
                    textAlign: 'center', fontSize: 28, fontWeight: '700', letterSpacing: 8,
                    backgroundColor: colors.card, color: colors.text, borderColor: colors.border,
                  }]}
                  placeholder="------"
                  placeholderTextColor={colors.textTertiary}
                  value={totpCode}
                  onChangeText={handleTotpCodeChange}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={() => setRememberDevice((v) => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, gap: spacing.sm }}
                >
                  <View style={{
                    width: 20, height: 20, borderRadius: 4, borderWidth: 2,
                    borderColor: rememberDevice ? colors.primary : colors.border,
                    backgroundColor: rememberDevice ? colors.primary : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {rememberDevice && <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '800' }}>✓</Text>}
                  </View>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Запомнить это устройство на 30 дней</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setUseBackupCode(true); setTotpCode(''); clearErrors(); }} style={{ marginTop: spacing.md, alignItems: 'center' }}>
                  <Text style={[typography.caption, { color: colors.primary }]}>Использовать резервный код</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>
                  Введите резервный код из сохранённого списка.
                </Text>
                <TextInput
                  style={[{
                    height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16,
                    textAlign: 'center', fontSize: 18, fontWeight: '700', letterSpacing: 4,
                    backgroundColor: colors.card, color: colors.text, borderColor: colors.border,
                  }]}
                  placeholder="XXXX-XXXX"
                  placeholderTextColor={colors.textTertiary}
                  value={backupCode}
                  onChangeText={setBackupCode}
                  autoCapitalize="characters"
                  autoFocus
                />
                <Button
                  title="Войти"
                  onPress={handleBackupCodeSubmit}
                  loading={isLoading}
                  fullWidth
                  style={{ marginTop: spacing.xl }}
                />
                <TouchableOpacity onPress={() => { setUseBackupCode(false); setBackupCode(''); clearErrors(); }} style={{ marginTop: spacing.lg, alignItems: 'center' }}>
                  <Text style={[typography.caption, { color: colors.primary }]}>Использовать код из приложения</Text>
                </TouchableOpacity>
              </>
            )}
            {displayError ? <Text style={[typography.small, { color: colors.error, marginTop: spacing.md, textAlign: 'center' }]}>{displayError}</Text> : null}
            {isLoading && !useBackupCode && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />}
            <TouchableOpacity onPress={() => { setShowTotpInput(false); setTotpCode(''); setUseBackupCode(false); setBackupCode(''); clearErrors(); }} style={{ marginTop: spacing.xl, alignItems: 'center' }}>
              <Text style={[typography.body, { color: colors.textSecondary }]}>← Назад</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Email Tab ── */}
        {!showTotpInput && tab === 'email' && (
          <View style={styles.form}>
            <View style={{ marginBottom: spacing.xl }}>
              <Input
                label="Email"
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={(t) => { setEmail(t); setLocalError(''); clearError(); setEmailHint(''); }}
              />
              {emailChecking && (
                <ActivityIndicator size="small" color={colors.primary} style={{ position: 'absolute', right: 12, bottom: 12 }} />
              )}
              {emailHint ? (
                <Text style={[typography.small, { color: '#FF9F0A', marginTop: 4 }]}>{emailHint}</Text>
              ) : null}
            </View>

            <Input
              label="Пароль"
              placeholder="Введите пароль"
              secureTextEntry
              value={password}
              onChangeText={(t) => { setPassword(t); setLocalError(''); clearError(); }}
              containerStyle={{ marginBottom: spacing.md }}
            />

            {displayError ? <Text style={[typography.small, { color: colors.error, marginBottom: spacing.md }]}>{displayError}</Text> : null}

            <TouchableOpacity style={{ alignSelf: 'flex-end', marginBottom: spacing.xxl }} onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={[typography.smallMedium, { color: colors.primary }]}>Забыли пароль?</Text>
            </TouchableOpacity>

            <Button title="Войти" onPress={handleEmailLogin} loading={isLoading} disabled={anyLoading} fullWidth size="lg" />
          </View>
        )}

        {/* ── Phone Tab ── */}
        {!showTotpInput && tab === 'phone' && phoneStep === 'input' && (
          <View style={styles.form}>
            <View style={[styles.phoneInputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[typography.body, { color: colors.textSecondary, marginRight: 8, fontWeight: '600' }]}>🇷🇺</Text>
              <TextInput
                style={[styles.phoneInput, { color: colors.text }]}
                value={formatPhoneDisplay(phoneRaw)}
                onChangeText={(t) => {
                  const digits = t.replace(/\D/g, '');
                  const local = digits.startsWith('7') || digits.startsWith('8') ? digits.slice(1) : digits;
                  setPhoneRaw(local.slice(0, 10));
                  clearErrors();
                }}
                keyboardType="phone-pad"
                placeholder="+7 (999) 000-00-00"
                placeholderTextColor={colors.textTertiary}
                autoFocus
              />
            </View>
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 6, marginBottom: spacing.xl }]}>
              Мы отправим SMS с кодом подтверждения
            </Text>

            {displayError ? <Text style={[typography.small, { color: colors.error, marginBottom: spacing.md }]}>{displayError}</Text> : null}

            <Button
              title="Получить код"
              onPress={handleSendPhoneOtp}
              loading={otpSending}
              disabled={anyLoading || phoneRaw.length < 10}
              fullWidth size="lg"
            />
          </View>
        )}

        {!showTotpInput && tab === 'phone' && phoneStep === 'otp' && (
          <View style={styles.form}>
            <TouchableOpacity onPress={() => { setPhoneStep('input'); setOtpCode(''); clearErrors(); }} style={{ alignSelf: 'flex-start', marginBottom: spacing.lg }}>
              <Text style={[typography.small, { color: colors.primary }]}>← Изменить номер</Text>
            </TouchableOpacity>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg, textAlign: 'center' }]}>
              Код отправлен на{'\n'}
              <Text style={{ color: colors.text, fontWeight: '700' }}>{formatPhoneDisplay(phoneRaw)}</Text>
            </Text>

            <TextInput
              style={[styles.otpInput, { backgroundColor: colors.surface, borderColor: otpCode.length === 6 ? colors.primary : colors.border, color: colors.text }]}
              value={otpCode}
              onChangeText={(t) => {
                const clean = t.replace(/\D/g, '').slice(0, 6);
                setOtpCode(clean);
                clearErrors();
                // Auto-submit when 6 digits entered
                if (clean.length === 6 && !anyLoading) {
                  setTimeout(() => handlePhoneOtpLogin(), 0);
                }
              }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="——————"
              placeholderTextColor={colors.textTertiary}
              autoFocus
            />

            {displayError ? <Text style={[typography.small, { color: colors.error, textAlign: 'center', marginBottom: spacing.md }]}>{displayError}</Text> : null}

            <Button
              title="Войти"
              onPress={handlePhoneOtpLogin}
              loading={isLoading}
              disabled={anyLoading || otpCode.length !== 6}
              fullWidth size="lg" style={{ marginBottom: spacing.md }}
            />

            <TouchableOpacity onPress={handleResendOtp} disabled={otpCountdown > 0 || otpSending} style={{ alignItems: 'center', padding: spacing.sm }}>
              {otpSending
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={[typography.small, { color: otpCountdown > 0 ? colors.textTertiary : colors.primary }]}>
                    {otpCountdown > 0 ? `Отправить снова (${otpCountdown}с)` : 'Отправить код повторно'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Social auth */}
        {phoneStep === 'input' && (
          <>
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[typography.small, { color: colors.textTertiary, marginHorizontal: spacing.lg }]}>или</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {features.googleOAuth && googleConfigured && (
              <GoogleAuthButton onError={setLocalError} disabled={anyLoading} />
            )}

            <TouchableOpacity
              onPress={handleVkPress}
              disabled={anyLoading}
              style={[styles.socialBtn, { backgroundColor: '#0077FF', marginTop: spacing.sm, borderColor: '#0077FF' }, anyLoading && { opacity: 0.5 }]}
            >
              {vkLoading
                ? <ActivityIndicator size="small" color="#FFF" style={{ marginRight: spacing.sm }} />
                : <Text style={{ fontSize: 16, marginRight: spacing.sm, color: '#FFF', fontWeight: '800' }}>ВК</Text>
              }
              <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Войти через VK</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleYandexPress}
              disabled={anyLoading}
              style={[styles.socialBtn, { backgroundColor: '#FC3F1D', marginTop: spacing.sm, borderColor: '#FC3F1D' }, anyLoading && { opacity: 0.5 }]}
            >
              {yandexLoading
                ? <ActivityIndicator size="small" color="#FFF" style={{ marginRight: spacing.sm }} />
                : <Text style={{ fontSize: 16, marginRight: spacing.sm, color: '#FFF', fontWeight: '800' }}>Я</Text>
              }
              <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Войти через Яндекс</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.footer}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>Нет аккаунта? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={[typography.bodySemibold, { color: colors.primary }]}>Зарегистрируйся</Text>
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
  header: { alignItems: 'center', marginBottom: spacing.xl },
  tabRow: {
    flexDirection: 'row', borderRadius: 12, borderWidth: 1,
    padding: 4, marginBottom: spacing.xl,
  },
  tabBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  form: {},
  phoneInputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 14,
  },
  phoneInput: { flex: 1, fontSize: 17, fontWeight: '500' },
  otpInput: {
    fontSize: 32, fontWeight: '700', letterSpacing: 12, textAlign: 'center',
    borderWidth: 2, borderRadius: 16, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    marginVertical: spacing.xl, alignSelf: 'center', width: 240,
  },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xl },
  dividerLine: { flex: 1, height: 1 },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, borderWidth: 1,
  },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xxxl },
});
