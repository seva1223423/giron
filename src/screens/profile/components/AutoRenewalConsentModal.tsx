import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useThemeColors } from '../../../store';
import { Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  visible: boolean;
  /** Plain-language amount label, e.g. "299 ₽/месяц" or "1 990 ₽/год". */
  priceLabel: string;
  /** Plain-language renewal cadence, e.g. "ежемесячно" / "ежегодно". */
  cadenceLabel: string;
  /** Called with an ISO timestamp captured the moment the user confirms.
   *  The caller forwards it to the activate endpoint where it's validated
   *  ≤2 min old — see server/src/routes/subscription.ts. */
  onConfirm: (consentTimestamp: string) => void;
  onCancel: () => void;
}

/**
 * 376-ФЗ §3 explicit consent modal. Russian law requires that auto-renewing
 * subscriptions show the user the actual amount and cadence and capture an
 * affirmative consent action — a checkbox tucked at the bottom of the screen
 * doesn't qualify. This modal:
 *
 *   1. Restates the price + cadence in unambiguous Russian.
 *   2. Requires the user to explicitly tick "Я согласен" before "Подтвердить"
 *      becomes enabled.
 *   3. Shows a link to the offer document (terms.html) and a 1-line plain
 *      summary of the cancel path so the user knows how to undo this.
 *   4. Captures `new Date().toISOString()` at the moment of confirm and
 *      forwards it to the parent — server-side validation rejects stale
 *      timestamps to prevent replay.
 */
export const AutoRenewalConsentModal: React.FC<Props> = ({
  visible,
  priceLabel,
  cadenceLabel,
  onConfirm,
  onCancel,
}) => {
  const colors = useThemeColors();
  const [agreed, setAgreed] = useState(false);

  const handleConfirm = () => {
    if (!agreed) return;
    const consentTimestamp = new Date().toISOString();
    setAgreed(false); // reset for next open
    onConfirm(consentTimestamp);
  };

  const handleCancel = () => {
    setAgreed(false);
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[typography.h4, { color: colors.text, textAlign: 'center' }]}>
            Подтверждение автопродления
          </Text>

          <View style={[styles.priceBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[typography.bodySemibold, { color: colors.text, textAlign: 'center' }]}>
              {priceLabel}
            </Text>
            <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}>
              Списание {cadenceLabel} с привязанной карты
            </Text>
          </View>

          <Text style={[typography.small, { color: colors.text, lineHeight: 20 }]}>
            Подписка будет автоматически продлеваться {cadenceLabel}. За 48 часов до каждого списания мы пришлём напоминание на email.
          </Text>

          <Text style={[typography.small, { color: colors.textSecondary, lineHeight: 20, marginTop: spacing.sm }]}>
            Отменить продление можно в любой момент в разделе «Подписка» в этом приложении — доступ сохранится до конца оплаченного периода. Это требование 376-ФЗ.
          </Text>

          <TouchableOpacity
            onPress={() => setAgreed((v) => !v)}
            style={styles.checkboxRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: agreed ? colors.primary : colors.border,
                  backgroundColor: agreed ? colors.primary : 'transparent',
                },
              ]}
            >
              {agreed && (
                <Text style={{ color: colors.textInverse, fontSize: 14, fontWeight: '800' }}>
                  ✓
                </Text>
              )}
            </View>
            <Text style={[typography.small, { color: colors.text, flex: 1, lineHeight: 20 }]}>
              Я согласен с автоматическим продлением и{' '}
              <Text
                style={{ color: colors.primary, textDecorationLine: 'underline' }}
                onPress={() => Linking.openURL('https://giron.app/terms.html')}
              >
                условиями использования
              </Text>
              .
            </Text>
          </TouchableOpacity>

          <View style={styles.actions}>
            <Button
              title="Отмена"
              variant="ghost"
              onPress={handleCancel}
              style={{ flex: 1, marginRight: spacing.sm }}
            />
            <Button
              title="Подтвердить"
              variant="primary"
              onPress={handleConfirm}
              disabled={!agreed}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.md,
  },
  priceBox: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
});
