import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput, StyleSheet, Alert, Platform,
} from 'react-native';
import { Card, FadeIn } from '../../../components';
import { LineChart } from './LineChart';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { useSleepStore } from '../../../store/useSleepStore';
import { useHaptic } from '../../../hooks/useHaptic';
import { localDateStr } from '../../../utils/date';

const QUALITY_LABELS: Record<number, string> = {
  1: 'Ужасно', 2: 'Плохо', 3: 'Нормально', 4: 'Хорошо', 5: 'Отлично',
};
const QUALITY_COLORS = ['#FF3B30', '#FF9F0A', '#FFD60A', '#34C759', '#30D158'];

interface Props { colors: any }

// ── Add Sleep Modal ────────────────────────────────────────────────────────────

function AddSleepModal({
  visible, onClose, onSave, colors,
}: { visible: boolean; onClose: () => void; onSave: (bedtime: string, wakeTime: string, quality: number | null) => void; colors: any }) {
  const [bedtime, setBedtime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [quality, setQuality] = useState<number | null>(null);

  const handleSave = () => {
    // Basic HH:MM validation
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRe.test(bedtime) || !timeRe.test(wakeTime)) {
      Alert.alert('Неверный формат', 'Введите время в формате ЧЧ:ММ, например 23:00');
      return;
    }
    onSave(bedtime, wakeTime, quality);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHeader}>
            <Text style={[typography.h4, { color: colors.text }]}>Добавить сон</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[typography.h4, { color: colors.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6 }]}>Лёг спать</Text>
              <TextInput
                style={[styles.timeInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                value={bedtime}
                onChangeText={setBedtime}
                placeholder="23:00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
            <Text style={[typography.h3, { color: colors.textSecondary, marginTop: 22, marginHorizontal: 8 }]}>→</Text>
            <View style={{ flex: 1 }}>
              <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6 }]}>Проснулся</Text>
              <TextInput
                style={[styles.timeInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                value={wakeTime}
                onChangeText={setWakeTime}
                placeholder="07:00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
          </View>

          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 10, marginTop: 4 }]}>Качество сна</Text>
          <View style={styles.qualityRow}>
            {[1, 2, 3, 4, 5].map((q) => (
              <TouchableOpacity
                key={q}
                style={[
                  styles.qualityBtn,
                  { borderColor: quality === q ? QUALITY_COLORS[q - 1] : colors.border },
                  quality === q && { backgroundColor: QUALITY_COLORS[q - 1] + '20' },
                ]}
                onPress={() => setQuality(quality === q ? null : q)}
              >
                <Text style={[
                  typography.captionMedium,
                  { color: quality === q ? QUALITY_COLORS[q - 1] : colors.textSecondary, fontSize: 11 },
                ]}>
                  {QUALITY_LABELS[q]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
          >
            <Text style={styles.saveBtnText}>Сохранить</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export const SleepTab: React.FC<Props> = ({ colors }) => {
  const { entries, getAverageDuration, getAverageQuality, addEntry, removeEntry } = useSleepStore();
  const haptic = useHaptic();
  const [showAdd, setShowAdd] = useState(false);

  const sorted = useMemo(() =>
    [...entries].sort((a, b) => b.date.localeCompare(a.date)),
  [entries]);

  const avgDuration7 = getAverageDuration(7);
  const avgQuality7 = getAverageQuality(7);
  const avgDuration30 = getAverageDuration(30);
  const avgQuality30 = getAverageQuality(30);

  const durationChart = useMemo(() =>
    [...sorted].reverse().slice(-30).map((e) => ({
      label: new Date(e.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''),
      value: e.durationHours,
    })),
  [sorted]);

  const qualityChart = useMemo(() =>
    [...sorted].reverse().slice(-30).filter((e) => e.quality != null).map((e) => ({
      label: new Date(e.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''),
      value: e.quality as number,
    })),
  [sorted]);

  const qualityColor = avgQuality7 === 0 ? colors.primary
    : QUALITY_COLORS[Math.min(Math.round(avgQuality7) - 1, 4)];

  const handleSave = (bedtime: string, wakeTime: string, quality: number | null) => {
    haptic.success();
    const today = localDateStr(new Date());
    addEntry({ date: today, bedtime, wakeTime, quality: quality ?? undefined });
  };

  const handleDelete = (date: string) => {
    Alert.alert('Удалить запись?', 'Запись о сне будет удалена.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => { haptic.warning(); removeEntry(date); } },
    ]);
  };

  return (
    <>
      {/* Add button */}
      <FadeIn delay={0}>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => { haptic.selection(); setShowAdd(true); }}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ Добавить запись о сне</Text>
        </TouchableOpacity>
      </FadeIn>

      {sorted.length === 0 ? (
        <FadeIn delay={60}>
          <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: 32 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🌙</Text>
            <Text style={[typography.h4, { color: colors.text, marginBottom: 8 }]}>Нет данных о сне</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              Нажми кнопку выше, чтобы добавить первую запись
            </Text>
          </Card>
        </FadeIn>
      ) : (
        <>
          {/* 7-day summary */}
          <FadeIn delay={0}>
            <Card style={{ marginBottom: spacing.lg }}>
              <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Последние 7 дней</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                {[
                  { value: `${avgDuration7.toFixed(1)}ч`, label: 'средний сон', color: colors.primary },
                  { value: avgQuality7 > 0 ? `${avgQuality7.toFixed(1)}/5` : '—', label: 'качество', color: qualityColor },
                  { value: String(Math.min(sorted.length, 7)), label: 'записей', color: colors.accent },
                ].map(({ value, label, color }, i) => (
                  <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={[typography.number, { color, fontSize: 22 }]} numberOfLines={1}>{value}</Text>
                    <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
                  </View>
                ))}
              </View>

              <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Сон (рекомендовано 7–9ч)</Text>
                  <Text style={[typography.captionMedium, { color: avgDuration7 >= 7 ? colors.success : colors.warning }]}>
                    {avgDuration7 >= 7 ? 'Норма' : 'Недостаточно'}
                  </Text>
                </View>
                <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
                  <View style={{
                    height: 6, borderRadius: 3,
                    backgroundColor: avgDuration7 >= 7 ? colors.success : colors.warning,
                    width: `${Math.min(100, (avgDuration7 / 9) * 100)}%` as any,
                  }} />
                </View>
              </View>
            </Card>
          </FadeIn>

          {/* 30-day stats */}
          {sorted.length >= 7 && (
            <FadeIn delay={60}>
              <Card style={{ marginBottom: spacing.lg }}>
                <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>За 30 дней</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  {[
                    { value: `${avgDuration30.toFixed(1)}ч`, label: 'средний сон', color: colors.primary },
                    { value: avgQuality30 > 0 ? `${avgQuality30.toFixed(1)}/5` : '—', label: 'качество', color: colors.accent },
                  ].map(({ value, label, color }, i) => (
                    <View key={i} style={{ alignItems: 'center' }}>
                      <Text style={[typography.number, { color, fontSize: 20 }]}>{value}</Text>
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </FadeIn>
          )}

          {/* Duration trend chart */}
          {durationChart.length >= 3 && (
            <FadeIn delay={100}>
              <Card style={{ marginBottom: spacing.lg }}>
                <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Продолжительность (ч)</Text>
                <LineChart data={durationChart} color={colors.primary} colors={colors} suffix="ч" height={110} />
              </Card>
            </FadeIn>
          )}

          {/* Quality trend chart */}
          {qualityChart.length >= 3 && (
            <FadeIn delay={140}>
              <Card style={{ marginBottom: spacing.lg }}>
                <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Качество сна (1–5)</Text>
                <LineChart data={qualityChart} color={qualityColor} colors={colors} suffix="" height={110} />
              </Card>
            </FadeIn>
          )}

          {/* History list */}
          <FadeIn delay={180}>
            <Card style={{ marginBottom: spacing.lg }}>
              <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>История сна</Text>
              {sorted.slice(0, 20).map((entry, i, arr) => {
                const qualityIdx = entry.quality ? entry.quality - 1 : -1;
                const qColor = qualityIdx >= 0 ? QUALITY_COLORS[qualityIdx] : colors.textTertiary;
                return (
                  <View key={entry.date} style={[
                    styles.historyRow,
                    i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                  ]}>
                    <Text style={{ fontSize: 20 }}>🌙</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.small, { color: colors.text }]} numberOfLines={1}>
                        {new Date(entry.date + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>
                        {entry.bedtime} → {entry.wakeTime}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', marginRight: 8, maxWidth: 70 }}>
                      <Text style={[typography.captionMedium, { color: colors.primary }]} numberOfLines={1}>
                        {entry.durationHours.toFixed(1)}ч
                      </Text>
                      {entry.quality != null && (
                        <Text style={[typography.caption, { color: qColor }]} numberOfLines={1}>
                          {QUALITY_LABELS[entry.quality]}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(entry.date)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[typography.caption, { color: colors.error + '80' }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </Card>
          </FadeIn>
        </>
      )}

      <AddSleepModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleSave}
        colors={colors}
      />
    </>
  );
};

const styles = StyleSheet.create({
  addBtn: {
    borderRadius: borderRadius.xl,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 36 : spacing.xl,
    maxHeight: '88%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },

  timeRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.md },
  timeInput: {
    borderWidth: 1, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: 22, fontWeight: '700', textAlign: 'center',
  },

  qualityRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: spacing.xl },
  qualityBtn: { borderRadius: borderRadius.md, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 6 },

  saveBtn: { borderRadius: borderRadius.xl, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: 12 },
});
