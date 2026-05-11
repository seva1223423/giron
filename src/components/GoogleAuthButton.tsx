import React, { useEffect, useState } from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore, useThemeColors } from '../store';
import { typography } from '../theme';
import { brandColors } from '../theme/brandColors';
import { spacing } from '../theme/spacing';
import { Spinner } from './Spinner';

WebBrowser.maybeCompleteAuthSession();

interface Props {
  onError: (msg: string) => void;
  /** Called instead of onError when the server requires TOTP verification. */
  onTotpRequired?: () => void;
  disabled?: boolean;
  /** 'login' (default) — calls loginWithGoogle; 'link' — calls onSuccess(idToken) instead */
  mode?: 'login' | 'link';
  onSuccess?: (idToken: string) => void;
}

export function GoogleAuthButton({ onError, onTotpRequired, disabled, mode = 'login', onSuccess }: Props) {
  const colors = useThemeColors();
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
        if (mode === 'link') {
          // In link mode hand the idToken off to the caller; don't log in.
          Promise.resolve()
            .then(() => onSuccess?.(idToken))
            .catch((e) => onError(e?.response?.data?.error || 'Ошибка привязки Google'))
            .finally(() => setLoading(false));
        } else {
          loginWithGoogle(idToken)
            .catch((e) => {
              if (e?.code === 'TOTP_REQUIRED') { onTotpRequired?.(); }
              else { onError(e?.response?.data?.error || 'Ошибка входа через Google'); }
            })
            .finally(() => setLoading(false));
        }
      } else {
        onError('Не удалось получить токен от Google');
      }
    } else if (response?.type === 'error') {
      onError('Ошибка авторизации через Google');
    }
  }, [response]);

  const label = mode === 'link' ? 'Привязать Google' : 'Войти через Google';

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
        ? <View style={{ marginRight: spacing.sm }}><Spinner color={colors.primary} size={20} /></View>
        : <Text style={[typography.h4, { marginRight: spacing.sm, color: brandColors.google }]}>G</Text>
      }
      <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}
