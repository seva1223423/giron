import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, TextInput, TouchableOpacity,
} from 'react-native';
import { useThemeStore } from '../../store';
import { Button, Input } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { authService } from '../../services/authService';

type Tab = 'email' | 'phone';
type PhoneStep = 'input' | 'otp' | 'password';

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

export const ForgotPasswordScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();

  const [tab, setTab] = useState<Tab>('email');

  // Email flow
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Phone flow
  const [phoneRaw, setPhoneRaw] = useState('');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('input');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [error, setError] = useState('');
  const [phoneDone, setPhoneDone] = useState(false);

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

  // ── Email submit ──────────────────────────────────────────────────────────────

  const handleEmailSubmit = async () => {
    if (!email.trim()) { setError('Введите email'); return; }
    setError('');
    setEmailLoading(true);
    try {
      await authService.forgotPassword(email.trim().toLowerCase());
      setEmailSent(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Ошибка отправки. Попробуй позже.');
    } finally {
      setEmailLoading(false);
    }
  };

  // ── Phone: send OTP ───────────────────────────────────────────────────────────

  const handleSendPhoneOtp = async () => {
    const digits = phoneRaw.replace(/\D/g, '');
    if (digits.length < 10) { setError('Введите корректный номер телефона'); return; }
    setError('');
    setOtpSending(true);
    try {
      await authService.sendOtp({ phone: `+7${digits.slice(-10)}`, purpose: 'phone-reset' });
      setPhoneStep('otp');
      startCountdown();
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === 'PHONE_NOT_FOUND') setError('Номер не привязан ни к одному аккаунту');
      else setError(e?.response?.data?.error || 'Не удалось отправить SMS');
    } finally {
      setOtpSending(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCountdown > 0) return;
    setError('');
    setOtpSending(true);
    try {
      const digits = phoneRaw.replace(/\D/g, '');
      await authService.sendOtp({ phone: `+7${digits.slice(-10)}`, purpose: 'phone-reset' });
      startCountdown();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Не удалось отправить SMS');
    } finally {
      setOtpSending(false);
    }
  };

  // ── Phone: verify OTP → go to new password ────────────────────────────────────

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) { setError('Введите 6-значный код'); return; }
    setError('');
    setPhoneLoading(true);
    try {
      const digits = phoneRaw.replace(/\D/g, '');
      const valid = await authService.verifyOtp({ phone: `+7${digits.slice(-10)}`, code: otpCode, purpose: 'phone-reset' });
      if (valid) {
        setPhoneStep('password');
      } else {
        setError('Неверный код');
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Ошибка проверки кода');
    } finally {
      setPhoneLoading(false);
    }
  };

  // ── Phone: set new password ────────────────────────────────────────────────────

  const handlePhoneReset = async () => {
    if (newPassword.length < 8) { setError('Пароль минимум 8 символов'); return; }
    if (newPassword !== confirmPassword) { setError('Пароли не совпадают'); return; }
    setError('');
    setPhoneLoading(true);
    try {
      const digits = phoneRaw.replace(/\D/g, '');
      await authService.resetPasswordByPhone(`+7${digits.slice(-10)}`, otpCode, newPassword);
      setPhoneDone(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Ошибка сброса пароля');
    } finally {
      setPhoneLoading(false);
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setError('');
    setPhoneStep('input');
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  // ── Success states ────────────────────────────────────────────────────────────

  if (emailSent) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <Text style={{ fontSize: 64, textAlign: 'center', marginBottom: spacing.xl }}>📬</Text>
          <Text style={[typography.h2, { color: colors.text, textAlign: 'center', marginBottom: spacing.md }]}>Письмо отправлено</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.huge }]}>
            Проверь почту {email}.{'\n'}Ссылка действительна 1 час.
          </Text>
          <Button title="Вернуться к входу" onPress={() => navigation.navigate('Login')} fullWidth size="lg" />
        </View>
      </View>
    );
  }

  if (phoneDone) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <Text style={{ fontSize: 64, textAlign: 'center', marginBottom: spacing.xl }}>✅</Text>
          <Text style={[typography.h2, { color: colors.text, textAlign: 'center', marginBottom: spacing.md }]}>Пароль изменён</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.huge }]}>
            Войди в аккаунт с новым паролем.
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary + '12', borderWidth: 1.5, borderColor: colors.primary + '40', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.primary }}>◈</Text>
          </View>
          <Text style={[typography.h2, { color: colors.text }]}>Забыли пароль?</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', lineHeight: 22 }]}>
            Восстановление через email или телефон
          </Text>
        </View>

        {/* Tab switcher */}
        <View style={[styles.tabRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(['email', 'phone'] as Tab[]).map((t) => (
            <TouchableOpacity key={t} onPress={() => switchTab(t)} style={[styles.tabBtn, tab === t && { backgroundColor: colors.primary }]}>
              <Text style={[typography.smallMedium, { color: tab === t ? '#FFF' : colors.textSecondary }]}>
                {t === 'email' ? 'Email' : 'Телефон'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Email tab ── */}
        {tab === 'email' && (
          <View>
            <Input
              label="Email"
              placeholder="email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(''); }}
              containerStyle={{ marginBottom: spacing.md }}
            />
            {error ? <Text style={[typography.small, { color: colors.error, marginBottom: spacing.md }]}>{error}</Text> : null}
            <Button title="Отправить ссылку" onPress={handleEmailSubmit} loading={emailLoading} fullWidth size="lg" style={{ marginBottom: spacing.xl }} />
          </View>
        )}

        {/* ── Phone tab: enter number ── */}
        {tab === 'phone' && phoneStep === 'input' && (
          <View>
            <View style={[styles.phoneRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[typography.body, { color: colors.textSecondary, marginRight: 8, fontWeight: '600' }]}>🇷🇺</Text>
              <TextInput
                style={[styles.phoneInput, { color: colors.text }]}
                value={formatPhoneDisplay(phoneRaw)}
                onChangeText={(t) => {
                  const digits = t.replace(/\D/g, '');
                  const local = digits.startsWith('7') || digits.startsWith('8') ? digits.slice(1) : digits;
                  setPhoneRaw(local.slice(0, 10));
                  setError('');
                }}
                keyboardType="phone-pad"
                placeholder="+7 (999) 000-00-00"
                placeholderTextColor={colors.textTertiary}
                autoFocus
              />
            </View>
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 6, marginBottom: spacing.xl }]}>
              Отправим SMS-код для сброса пароля
            </Text>
            {error ? <Text style={[typography.small, { color: colors.error, marginBottom: spacing.md }]}>{error}</Text> : null}
            <Button
              title="Получить код"
              onPress={handleSendPhoneOtp}
              loading={otpSending}
              disabled={phoneRaw.replace(/\D/g, '').length < 10 || otpSending}
              fullWidth size="lg" style={{ marginBottom: spacing.xl }}
            />
          </View>
        )}

        {/* ── Phone tab: enter OTP ── */}
        {tab === 'phone' && phoneStep === 'otp' && (
          <View>
            <TouchableOpacity onPress={() => { setPhoneStep('input'); setOtpCode(''); setError(''); }} style={{ alignSelf: 'flex-start', marginBottom: spacing.lg }}>
              <Text style={[typography.small, { color: colors.primary }]}>← Изменить номер</Text>
            </TouchableOpacity>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg, textAlign: 'center' }]}>
              Код отправлен на{'\n'}
              <Text style={{ color: colors.text, fontWeight: '700' }}>{formatPhoneDisplay(phoneRaw)}</Text>
            </Text>
            <TextInput
              style={[styles.otpInput, { backgroundColor: colors.surface, borderColor: otpCode.length === 6 ? colors.primary : colors.border, color: colors.text }]}
              value={otpCode}
              onChangeText={(t) => { setOtpCode(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="——————"
              placeholderTextColor={colors.textTertiary}
              autoFocus
            />
            {error ? <Text style={[typography.small, { color: colors.error, textAlign: 'center', marginBottom: spacing.md }]}>{error}</Text> : null}
            <Button
              title="Далее"
              onPress={handleVerifyOtp}
              loading={phoneLoading}
              disabled={otpCode.length !== 6 || phoneLoading}
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

        {/* ── Phone tab: new password ── */}
        {tab === 'phone' && phoneStep === 'password' && (
          <View>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>
              Придумай новый пароль для аккаунта
            </Text>
            <Input
              label="Новый пароль"
              placeholder="Минимум 8 символов"
              secureTextEntry
              value={newPassword}
              onChangeText={(t) => { setNewPassword(t); setError(''); }}
              containerStyle={{ marginBottom: spacing.xl }}
            />
            <Input
              label="Повторите пароль"
              placeholder="Повторите пароль"
              secureTextEntry
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); setError(''); }}
              containerStyle={{ marginBottom: spacing.md }}
            />
            {error ? <Text style={[typography.small, { color: colors.error, marginBottom: spacing.md }]}>{error}</Text> : null}
            <Button
              title="Сохранить пароль"
              onPress={handlePhoneReset}
              loading={phoneLoading}
              disabled={phoneLoading}
              fullWidth size="lg" style={{ marginBottom: spacing.xl }}
            />
          </View>
        )}

        <Button title="Назад" variant="outline" onPress={() => navigation.goBack()} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxl },
  header: { alignItems: 'center', marginBottom: spacing.xxl },
  tabRow: {
    flexDirection: 'row', borderRadius: 12, borderWidth: 1,
    padding: 4, marginBottom: spacing.xl,
  },
  tabBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  phoneRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 14,
  },
  phoneInput: { flex: 1, fontSize: 17, fontWeight: '500' },
  otpInput: {
    fontSize: 32, fontWeight: '700', letterSpacing: 12, textAlign: 'center',
    borderWidth: 2, borderRadius: 16, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    marginVertical: spacing.xl, alignSelf: 'center', width: 240,
  },
});
