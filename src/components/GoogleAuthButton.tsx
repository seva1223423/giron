import React, { useEffect, useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useThemeStore, useAuthStore } from '../store';
import { typography } from '../theme';
import { spacing } from '../theme/spacing';

WebBrowser.maybeCompleteAuthSession();

interface Props {
  onError: (msg: string) => void;
  disabled?: boolean;
}

export function GoogleAuthButton({ onError, disabled }: Props) {
  const { colors } = useThemeStore();
  const { loginWithGoogle } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
    scopes: ['openid', 'profile', 'email'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.authentication?.idToken;
      if (idToken) {
        setLoading(true);
        loginWithGoogle(idToken)
          .catch((e) => onError(e?.response?.data?.error || 'Ошибка входа через Google'))
          .finally(() => setLoading(false));
      } else {
        onError('Не удалось получить токен от Google');
      }
    } else if (response?.type === 'error') {
      onError('Ошибка авторизации через Google');
    }
  }, [response]);

  return (
    <TouchableOpacity
      onPress={() => promptAsync()}
      disabled={disabled || !request || loading}
      style={[
        {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
          borderColor: colors.border, backgroundColor: colors.surface,
        },
        (disabled || !request || loading) && { opacity: 0.5 },
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: spacing.sm }} />
        : <Text style={{ fontSize: 18, marginRight: spacing.sm, fontWeight: '700', color: '#4285F4' }}>G</Text>
      }
      <Text style={[typography.bodySemibold, { color: colors.text }]}>Войти через Google</Text>
    </TouchableOpacity>
  );
}
