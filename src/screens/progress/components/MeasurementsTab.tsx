import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput, ScrollView,
  StyleSheet, Alert, Platform,
} from 'react-native';
import { Card, FadeIn, Button, PaywallModal } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { useMeasurementsStore, BodyMeasurement } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSubscriptionStore, FREE_LIMITS } from '../../../store/useSubscriptionStore';
import { localDateStr } from '../../../utils/date';

const FIELDS: { key: keyof Omit<BodyMeasurement, 'id' | 'date' | 'notes'>; label: string }[] = [
  { key: 'chest', label: 'Грудь' },
  { key: 'waist', label: 'Талия' },
  { key: 'hips', label: 'Бёдра' },
  { key: 'bicep', label: 'Руки (бицепс)' },
  { key: 'thigh', label: 'Бедро' },
  { key: 'calf', label: 'Икра' },
  { key: 'neck', label: 'Шея' },
];

interface Props {
  colors: any;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' });
}

function diff(a?: number, b?: number): string | null {
  if (a == null || b == null) return null;
  const d = a - b;
  if (d === 0) return null;
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}`;
}

export const MeasurementsTab: React.FC<Props> = ({ colors }) => {
  const haptic = useHaptic();
  const { entries, addEntry, deleteEntry } = useMeasurementsStore();
  const { canViewFullMeasurements } = useSubscriptionStore();
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  // Form state
  const [formDate, setFormDate] = useState(localDateStr(new Date()));
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formNotes, setFormNotes] = useState('');

  const allSorted = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );
  const isMeasurementsTruncated = !canViewFullMeasurements() && allSorted.length > FREE_LIMITS.MEASUREMENTS;
  const sorted = useMemo(
    () => canViewFullMeasurements() ? allSorted : allSorted.slice(0, FREE_LIMITS.MEASUREMENTS),
    [allSorted, canViewFullMeasurements],
  );

  const latest = sorted[0] ?? null;
  const prev = sorted[1] ?? null;

  const openModal = () => {
    setFormDate(localDateStr(new Date()));
    setFormValues({});
    setFormNotes('');
    setShowModal(true);
  };

  const handleSave = () => {
    const hasAny = FIELDS.some((f) => formValues[f.key]);
    if (!hasAny) { Alert.alert('Заполни хотя бы одно поле'); return; }
    haptic.success();
    const entry: Omit<BodyMeasurement, 'id'> = { date: formDate, notes: formNotes.trim() || undefined };
    FIELDS.forEach((f) => {
      if (formValues[f.key]) {
        (entry as any)[f.key] = parseFloat(formValues[f.key].replace(',', '.'));
      }
    });
    addEntry(entry);
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Удалить запись?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => { haptic.medium(); deleteEntry(id); } },
    ]);
  };

  // Chart data for a given field across all entries (last 12)
  const chartFor = (key: keyof Omit<BodyMeasurement, 'id' | 'date' | 'notes'>) => {
    return sorted.slice(0, 12).reverse()
      .filter((e) => e[key] != null)
      .map((e) => ({ label: fmtDate(e.date).slice(0, 5), value: e[key] as number }));
  };

  return (
    <>
      {/* Header */}
      <FadeIn delay={0}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text }]}>Замеры тела</Text>
          <TouchableOpacity
            onPress={openModal}
            style={[styles.addBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}
          >
            <Text style={[typography.captionMedium, { color: colors.primary }]}>+ Добавить</Text>
          </TouchableOpacity>
        </View>
      </FadeIn>

      {/* Latest snapshot */}
      {latest && (
        <FadeIn delay={50}>
          <Card style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md }}>
              <View>
                <Text style={[typography.h4, { color: colors.text }]}>Последние замеры</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>{fmtDate(latest.date)}</Text>
              </View>
            </View>
            <View style={styles.grid}>
              {FIELDS.filter((f) => latest[f.key] != null).map((f) => {
                const d = diff(latest[f.key], prev?.[f.key]);
                return (
                  <View key={f.key} style={[styles.cell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[typography.numberSmall, { color: colors.primary, fontSize: 18 }]}>
                      {(latest[f.key] as number).toFixed(1)}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textSecondary, textAlign: 'center' }]} numberOfLines={1}>{f.label}</Text>
                    {d && (
                      <Text style={[typography.caption, { color: d.startsWith('+') ? colors.error : colors.success, fontSize: 10 }]}>
                        {d} см
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
            {latest.notes ? (
              <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>{latest.notes}</Text>
            ) : null}
          </Card>
        </FadeIn>
      )}

      {/* History list */}
      {sorted.length === 0 ? (
        <FadeIn delay={80}>
          <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
            <Text style={{ fontSize: 40, marginBottom: spacing.md }}>📏</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              Добавь первые замеры{'\n'}чтобы отслеживать прогресс
            </Text>
            <Button title="Добавить замеры" onPress={openModal} style={{ marginTop: spacing.lg }} />
          </Card>
        </FadeIn>
      ) : (
        <FadeIn delay={120}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>ИСТОРИЯ</Text>
            {sorted.map((entry, i) => (
              <TouchableOpacity
                key={entry.id}
                onPress={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                style={[styles.row, i < sorted.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>{fmtDate(entry.date)}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={expandedId === entry.id ? undefined : 1}>
                    {FIELDS.filter((f) => entry[f.key] != null)
                      .map((f) => `${f.label}: ${(entry[f.key] as number).toFixed(1)} см`)
                      .join(' · ')}
                  </Text>
                  {expandedId === entry.id && entry.notes ? (
                    <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>{entry.notes}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(entry.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ paddingLeft: spacing.md }}
                >
                  <Text style={[typography.caption, { color: colors.error + '80' }]}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            {isMeasurementsTruncated && (
              <TouchableOpacity
                onPress={() => { haptic.medium(); setShowPaywall(true); }}
                style={[styles.paywallRow, { borderTopColor: colors.divider }]}
              >
                <Text style={[typography.captionMedium, { color: colors.primary }]}>
                  ◈ Ещё {allSorted.length - FREE_LIMITS.MEASUREMENTS} записей скрыто — открыть Pro →
                </Text>
              </TouchableOpacity>
            )}
          </Card>
        </FadeIn>
      )}

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason="feature"
        featureName="Полная история замеров"
      />

      {/* Add Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
                <Text style={[typography.h4, { color: colors.text }]}>Добавить замеры</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Text style={[typography.h4, { color: colors.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6 }]}>Дата (ГГГГ-ММ-ДД)</Text>
              <TextInput
                value={formDate}
                onChangeText={setFormDate}
                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                keyboardType="numeric"
                maxLength={10}
                placeholder="2026-04-12"
                placeholderTextColor={colors.textTertiary}
              />

              <View style={styles.formGrid}>
                {FIELDS.map((f) => (
                  <View key={f.key} style={{ width: '48%' }}>
                    <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 4 }]}>{f.label} (см)</Text>
                    <TextInput
                      value={formValues[f.key] ?? ''}
                      onChangeText={(v) => setFormValues((prev) => ({ ...prev, [f.key]: v }))}
                      placeholder="—"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numeric"
                      style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                    />
                  </View>
                ))}
              </View>

              <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6 }]}>Заметки</Text>
              <TextInput
                value={formNotes}
                onChangeText={setFormNotes}
                placeholder="Необязательно..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={2}
                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text, minHeight: 50, textAlignVertical: 'top' }]}
              />

              <Button title="Сохранить" onPress={handleSave} fullWidth style={{ marginTop: spacing.lg }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  addBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.md, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { width: '30%', alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, minWidth: 90, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: Platform.OS === 'ios' ? 40 : spacing.xl, maxHeight: '90%' },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md, fontSize: 15 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  paywallRow: { borderTopWidth: 1, paddingTop: spacing.md, marginTop: spacing.sm },
});
