import React from 'react';
import { Text, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { SettingRow } from './SettingRow';

// Public-facing pages published from docs/ via GitHub Pages / the app's hosting.
// Keep these in sync with docs/privacy.html and docs/terms.html.
const PRIVACY_URL = 'https://giron.app/privacy.html';
const TERMS_URL = 'https://giron.app/terms.html';
const PRIVACY_CONTACT = 'privacy@giron.app';

const openInBrowser = async (url: string) => {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    Linking.openURL(url).catch(() => {});
  }
};

export const LegalSection: React.FC = () => {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  return (
    <FadeIn delay={260}>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>ПРАВОВАЯ ИНФОРМАЦИЯ</Text>

        <SettingRow
          label="Политика конфиденциальности"
          sublabel="Как мы обрабатываем ваши данные (152-ФЗ)"
          divider
          onPress={() => openInBrowser(PRIVACY_URL)}
          right={<Text style={[typography.body, { color: colors.primary }]}>→</Text>}
        />

        <SettingRow
          label="Пользовательское соглашение"
          sublabel="Условия использования приложения"
          divider
          onPress={() => openInBrowser(TERMS_URL)}
          right={<Text style={[typography.body, { color: colors.primary }]}>→</Text>}
        />

        <SettingRow
          label="Авторы видео"
          sublabel="Лицензии и источники демо-клипов упражнений"
          divider
          onPress={() => navigation.navigate('Credits')}
          right={<Text style={[typography.body, { color: colors.primary }]}>→</Text>}
        />

        <SettingRow
          label="Контакты по вопросам ПДн"
          sublabel={PRIVACY_CONTACT}
          onPress={() => Linking.openURL(`mailto:${PRIVACY_CONTACT}`).catch(() => {})}
          right={<Text style={[typography.body, { color: colors.primary }]}>→</Text>}
        />
      </Card>
    </FadeIn>
  );
};
