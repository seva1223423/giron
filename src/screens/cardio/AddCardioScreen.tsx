import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useCardioStore } from '../../store';
import { Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { CardioType } from '../../types';
import { localDateStr } from '../../utils/date';

const CARDIO_TYPES: { type: CardioType; abbr: string; label: string; hasDistance: boolean }[] = [
  { type: 'running',    abbr: 'Б', label: 'Бег',        hasDistance: true  },
  { type: 'cycling',   abbr: 'В', label: 'Велосипед',  hasDistance: true  },
  { type: 'walking',   abbr: 'Х', label: 'Ходьба',     hasDistance: true  },
  { type: 'swimming',  abbr: 'П', label: 'Плавание',   hasDistance: true  },
  { type: 'hiit',      abbr: 'HI', label: 'HIIT',       hasDistance: false },
  { type: 'elliptical',abbr: 'Э', label: 'Эллипс',    hasDistance: false },
  { type: 'rowing',    abbr: 'Г', label: 'Гребля',     hasDistance: true  },
  { type: 'other',     abbr: '...', label: 'Другое',     hasDistance: false },
];

// MET values for calorie estimation
const MET: Record<CardioType, number> = {
  running: 9.8, cycling: 7.5, walking: 3.5, swimming: 8.0,
  hiit: 10.0, elliptical: 5.0, rowing: 7.0, other: 5.0,
};

const todayDate = () => localDateStr(new Date());

export const AddCardioScreen: React.FC<{ navigation: any; route: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { addSession } = useCardioStore();

  const [selectedType, setSelectedType] = useState<CardioType>('running');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [calories, setCalories] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(todayDate());

  const selected = CARDIO_TYPES.find((t) => t.type === selectedType)!;

  const estimateCalories = () => {
    const min = parseFloat(duration);
    if (!min || min <= 0) return;
    // Estimate using MET × weight(assumed 75kg) × hours
    const est = Math.round(MET[selectedType] * 75 * (min / 60));
    setCalories(est.toString());
    haptic.light();
  };

  const handleSave = () => {
    const min = parseInt(duration, 10);
    if (!min || min <= 0) {
      Alert.alert('Ошибка', 'Укажи продолжительность');
      return;
    }
    const toFinite = (s: string, parser: (v: string) => number) => {
      const n = parser(s);
      return Number.isFinite(n) ? n : undefined;
    };
    addSession({
      type: selectedType,
      date,
      durationMinutes: min,
      distanceKm: distance ? toFinite(distance, parseFloat) : undefined,
      caloriesBurned: calories ? toFinite(calories, (v) => parseInt(v, 10)) : undefined,
      avgHeartRate: heartRate ? toFinite(heartRate, (v) => parseInt(v, 10)) : undefined,
      notes: notes.trim() || undefined,
    });
    haptic.success();
    navigation.goBack();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: safeTop }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[typography.h2, { color: colors.text, marginLeft: spacing.md }]}>Кардио</Text>
      </View>

      {/* Type picker */}
      <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>
        ТИП АКТИВНОСТИ
      </Text>
      <View style={styles.typeGrid}>
        {CARDIO_TYPES.map((t) => (
          <TouchableOpacity
            key={t.type}
            onPress={() => { haptic.selection(); setSelectedType(t.type); }}
            style={[
              styles.typeBtn,
              { borderColor: selectedType === t.type ? colors.primary : colors.border, backgroundColor: selectedType === t.type ? colors.primary + '15' : colors.surface },
            ]}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: selectedType === t.type ? colors.primary + '20' : colors.surface, borderWidth: 1.5, borderColor: selectedType === t.type ? colors.primary + '60' : colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 14, fontWeight: '700', color: selectedType === t.type ? colors.primary : colors.textSecondary }}>{t.abbr}</Text></View>
            <Text style={[typography.caption, { color: selectedType === t.type ? colors.primary : colors.text, marginTop: 4 }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Duration */}
      <Text style={[typography.captionMedium, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>
        ПРОДОЛЖИТЕЛЬНОСТЬ (мин)
      </Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
        value={duration}
        onChangeText={setDuration}
        keyboardType="numeric"
        placeholder="30"
        placeholderTextColor={colors.inputPlaceholder}
      />

      {/* Distance (conditional) */}
      {selected.hasDistance && (
        <>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>
            ДИСТАНЦИЯ (км) — необязательно
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
            value={distance}
            onChangeText={setDistance}
            keyboardType="decimal-pad"
            placeholder="5.0"
            placeholderTextColor={colors.inputPlaceholder}
          />
        </>
      )}

      {/* Calories */}
      <Text style={[typography.captionMedium, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>
        КАЛОРИИ — необязательно
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <TextInput
          style={[styles.input, { flex: 1, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
          value={calories}
          onChangeText={setCalories}
          keyboardType="numeric"
          placeholder="300"
          placeholderTextColor={colors.inputPlaceholder}
        />
        <TouchableOpacity
          onPress={estimateCalories}
          style={[styles.estimateBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
        >
          <Text style={[typography.caption, { color: colors.primary }]}>Рассчитать</Text>
        </TouchableOpacity>
      </View>

      {/* Heart rate */}
      <Text style={[typography.captionMedium, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>
        СРЕДНИЙ ПУЛЬС (уд/мин) — необязательно
      </Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
        value={heartRate}
        onChangeText={setHeartRate}
        keyboardType="numeric"
        placeholder="140"
        placeholderTextColor={colors.inputPlaceholder}
      />

      {/* Notes */}
      <Text style={[typography.captionMedium, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>
        ЗАМЕТКА — необязательно
      </Text>
      <TextInput
        style={[styles.input, styles.notesInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Бежал по парку, хорошее самочувствие..."
        placeholderTextColor={colors.inputPlaceholder}
        multiline
        numberOfLines={3}
      />

      <Button title="Сохранить" onPress={handleSave} fullWidth size="lg" style={{ marginTop: spacing.xl }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeBtn: {
    width: '22%', minWidth: 72, alignItems: 'center', paddingVertical: spacing.md,
    borderRadius: borderRadius.lg, borderWidth: 1.5,
  },
  input: {
    height: 48, borderRadius: borderRadius.md, borderWidth: 1,
    paddingHorizontal: spacing.lg, fontSize: 16, fontWeight: '500',
  },
  notesInput: { height: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  estimateBtn: {
    borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
});
