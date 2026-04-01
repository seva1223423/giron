import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useAuthStore } from '../../store';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { userService } from '../../services';

const GOALS = [
  { value: 'MUSCLE_GAIN', label: 'Набор мышц', emoji: '💪' },
  { value: 'WEIGHT_LOSS', label: 'Похудение', emoji: '🔥' },
  { value: 'STRENGTH', label: 'Сила', emoji: '🏋️' },
  { value: 'ENDURANCE', label: 'Выносливость', emoji: '🏃' },
  { value: 'FLEXIBILITY', label: 'Гибкость', emoji: '🧘' },
  { value: 'GENERAL_FITNESS', label: 'Общая форма', emoji: '⚡' },
];

const LEVELS = [
  { value: 'BEGINNER', label: 'Новичок', desc: '< 1 года' },
  { value: 'INTERMEDIATE', label: 'Средний', desc: '1–3 года' },
  { value: 'ADVANCED', label: 'Продвинутый', desc: '3–5 лет' },
  { value: 'EXPERT', label: 'Эксперт', desc: '5+ лет' },
];

export const EditProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user, setUser } = useAuthStore();

  const [weightKg, setWeightKg] = useState(user?.weightKg?.toString() || '');
  const [heightCm, setHeightCm] = useState(user?.heightCm?.toString() || '');
  const [goal, setGoal] = useState(user?.goal || '');
  const [fitnessLevel, setFitnessLevel] = useState(user?.fitnessLevel || '');
  const [experienceYears, setExperienceYears] = useState(user?.trainingExperienceYears?.toString() || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const updated = await userService.updateProfile({
        weightKg: weightKg ? parseFloat(weightKg) : undefined,
        heightCm: heightCm ? parseFloat(heightCm) : undefined,
        goal: goal || undefined,
        fitnessLevel: fitnessLevel || undefined,
        trainingExperienceYears: experienceYears ? parseInt(experienceYears) : undefined,
      } as any);
      setUser({ ...user!, ...updated });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить. Проверь подключение к серверу.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>Редактировать профиль</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Body metrics */}
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
          Параметры тела
        </Text>
        <View style={styles.inputRow}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
              Вес (кг)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={weightKg}
              onChangeText={setWeightKg}
              keyboardType="decimal-pad"
              placeholder="75"
              placeholderTextColor={colors.inputPlaceholder}
            />
          </View>
          <View style={{ width: spacing.md }} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
              Рост (см)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={heightCm}
              onChangeText={setHeightCm}
              keyboardType="numeric"
              placeholder="175"
              placeholderTextColor={colors.inputPlaceholder}
            />
          </View>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
            Стаж (лет)
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text, width: '48%' }]}
            value={experienceYears}
            onChangeText={setExperienceYears}
            keyboardType="numeric"
            placeholder="2"
            placeholderTextColor={colors.inputPlaceholder}
          />
        </View>
      </Card>

      {/* Goal */}
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
          Цель тренировок
        </Text>
        <View style={styles.optionsGrid}>
          {GOALS.map((g) => {
            const selected = goal === g.value;
            return (
              <TouchableOpacity
                key={g.value}
                onPress={() => { Haptics.selectionAsync(); setGoal(g.value); }}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: selected ? colors.primary + '15' : colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 24, marginBottom: spacing.xs }}>{g.emoji}</Text>
                <Text style={[typography.captionMedium, { color: selected ? colors.primary : colors.text, textAlign: 'center' }]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Level */}
      <Card style={{ marginBottom: spacing.xl }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
          Уровень подготовки
        </Text>
        {LEVELS.map((l) => {
          const selected = fitnessLevel === l.value;
          return (
            <TouchableOpacity
              key={l.value}
              onPress={() => { Haptics.selectionAsync(); setFitnessLevel(l.value); }}
              style={[
                styles.levelRow,
                { borderColor: selected ? colors.primary : colors.border },
                { backgroundColor: selected ? colors.primary + '10' : 'transparent' },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodySemibold, { color: selected ? colors.primary : colors.text }]}>
                  {l.label}
                </Text>
                <Text style={[typography.small, { color: colors.textSecondary }]}>{l.desc}</Text>
              </View>
              {selected && (
                <View style={[styles.checkmark, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </Card>

      {/* Save button */}
      {saving ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.huge }} />
      ) : (
        <Button
          title="Сохранить изменения"
          onPress={handleSave}
          fullWidth
          size="lg"
          style={{ marginBottom: spacing.huge }}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    fontWeight: '500',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionCard: {
    width: '30.5%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    marginBottom: spacing.sm,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
