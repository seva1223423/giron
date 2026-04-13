import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
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

export const LoginScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { login, loginWithGoogle, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [emailHint, setEmailHint] = useState(''); // e.g. "Используйте Google"
  const [emailChecking, setEmailChecking] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID_WEB,
    iosClientId: GOOGLE_CLIENT_ID_IOS,
    androidClientId: GOOGLE_CLIENT_ID_ANDROID,
    scopes: ['openid', 'profile', 'email'],
  });

  // Handle Google OAuth response
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

  // Debounced email check
  useEffect(() => {
    if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    setEmailHint('');

    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) return;

    emailCheckTimer.current = setTimeout(async () => {
      setEmailChecking(true);
      try {
        const result = await authService.checkEmail(trimmed);
        if (!result.exists) {
          setEmailHint('Email не зарегистрирован');
        } else if (result.hasGoogle && !result.hasPassword) {
          setEmailHint('Используйте вход через Google');
        }
      } finally {
        setEmailChecking(false);
      }
    }, 600);

    return () => {
      if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    };
  }, [email]);

  const handleLogin = async () => {
    if (!email || !password) {
      setLocalError('Заполните все поля');
      return;
    }
    setLocalError('');
    clearError();
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === 'EMAIL_NOT_FOUND') setLocalError('Аккаунт с таким email не найден');
      else if (code === 'GOOGLE_ONLY') setLocalError('Этот аккаунт создан через Google. Используйте «Войти через Google».');
      else if (code === 'WRONG_PASSWORD') setLocalError('Неверный пароль');
      else if (code === 'BANNED') setLocalError(e?.response?.data?.error || 'Аккаунт заблокирован');
    }
  };

  const handleGooglePress = async () => {
    if (!googleConfigured) {
      setLocalError('Google OAuth не настроен');
      return;
    }
    setLocalError('');
    clearError();
    await promptAsync();
  };

  const displayError = localError || error;
  const anyLoading = isLoading || googleLoading;

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
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primary, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFF' }}>IG</Text>
          </View>
          <Text style={{ fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -1 }}>Iron Gym</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            Твой персональный AI-тренер
          </Text>
        </View>

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
              <Text style={[typography.small, { color: colors.warning || '#FF9F0A', marginTop: spacing.xs }]}>
                {emailHint}
              </Text>
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
            disabled={anyLoading}
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
            <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>Войти через Google</Text>
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
