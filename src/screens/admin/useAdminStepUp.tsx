/**
 * Step-up re-authentication for admin financial / destructive ops.
 *
 * The server (2026-04 security audit HIGH-11) requires the admin to
 * re-enter their password (+ TOTP if enabled) before:
 *   - PATCH /admin/users/:id/role
 *   - PATCH /admin/users/:id/subscription
 *   - POST  /admin/users/:id/ban
 *   - DELETE /admin/users/:id
 *   - POST  /admin/users/:id/force-logout
 *   - POST  /admin/users/:id/force-disable-2fa
 *
 * Without the password + TOTP in the request body, the server returns
 * 400/401 with code `ADMIN_PASSWORD_REQUIRED` / `ADMIN_TOTP_REQUIRED` /
 * `INVALID_ADMIN_PASSWORD` / `INVALID_ADMIN_TOTP`. The client was
 * showing "Не удалось выдать подписку" generic error because no UI
 * collected the credentials.
 *
 * Usage:
 *
 *   const { withStepUp, modal } = useAdminStepUp();
 *
 *   const onGrantPro = async () => {
 *     await withStepUp(creds =>
 *       adminService.changeUserSubscription(userId, { plan: 'pro' }, creds)
 *     );
 *   };
 *
 *   return <View>... {modal}</View>;
 *
 * `withStepUp(fn)`:
 *   1. tries `fn()` with no creds (so non-destructive paths skip the prompt)
 *   2. on `ADMIN_PASSWORD_REQUIRED` / `ADMIN_TOTP_REQUIRED` / `STEPUP_INVALID`
 *      shows the modal, awaits creds, and retries `fn(creds)`
 *   3. on `INVALID_ADMIN_PASSWORD` / `INVALID_ADMIN_TOTP` re-shows the modal
 *      so the admin can correct the input (single retry, no infinite loop)
 *   4. on cancel rejects with `STEPUP_CANCELLED`
 *
 * The hook does NOT cache credentials between calls — each financial
 * operation re-prompts. That's the security model: one re-auth per
 * sensitive write. If the admin runs a batch of operations, they'll
 * re-enter the password for each. Acceptable trade-off (single-user
 * mode means only one admin doing the typing).
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useThemeColors } from '../../store';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import type { AdminStepUpCreds } from '../../services/adminService';

interface PendingPrompt {
  resolve: (creds: AdminStepUpCreds) => void;
  reject: (reason: Error) => void;
  /** Server's last error message, shown above the inputs on retry. */
  hint?: string;
}

const STEPUP_ERROR_CODES = new Set([
  'ADMIN_PASSWORD_REQUIRED',
  'ADMIN_TOTP_REQUIRED',
  'STEPUP_INVALID',
  'INVALID_ADMIN_PASSWORD',
  'INVALID_ADMIN_TOTP',
]);

export class StepUpCancelledError extends Error {
  constructor() {
    super('STEPUP_CANCELLED');
    this.name = 'StepUpCancelledError';
  }
}

export function useAdminStepUp() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);

  const ask = useCallback(
    (hint?: string): Promise<AdminStepUpCreds> =>
      new Promise((resolve, reject) => setPending({ resolve, reject, hint })),
    [],
  );

  const withStepUp = useCallback(
    async <T,>(fn: (creds?: AdminStepUpCreds) => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e: any) {
        const code = e?.response?.data?.code;
        const msg = e?.response?.data?.error as string | undefined;
        if (!code || !STEPUP_ERROR_CODES.has(code)) throw e;
        // First attempt — open modal with no hint
        let creds = await ask(msg);
        try {
          return await fn(creds);
        } catch (e2: any) {
          const code2 = e2?.response?.data?.code;
          if (code2 === 'INVALID_ADMIN_PASSWORD' || code2 === 'INVALID_ADMIN_TOTP') {
            // Wrong password / wrong TOTP — single retry with hint
            creds = await ask(e2?.response?.data?.error);
            return await fn(creds);
          }
          throw e2;
        }
      }
    },
    [ask],
  );

  const modal = (
    <AdminStepUpModalImpl
      pending={pending}
      onSubmit={(creds) => {
        pending?.resolve(creds);
        setPending(null);
      }}
      onCancel={() => {
        pending?.reject(new StepUpCancelledError());
        setPending(null);
      }}
    />
  );

  return { withStepUp, modal };
}

// ─── Modal UI ───────────────────────────────────────────────────────────────

interface ModalImplProps {
  pending: PendingPrompt | null;
  onSubmit: (creds: AdminStepUpCreds) => void;
  onCancel: () => void;
}

function AdminStepUpModalImpl({ pending, onSubmit, onCancel }: ModalImplProps) {
  const colors = useThemeColors();
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');

  // Reset inputs whenever the modal opens fresh
  React.useEffect(() => {
    if (pending) {
      setPassword('');
      setTotp('');
    }
  }, [pending]);

  const submit = () => {
    if (password.length === 0) return;
    onSubmit({ adminPassword: password, adminTotpCode: totp.length === 6 ? totp : undefined });
  };

  const styles = StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
    },
    title: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
    subtitle: { ...typography.small, color: colors.textSecondary, marginBottom: spacing.md },
    hint: {
      ...typography.small,
      color: colors.error,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: colors.error + '15',
      borderRadius: borderRadius.sm,
    },
    label: { ...typography.smallMedium, color: colors.text, marginBottom: spacing.xs },
    input: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: borderRadius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.text,
      fontSize: 16,
      marginBottom: spacing.md,
    },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    btn: { flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.sm, alignItems: 'center' },
    btnCancel: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 },
    btnConfirm: { backgroundColor: colors.primary },
    btnText: { ...typography.bodySemibold, color: colors.text },
    btnConfirmText: { ...typography.bodySemibold, color: '#0E0E0F' },
    btnDisabled: { opacity: 0.4 },
  });

  return (
    <Modal visible={!!pending} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>Подтверди действие</Text>
            <Text style={styles.subtitle}>
              Для этой операции нужен пароль администратора. Если включена 2FA — также код.
            </Text>
            {pending?.hint && <Text style={styles.hint}>{pending.hint}</Text>}

            <Text style={styles.label}>Пароль администратора</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={styles.label}>Код 2FA (если включено)</Text>
            <TextInput
              value={totp}
              onChangeText={(v) => setTotp(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              style={styles.input}
              placeholder="123456"
              placeholderTextColor={colors.textTertiary}
            />

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onCancel}>
                <Text style={styles.btnText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnConfirm, password.length === 0 && styles.btnDisabled]}
                onPress={submit}
                disabled={password.length === 0}
              >
                <Text style={styles.btnConfirmText}>Подтвердить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
