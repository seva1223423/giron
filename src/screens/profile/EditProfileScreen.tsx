import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useAuthStore, useNutritionStore } from '../../store';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { userService } from '../../services';
import { GoalSelectorCard, LevelSelectorCard } from './components';
import { localDateStr } from '../../utils/date';

export const EditProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { user, setUser } = useAuthStore();
  const { setTargets } = useNutritionStore();

  const [weightKg, setWeightKg] = useState(user?.weightKg?.toString() || '');
  const [heightCm, setHeightCm] = useState(user?.heightCm?.toString() || '');
  const [goal, setGoal] = useState(user?.goal?.toUpperCase() || '');
  const [fitnessLevel, setFitnessLevel] = useState(user?.fitnessLevel?.toUpperCase() || '');
  const [experienceYears, setExperienceYears] = useState(user?.trainingExperienceYears?.toString() || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const wKgParsed = weightKg ? parseFloat(weightKg.replace(',', '.')) : undefined;
    const hCmParsed = heightCm ? parseFloat(heightCm.replace(',', '.')) : undefined;
    const expParsed = experienceYears ? parseInt(experienceYears.replace(',', '.'), 10) : undefined;
    if (wKgParsed !== undefined && (!Number.isFinite(wKgParsed) || wKgParsed < 20 || wKgParsed > 400)) {
      Alert.alert('Ошибка', 'Вес должен быть от 20 до 400 кг');
      return;
    }
    if (hCmParsed !== undefined && (!Number.isFinite(hCmParsed) || hCmParsed < 100 || hCmParsed > 300)) {
      Alert.alert('Ошибка', 'Рост должен быть от 100 до 300 см');
      return;
    }
    if (expParsed !== undefined && (!Number.isFinite(expParsed) || expParsed < 0 || expParsed > 80)) {
      Alert.alert('Ошибка', 'Опыт тренировок должен быть от 0 до 80 лет');
      return;
    }
    setSaving(true);
    haptic.medium();
    try {
      const updated = await userService.updateProfile({
        weightKg: wKgParsed,
        heightCm: hCmParsed,
        goal: goal || undefined,
        fitnessLevel: fitnessLevel || undefined,
        trainingExperienceYears: expParsed,
      } as any);
      if (!user) return;
      setUser({ ...user, ...updated });

      const wKg = wKgParsed ?? user?.weightKg;
      const hCm = hCmParsed ?? user?.heightCm;
      const currentGoal = goal || user?.goal;
      if (wKg && hCm && currentGoal) {
        const gender = user?.gender?.toLowerCase();
        const ageYears = user?.dateOfBirth
          ? Math.floor((Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
          : 30;
        const bmr = gender === 'female' ? 10 * wKg + 6.25 * hCm - 5 * ageYears - 161 : 10 * wKg + 6.25 * hCm - 5 * ageYears + 5;
        const tdee = Math.round(bmr * 1.55);
        const goalNorm = currentGoal.toLowerCase();
        const targetCalories = goalNorm.includes('loss') ? Math.round(tdee - 400) : goalNorm.includes('gain') ? Math.round(tdee + 250) : tdee;
        const proteinPerKg = goalNorm.includes('gain') ? 2.2 : goalNorm.includes('loss') ? 2.0 : 1.8;
        const targetProtein = Math.round(wKg * proteinPerKg);
        const targetFats = Math.round((targetCalories * 0.25) / 9);
        const targetCarbs = Math.max(Math.round((targetCalories - targetProtein * 4 - targetFats * 9) / 4), 50);
        const waterTargetMl = Math.round(wKg * 35);
        const today = localDateStr(new Date());
        setTargets(today, { calories: targetCalories, protein: targetProtein, fats: targetFats, carbs: targetCarbs, waterTargetMl });
      }

      haptic.success();
      navigation.goBack();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить. Проверь подключение к серверу.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.header, { paddingTop: safeTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>Редактировать профиль</Text>
        <View style={{ width: 24 }} />
      </View>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Параметры тела</Text>
        <View style={styles.inputRow}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Вес (кг)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]} value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" placeholder="75" placeholderTextColor={colors.inputPlaceholder} />
          </View>
          <View style={{ width: spacing.md }} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Рост (см)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]} value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" placeholder="175" placeholderTextColor={colors.inputPlaceholder} />
          </View>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Стаж (лет)</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text, width: '48%' }]} value={experienceYears} onChangeText={setExperienceYears} keyboardType="numeric" placeholder="2" placeholderTextColor={colors.inputPlaceholder} />
        </View>
      </Card>

      <GoalSelectorCard selected={goal} onSelect={setGoal} />
      <LevelSelectorCard selected={fitnessLevel} onSelect={setFitnessLevel} />

      {saving ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.huge }} />
      ) : (
        <Button title="Сохранить изменения" onPress={handleSave} fullWidth size="lg" style={{ marginBottom: spacing.huge }} />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.lg },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  input: { height: 48, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 16, fontWeight: '500' },
});
