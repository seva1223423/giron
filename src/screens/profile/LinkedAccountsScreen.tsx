import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { useThemeColors, useAuthStore } from '../../store';
import { GoogleAuthButton, Icon } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { useSafeTop } from '../../hooks/useSafeTop';
import { userService } from '../../services';

const VK_APP_ID = process.env.EXPO_PUBLIC_VK_APP_ID;
const YANDEX_CLIENT_ID = process.env.EXPO_PUBLIC_YANDEX_CLIENT_ID;
const googleConfigured = !!(
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ||
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ||
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID
);

/**
 * Отдельный экран «Привязанные аккаунты».
 * Раньше эта секция жила прямо в ProfileScreen — теперь вынесена сюда,
 * чтобы профиль был чище, а у пользователя было одно понятное место
 * для управления всеми соцсетями (VK, Яндекс, Google).
 */
export const LinkedAccountsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const colors = useThemeColors();
  const { user } = useAuthStore();

  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);

  const handleUnlink = (provider: 'yandex' | 'vk' | 'google', label: string) => {
    Alert.alert(
      `Отвязать ${label}?`,
      'Вы больше не сможете входить через этот аккаунт.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отвязать',
          style: 'destructive',
          onPress: async () => {
            setUnlinkingProvider(provider);
            try {
              await userService.unlinkProvider(provider);
              await useAuthStore.getState().fetchProfile();
            } catch (e: any) {
              Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось отвязать аккаунт');
            } finally {
              setUnlinkingProvider(null);
            }
          },
        },
      ],
    );
  };

  const handleLinkVk = async () => {
    if (!VK_APP_ID) { Alert.alert('Ошибка', 'VK OAuth не настроен'); return; }
    setLinkingProvider('vk');
    try {
      const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const redirectUri = makeRedirectUri({ scheme: 'giron', path: 'auth/vk' });
      const authUrl = `https://oauth.vk.com/authorize?client_id=${VK_APP_ID}&display=mobile&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&v=5.199&scope=email&state=${state}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type !== 'success') return;
      const fragment = result.url.split('#')[1] ?? '';
      const params = new URLSearchParams(fragment);
      const returnedState = params.get('state');
      if (returnedState !== state) { Alert.alert('Ошибка безопасности', 'Невалидный state'); return; }
      const accessToken = params.get('access_token');
      const userId = params.get('user_id');
      if (!accessToken || !userId) { Alert.alert('Ошибка', 'Не удалось получить данные от VK'); return; }
      await userService.linkProvider('vk', { accessToken, userId });
      await useAuthStore.getState().fetchProfile();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось привязать VK');
    } finally {
      setLinkingProvider(null);
    }
  };

  const handleLinkYandex = async () => {
    if (!YANDEX_CLIENT_ID) { Alert.alert('Ошибка', 'Yandex OAuth не настроен'); return; }
    setLinkingProvider('yandex');
    try {
      const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const redirectUri = makeRedirectUri({ scheme: 'giron', path: 'auth/yandex' });
      const authUrl = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${YANDEX_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type !== 'success') return;
      const fragment = result.url.split('#')[1] ?? '';
      const params = new URLSearchParams(fragment);
      const returnedState = params.get('state');
      if (returnedState !== state) { Alert.alert('Ошибка безопасности', 'Невалидный state'); return; }
      const accessToken = params.get('access_token');
      if (!accessToken) { Alert.alert('Ошибка', 'Не удалось получить токен от Яндекса'); return; }
      await userService.linkProvider('yandex', { accessToken });
      await useAuthStore.getState().fetchProfile();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось привязать Яндекс');
    } finally {
      setLinkingProvider(null);
    }
  };

  const handleGoogleLinkSuccess = async (idToken: string) => {
    setLinkingProvider('google');
    try {
      await userService.linkProvider('google', { accessToken: idToken });
      await useAuthStore.getState().fetchProfile();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось привязать Google');
    } finally {
      setLinkingProvider(null);
    }
  };

  // Список провайдеров с привязкой статуса/цвета. Описываем
  // декларативно — один компонент-строка, цикл вместо 3×копипаста.
  const providers: Array<{
    key: 'vk' | 'yandex' | 'google';
    title: string;
    badge: string;
    badgeColor: string;
    isLinked: boolean;
    onLink?: () => void;
    customLink?: React.ReactNode;
  }> = [
    {
      key: 'vk',
      title: 'VK ID',
      badge: 'ВК',
      badgeColor: '#0077FF',
      isLinked: !!user?.hasVk,
      onLink: handleLinkVk,
    },
    {
      key: 'yandex',
      title: 'Яндекс ID',
      badge: 'Я',
      badgeColor: '#FC3F1D',
      isLinked: !!(user?.yandexId || user?.hasYandex),
      onLink: handleLinkYandex,
    },
    {
      key: 'google',
      title: 'Google',
      badge: 'G',
      badgeColor: '#4285F4',
      isLinked: !!(user?.googleId || user?.hasGoogle),
      customLink: googleConfigured ? (
        <GoogleAuthButton
          mode="link"
          onSuccess={handleGoogleLinkSuccess}
          onError={(msg) => Alert.alert('Ошибка', msg)}
          disabled={linkingProvider === 'google'}
        />
      ) : (
        <TouchableOpacity
          onPress={() => Alert.alert('Ошибка', 'Google OAuth не настроен')}
          style={styles.linkBtn(colors)}
        >
          <Text style={[typography.caption, { color: colors.primary, fontWeight: '600' }]}>Привязать</Text>
        </TouchableOpacity>
      ),
    },
  ];

  const linkedCount = providers.filter((p) => p.isLinked).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: safeTop + spacing.md, paddingBottom: spacing.xxl }}
    >
      {/* Header */}
      <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.xl }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: spacing.lg, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="chev" size={18} color={colors.textSecondary} />
          <Text style={[typography.body, { color: colors.textSecondary }]}>Профиль</Text>
        </TouchableOpacity>
        <Text style={[typography.h2, { color: colors.text }]}>Привязанные аккаунты</Text>
        <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
          Используйте соцсети для быстрого входа. Привязано: {linkedCount} из {providers.length}.
        </Text>
      </View>

      {/* Providers list */}
      <View style={{ marginHorizontal: spacing.xl, backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        {providers.map((p, idx) => {
          const isLast = idx === providers.length - 1;
          return (
            <View
              key={p.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.md,
                borderBottomWidth: isLast ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  backgroundColor: p.isLinked ? p.badgeColor + '18' : colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: spacing.md,
                  borderWidth: 1,
                  borderColor: p.isLinked ? p.badgeColor + '40' : 'transparent',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: p.isLinked ? p.badgeColor : colors.textSecondary }}>
                  {p.badge}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[typography.smallMedium, { color: colors.text }]}>{p.title}</Text>
                <Text style={[typography.caption, { color: p.isLinked ? '#34C759' : colors.textTertiary }]}>
                  {p.isLinked ? 'Привязан' : 'Не привязан'}
                </Text>
              </View>

              {p.isLinked ? (
                <TouchableOpacity
                  onPress={() => handleUnlink(p.key, p.title.replace(' ID', ''))}
                  disabled={unlinkingProvider === p.key}
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                    borderRadius: borderRadius.sm,
                    backgroundColor: colors.error + '10',
                    borderWidth: 1,
                    borderColor: colors.error + '30',
                  }}
                >
                  <Text style={[typography.caption, { color: colors.error, fontWeight: '600' }]}>
                    {unlinkingProvider === p.key ? '...' : 'Отвязать'}
                  </Text>
                </TouchableOpacity>
              ) : p.customLink ? (
                p.customLink
              ) : (
                <TouchableOpacity
                  onPress={p.onLink}
                  disabled={linkingProvider === p.key}
                  style={styles.linkBtn(colors)}
                >
                  <Text style={[typography.caption, { color: colors.primary, fontWeight: '600' }]}>
                    {linkingProvider === p.key ? '...' : 'Привязать'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      {/* Info note */}
      <View style={{ marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '20', flexDirection: 'row', gap: spacing.sm }}>
        <Text style={{ fontSize: 16 }}>ℹ️</Text>
        <Text style={[typography.caption, { color: colors.textSecondary, flex: 1, lineHeight: 18 }]}>
          Привязка соцсети не передаёт ваши данные третьим лицам — она нужна только для упрощённого входа.
          Отвязать аккаунт можно в любой момент.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = {
  linkBtn: (colors: any) => ({
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  }),
};

export default LinkedAccountsScreen;
