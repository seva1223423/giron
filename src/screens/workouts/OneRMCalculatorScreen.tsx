import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useThemeStore, useAuthStore } from '../../store';
import { useSafeTop } from '../../hooks/useSafeTop';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { OneRMResultCard, PercentageTableCard, StrengthStandardsCard } from './onerm';

function epley(w: number, r: number) { return r === 1 ? w : Math.round(w * (1 + r / 30)); }
function brzycki(w: number, r: number) { return r === 1 ? w : Math.round(w * (36 / (37 - r))); }
function lander(w: number, r: number) { return r === 1 ? w : Math.round((100 * w) / (101.3 - 2.67123 * r)); }
function oconner(w: number, r: number) { return r === 1 ? w : Math.round(w * (1 + r / 40)); }

export const OneRMCalculatorScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const [weightStr, setWeightStr] = useState('');
  const [repsStr, setRepsStr] = useState('');

  const weight = parseFloat(weightStr) || 0;
  const reps = parseInt(repsStr, 10) || 0;
  const validInput = weight > 0 && reps >= 1 && reps <= 30;

  const results = useMemo(() => {
    if (!validInput) return null;
    const estimates = [
      { name: 'Эпли', value: epley(weight, reps) },
      { name: 'Брзыцки', value: brzycki(weight, reps) },
      { name: 'Ландер', value: lander(weight, reps) },
      { name: "О'Коннер", value: oconner(weight, reps) },
    ];
    const avg = Math.round(estimates.reduce((s, e) => s + e.value, 0) / estimates.length);
    return { estimates, avg };
  }, [weight, reps, validInput]);

  const userWeight = user?.weightKg || 80;
  const userGender: 'male' | 'female' = user?.gender === 'female' ? 'female' : 'male';

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.content, { paddingTop: safeTop }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.h2, { color: colors.text }]}>Калькулятор 1ПМ</Text>
          <Text style={[typography.small, { color: colors.textSecondary }]}>Оценка одноповторного максимума</Text>
        </View>
      </View>

      <FadeIn delay={0}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Введи рабочий подход</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>ВЕС (кг)</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]} value={weightStr} onChangeText={setWeightStr} placeholder="100" placeholderTextColor={colors.inputPlaceholder} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>ПОВТОРЕНИЯ</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]} value={repsStr} onChangeText={setRepsStr} placeholder="5" placeholderTextColor={colors.inputPlaceholder} keyboardType="number-pad" />
            </View>
          </View>
          {reps > 30 && <Text style={[typography.caption, { color: colors.error, marginTop: spacing.sm }]}>Для точного расчёта используй ≤30 повторений</Text>}
        </Card>
      </FadeIn>

      {results && (
        <>
          <OneRMResultCard avg={results.avg} estimates={results.estimates} delay={80} />
          <PercentageTableCard avg={results.avg} delay={160} />
          <StrengthStandardsCard oneRM={results.avg} userWeight={userWeight} userGender={userGender} delay={240} />
        </>
      )}

      {!validInput && (
        <FadeIn delay={120}>
          <View style={styles.emptyState}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20, fontWeight: '700', color: colors.primary }}>1RM</Text></View>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md }]}>Введи рабочий вес и количество повторений</Text>
            <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm }]}>Например: 100 кг × 5 повторений</Text>
          </View>
        </FadeIn>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  input: { height: 48, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingTop: spacing.huge },
});
