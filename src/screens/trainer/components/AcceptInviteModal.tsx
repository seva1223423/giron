import React, { useState } from 'react';
import { View, Text, TextInput, Modal, StyleSheet } from 'react-native';
import { useThemeStore, useTrainerStore } from '../../../store';
import { Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { useHaptic } from '../../../hooks/useHaptic';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (info: { trainerClientId: string; trainerId: string; displayName: string }) => void;
}

/**
 * Client-side entry point for the invite flow (Product-01). Authenticated
 * Iron Gym users paste the 10-char code their trainer shared and the
 * accounts get linked. Wired into the profile/settings stack at the
 * caller's discretion — this component doesn't own Navigation.
 *
 * The code is normalized: uppercased + stripped of whitespace before
 * server call so the user can paste "abcdef 2345" (lowercase with a
 * space from auto-formatting) and still hit the format regex.
 */
export const AcceptInviteModal: React.FC<Props> = ({ visible, onClose, onSuccess }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { acceptInvite } = useTrainerStore();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = code.trim().toUpperCase().replace(/\s+/g, '');
  const isValidShape = /^[A-Z0-9]{10}$/.test(normalized);

  const handleAccept = async () => {
    if (!isValidShape || loading) return;
    haptic.medium();
    setLoading(true);
    setError(null);

    const result = await acceptInvite(normalized);

    setLoading(false);
    // Store returns { trainerClientId, ... } on success, { error, code? } otherwise.
    if ('trainerClientId' in result) {
      haptic.success();
      onSuccess?.(result);
      setCode('');
      onClose();
      return;
    }

    // Map server error codes to friendlier localized text. The store already
    // returns a Russian fallback — we override for known codes where the
    // server's message might be too abstract for end users.
    const friendly = (() => {
      switch (result.code) {
        case 'INVITE_NOT_FOUND':
          return 'Код не найден. Проверь, что ввёл все 10 символов правильно.';
        case 'INVITE_ALREADY_USED':
          return 'Этот код уже использован. Попроси тренера сгенерировать новый.';
        case 'INVITE_EXPIRED':
          return 'Срок действия кода истёк. Попроси тренера сгенерировать новый — старые действуют 7 дней.';
        case 'SELF_INVITE':
          return 'Нельзя принять собственный код приглашения.';
        case 'ALREADY_CLIENT':
          return 'Ты уже клиент этого тренера.';
        default:
          return result.error;
      }
    })();
    setError(friendly);
    haptic.error();
  };

  const handleClose = () => {
    setCode('');
    setError(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.xs }]}>
            Код приглашения
          </Text>
          <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
            Твой тренер пришлёт 10-значный код. Введи его, чтобы связать аккаунты.
          </Text>

          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
            КОД
          </Text>
          <TextInput
            value={code}
            onChangeText={(text) => {
              // Upper-case + strip whitespace as the user types so the preview
              // matches exactly what will be sent to the server.
              setCode(text.toUpperCase().replace(/\s+/g, ''));
              if (error) setError(null);
            }}
            placeholder="ABCDEF2345"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            maxLength={10}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.background,
                borderColor: error ? colors.error : colors.border,
              },
            ]}
            autoFocus
          />

          {error ? (
            <Text
              style={[typography.small, { color: colors.error, marginTop: spacing.sm }]}
              accessibilityLiveRegion="polite"
            >
              {error}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
            <Button title="Отмена" variant="ghost" onPress={handleClose} style={{ flex: 1 }} disabled={loading} />
            <Button
              title="Принять"
              onPress={handleAccept}
              style={{ flex: 1 }}
              disabled={!isValidShape || loading}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: 48,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 20,
    letterSpacing: 2,
    textAlign: 'center',
    fontFamily: 'Menlo',
  },
});
