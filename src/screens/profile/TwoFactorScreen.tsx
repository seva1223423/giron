import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { useThemeStore } from '../../store';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { api } from '../../services/api';
import { useSafeTop } from '../../hooks/useSafeTop';
import { Button } from '../../components';

interface TwoFAStatus {
  enabled: boolean;
  setupPending: boolean;
}

interface SetupData {
  secret: string;
  otpauthUri: string;
  qrCodeDataUrl: string;
  instructions: string;
}

export const TwoFactorScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const [status, setStatus] = useState<TwoFAStatus | null>(null);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [code, setCode] = useState('');
  const [disableCode, setDisableCode] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get<TwoFAStatus>('/user/2fa/status');
      setStatus(data);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить статус 2FA');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const startSetup = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post<SetupData>('/user/2fa/setup');
      setSetupData(data);
      setCode('');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось начать настройку 2FA');
    } finally {
      setSubmitting(false);
    }
  };

  const enableTotp = async (codeValue: string) => {
    if (codeValue.length !== 6) return;
    setSubmitting(true);
    try {
      await api.post('/user/2fa/enable', { code: codeValue });
      setSetupData(null);
      setCode('');
      await loadStatus();
      Alert.alert('Готово', 'Двухфакторная аутентификация успешно включена.');
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Неверный код';
      Alert.alert('Ошибка', msg);
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      setTimeout(() => enableTotp(digits), 100);
    }
  };

  const disableTotp = () => {
    Alert.alert(
      'Отключить 2FA?',
      'Это снизит безопасность вашего аккаунта. Введите код из приложения-аутентификатора.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отключить',
          style: 'destructive',
          onPress: async () => {
            if (!disableCode || disableCode.length !== 6) {
              Alert.alert('Ошибка', 'Введите 6-значный код');
              return;
            }
            setSubmitting(true);
            try {
              await api.delete('/user/2fa', { data: { code: disableCode } });
              setDisableCode('');
              await loadStatus();
            } catch (e: any) {
              Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось отключить 2FA');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: safeTop + spacing.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: spacing.xl }}>
        <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
      </TouchableOpacity>

      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>Двухфакторная аутентификация</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
        2FA добавляет дополнительный уровень защиты: при входе нужно ввести код из приложения-аутентификатора.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : setupData ? (
        /* Setup flow */
        <View>
          <Text style={[typography.smallMedium, { color: colors.text, marginBottom: spacing.md }]}>
            1. Установите Google Authenticator или Яндекс.Ключ
          </Text>
          <Text style={[typography.smallMedium, { color: colors.text, marginBottom: spacing.md }]}>
            2. Отсканируйте QR-код:
          </Text>
          <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
            <Image
              source={{ uri: setupData.qrCodeDataUrl }}
              style={{ width: 200, height: 200, borderRadius: borderRadius.md }}
            />
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md, textAlign: 'center' }]}>
            Или введите ключ вручную:
          </Text>
          <View style={{ backgroundColor: colors.card, padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontFamily: 'monospace', color: colors.text, fontSize: 14, textAlign: 'center', letterSpacing: 2 }}>
              {setupData.secret}
            </Text>
          </View>
          <Text style={[typography.smallMedium, { color: colors.text, marginBottom: spacing.md }]}>
            3. Введите 6-значный код для подтверждения:
          </Text>
          <TextInput
            style={[styles.codeInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="------"
            placeholderTextColor={colors.textTertiary}
            value={code}
            onChangeText={handleCodeChange}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          {submitting && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />}
          <Button
            title="Подтвердить и включить 2FA"
            onPress={() => enableTotp(code)}
            loading={submitting}
            disabled={code.length !== 6}
            fullWidth
            style={{ marginTop: spacing.xl }}
          />
          <TouchableOpacity onPress={() => setSetupData(null)} style={{ marginTop: spacing.lg, alignItems: 'center' }}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>Отмена</Text>
          </TouchableOpacity>
        </View>
      ) : status?.enabled ? (
        /* Disable flow */
        <View>
          <View style={{ backgroundColor: '#34C75915', borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.xl, borderWidth: 1, borderColor: '#34C75940' }}>
            <Text style={[typography.smallMedium, { color: '#34C759' }]}>2FA включена</Text>
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>
              Ваш аккаунт защищён двухфакторной аутентификацией.
            </Text>
          </View>
          <Text style={[typography.body, { color: colors.text, marginBottom: spacing.md }]}>
            Для отключения введите код из аутентификатора:
          </Text>
          <TextInput
            style={[styles.codeInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="------"
            placeholderTextColor={colors.textTertiary}
            value={disableCode}
            onChangeText={(v) => setDisableCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Button
            title="Отключить 2FA"
            onPress={disableTotp}
            loading={submitting}
            disabled={disableCode.length !== 6}
            fullWidth
            variant="outline"
            style={{ marginTop: spacing.xl }}
            textStyle={{ color: colors.error }}
          />
        </View>
      ) : (
        /* Not enabled */
        <View>
          <View style={{ backgroundColor: colors.warning + '15', borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.warning + '40' }}>
            <Text style={[typography.smallMedium, { color: colors.warning }]}>2FA не включена</Text>
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>
              Включите двухфакторную аутентификацию для дополнительной защиты.
            </Text>
          </View>
          <Button
            title="Включить двухфакторную аутентификацию"
            onPress={startSetup}
            loading={submitting}
            fullWidth
          />
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  codeInput: {
    height: 64,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 8,
  },
});
