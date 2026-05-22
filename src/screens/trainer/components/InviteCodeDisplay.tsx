import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useThemeColors, useTrainerStore } from '../../../store';
import { Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { useHaptic } from '../../../hooks/useHaptic';

// Clipboard is handled through the Share sheet (works on both iOS/Android
// without adding a dependency). expo-clipboard is intentionally not
// imported here — when it's wired up we'll switch the tap handler to call
// it directly for a snappier UX.

interface Props {
  clientId: string;
  clientName: string;
}

/**
 * Trainer-side invite UI (Product-01). Shows one of three states:
 *
 *   1. Not-yet-invited (no inviteCode in store)   → "Invite" button
 *   2. Invited but not accepted (code set, no acceptedAt)
 *                                                 → show code + share + regen
 *   3. Linked (acceptedAt set)                    → show "Linked to user"
 *                                                    badge + disconnect
 *
 * Embed inside the ClientScreen or ClientCard expanded view. Intentionally
 * does NOT own the screen — stays ~100 lines so it can drop anywhere.
 */
export const InviteCodeDisplay: React.FC<Props> = ({ clientId, clientName }) => {
  const haptic = useHaptic();
  const colors = useThemeColors();
  const { clients, generateInvite, disconnectLink } = useTrainerStore();
  const client = clients.find((c) => c.id === clientId);

  const [loading, setLoading] = useState(false);

  if (!client) return null;

  const isLinked = !!client.acceptedAt;
  const hasPendingCode = !!client.inviteCode && !isLinked;

  const handleGenerate = async () => {
    haptic.medium();
    setLoading(true);
    await generateInvite(clientId);
    setLoading(false);
  };

  const handleShare = async () => {
    if (!client.inviteCode) return;
    haptic.light();
    try {
      await Share.share({
        message: `Твой код для подключения к тренировкам Giron: ${client.inviteCode}\n\nОткрой приложение → Профиль → Подключить тренера.`,
      });
    } catch {
      // User dismissed the share sheet — no action.
    }
  };

  const handleRegenerate = async () => {
    haptic.medium();
    setLoading(true);
    await generateInvite(clientId);
    setLoading(false);
  };

  const handleDisconnect = async () => {
    haptic.warning();
    setLoading(true);
    await disconnectLink(clientId);
    setLoading(false);
  };

  // ── State 3: Linked ────────────────────────────────────────────────────────
  if (isLinked) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.success }]}>
        <View style={styles.headerRow}>
          <Text style={[typography.captionMedium, { color: colors.success }]}>
            ● ПОДКЛЮЧЁН
          </Text>
          {client.acceptedAt ? (
            <Text style={[typography.caption, { color: colors.textTertiary }]}>
              с {new Date(client.acceptedAt).toLocaleDateString('ru-RU')}
            </Text>
          ) : null}
        </View>
        <Text style={[typography.body, { color: colors.text, marginTop: spacing.xs }]}>
          {clientName} видит свои программы в приложении и синхронизирует прогресс.
        </Text>
        <Button
          title="Отвязать"
          variant="ghost"
          onPress={handleDisconnect}
          disabled={loading}
          style={{ marginTop: spacing.md }}
        />
      </View>
    );
  }

  // ── State 2: Pending code ─────────────────────────────────────────────────
  if (hasPendingCode) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
          КОД ПРИГЛАШЕНИЯ
        </Text>
        <TouchableOpacity onPress={handleShare} activeOpacity={0.7} accessibilityLabel="Поделиться кодом">
          <Text style={[styles.code, { color: colors.primary, marginTop: spacing.xs }]}>
            {client.inviteCode}
          </Text>
        </TouchableOpacity>
        <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
          Нажми на код, чтобы поделиться. Код сработает один раз — после принятия его нельзя использовать повторно.
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Button title="Поделиться" onPress={handleShare} style={{ flex: 1 }} disabled={loading} />
          <Button title="Новый код" variant="ghost" onPress={handleRegenerate} style={{ flex: 1 }} disabled={loading} />
        </View>
      </View>
    );
  }

  // ── State 1: Not invited ──────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
        ПРИГЛАШЕНИЕ В ПРИЛОЖЕНИЕ
      </Text>
      <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
        Свяжи {clientName} с его аккаунтом Giron — программа и прогресс появятся у него в приложении.
      </Text>
      <Button
        title="Сгенерировать код"
        onPress={handleGenerate}
        style={{ marginTop: spacing.md }}
        disabled={loading}
        loading={loading}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  code: {
    fontSize: 28,
    fontFamily: 'Menlo',
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
