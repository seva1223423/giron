import React, { useMemo, useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, StyleSheet,
} from 'react-native';

export type GrantPlan = 'pro' | 'trainer' | 'club';

export type GrantSubscriptionModalProps = {
  visible: boolean;
  userName: string;
  defaultPlan?: GrantPlan;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (data: { plan: GrantPlan; endDate: string | null }) => void | Promise<void>;
};

const PLANS: { key: GrantPlan; label: string; color: string }[] = [
  { key: 'pro', label: 'PRO', color: '#6366F1' },
  { key: 'trainer', label: 'Trainer', color: '#F59E0B' },
  { key: 'club', label: 'Club', color: '#10B981' },
];

const PRESETS: { days: number | null; label: string }[] = [
  { days: 7, label: '7 дней' },
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
  { days: 180, label: '180 дней' },
  { days: 365, label: '365 дней' },
  { days: null, label: 'Навсегда' },
];

export const CUSTOM_MIN = 1;
export const CUSTOM_MAX = 3650;

export function addDays(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function parseCustomDays(input: string): number | null {
  const n = parseInt(input, 10);
  return Number.isFinite(n) && n >= CUSTOM_MIN && n <= CUSTOM_MAX ? n : null;
}

/**
 * Resolve final endDate from selector state.
 *   - usingCustom + valid number → today + N
 *   - lifetime preset → null
 *   - day preset → today + days
 *   - everything else → undefined (no valid selection yet)
 */
export function resolveEndDate(
  presetDays: number | null | undefined,
  customDays: string,
  now: Date = new Date(),
): string | null | undefined {
  const usingCustom = customDays.trim().length > 0;
  if (usingCustom) {
    const n = parseCustomDays(customDays);
    return n == null ? undefined : addDays(n, now);
  }
  if (presetDays === null) return null;
  if (typeof presetDays === 'number') return addDays(presetDays, now);
  return undefined;
}

export default function GrantSubscriptionModal({
  visible, userName, defaultPlan = 'pro', busy = false, onClose, onConfirm,
}: GrantSubscriptionModalProps) {
  const [plan, setPlan] = useState<GrantPlan>(defaultPlan);
  // null = lifetime preset, number = preset days, undefined = no preset (using custom)
  const [presetDays, setPresetDays] = useState<number | null | undefined>(30);
  const [customDays, setCustomDays] = useState('');

  useEffect(() => {
    if (visible) {
      setPlan(defaultPlan);
      setPresetDays(30);
      setCustomDays('');
    }
  }, [visible, defaultPlan]);

  const usingCustom = customDays.trim().length > 0;

  const resolved = useMemo(
    () => resolveEndDate(presetDays, customDays),
    [presetDays, customDays],
  );

  const previewLabel = useMemo(() => {
    if (resolved === undefined) {
      return usingCustom ? `Введите число от ${CUSTOM_MIN} до ${CUSTOM_MAX}` : '';
    }
    if (resolved === null) return 'Действует бессрочно';
    return `Действует до: ${new Date(resolved).toLocaleDateString('ru-RU')}`;
  }, [resolved, usingCustom]);

  const canConfirm = !busy && resolved !== undefined;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({ plan, endDate: resolved as string | null });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Выдать подписку</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>{userName}</Text>

          <Text style={styles.sectionLabel}>План</Text>
          <View style={styles.row}>
            {PLANS.map((p) => {
              const active = plan === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  testID={`plan-${p.key}`}
                  style={[
                    styles.chip,
                    { borderColor: p.color },
                    active && { backgroundColor: p.color + '22' },
                  ]}
                  onPress={() => setPlan(p.key)}
                  disabled={busy}
                >
                  <Text style={[styles.chipText, { color: p.color }]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Срок</Text>
          <View style={styles.presetGrid}>
            {PRESETS.map((preset) => {
              const isLifetime = preset.days === null;
              const active = !usingCustom && presetDays === preset.days;
              return (
                <TouchableOpacity
                  key={preset.label}
                  testID={`preset-${isLifetime ? 'lifetime' : preset.days}`}
                  style={[
                    styles.preset,
                    active && styles.presetActive,
                    isLifetime && active && styles.presetLifetimeActive,
                    usingCustom && styles.presetDisabled,
                  ]}
                  onPress={() => {
                    setCustomDays('');
                    setPresetDays(preset.days);
                  }}
                  disabled={busy}
                >
                  <Text style={[styles.presetText, active && styles.presetTextActive]}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Своё число дней</Text>
          <TextInput
            testID="custom-days-input"
            style={[styles.input, usingCustom && styles.inputActive]}
            placeholder={`${CUSTOM_MIN}–${CUSTOM_MAX}`}
            placeholderTextColor="#6B7280"
            keyboardType="number-pad"
            value={customDays}
            onChangeText={setCustomDays}
            editable={!busy}
            maxLength={4}
          />

          <View style={styles.preview}>
            <Text style={styles.previewText}>{previewLabel}</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelBtnText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="confirm-btn"
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Text style={styles.confirmBtnText}>{busy ? 'Сохраняем…' : 'Выдать'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, paddingBottom: 32,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  close: { fontSize: 18, color: '#6B7280', paddingHorizontal: 4 },
  hint: { fontSize: 12, color: '#9CA3AF', marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', marginBottom: 8, marginTop: 4 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center',
    backgroundColor: '#2C2C2E',
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  preset: {
    minWidth: '30%', flexGrow: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#2C2C2E', alignItems: 'center', borderWidth: 1, borderColor: '#3C3C3E',
  },
  presetActive: { backgroundColor: '#6366F122', borderColor: '#6366F1' },
  presetLifetimeActive: { backgroundColor: '#10B98122', borderColor: '#10B981' },
  presetDisabled: { opacity: 0.4 },
  presetText: { fontSize: 13, fontWeight: '600', color: '#D1D5DB' },
  presetTextActive: { color: '#FFFFFF' },
  input: {
    backgroundColor: '#2C2C2E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#FFFFFF', marginBottom: 12, borderWidth: 1, borderColor: '#3C3C3E',
  },
  inputActive: { borderColor: '#6366F1' },
  preview: {
    backgroundColor: '#2C2C2E', borderRadius: 10, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#3C3C3E',
  },
  previewText: { fontSize: 13, color: '#D1D5DB', textAlign: 'center', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#2C2C2E', borderWidth: 1, borderColor: '#3C3C3E',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#D1D5DB' },
  confirmBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#6366F1',
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
