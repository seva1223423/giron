import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { Gender } from '../../../types';

interface Props {
  gender: Gender | null;
  onSelect: (gender: Gender) => void;
}

export const GenderStep: React.FC<Props> = ({ gender, onSelect }) => {
  const { colors } = useThemeStore();
  return (
    <View style={styles.container}>
      {/* Meta eyebrow + big hero display + italic gold accent, pixel
          copy of A_Onboarding's welcome screen. The word "интеллект" is
          styled as gold italic to match the design's typographic pop. */}
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 2,
          color: colors.primary,
          fontWeight: '500',
          textTransform: 'uppercase',
          marginBottom: spacing.md,
        }}
      >
        01 · Добро пожаловать
      </Text>
      <Text
        style={[
          typography.h1,
          { color: colors.text, fontSize: 40, lineHeight: 42, marginBottom: spacing.md },
        ]}
      >
        Спортзал,{'\n'}которым управляет{' '}
        <Text style={{ color: colors.primary, fontStyle: 'italic', fontWeight: '500' }}>
          интеллект
        </Text>
        .
      </Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl, lineHeight: 22 }]}>
        Персональный ИИ-тренер, умное расписание, точный трекинг. Без лишнего — только то, что ведёт к результату.
      </Text>

      {/* AI preview card — design callout that sets expectations about
          the AI-first nature of the app from the very first screen. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 18,
          borderRadius: 24,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: spacing.xxl,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="spark" size={22} color={colors.textInverse} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
            ИИ-тренер уже готов
          </Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
            Составит программу за 30 секунд
          </Text>
        </View>
        <Icon name="arrow" size={18} color={colors.primary} strokeWidth={2.2} />
      </View>

      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 13,
          fontWeight: '500',
          marginBottom: spacing.md,
        }}
      >
        Укажи свой пол, чтобы начать:
      </Text>
      <View style={styles.optionRow}>
        {(['male', 'female'] as Gender[]).map((g) => (
          <TouchableOpacity
            key={g}
            activeOpacity={0.7}
            onPress={() => onSelect(g)}
            accessibilityLabel={g === 'male' ? 'Мужской пол' : 'Женский пол'}
            accessibilityRole="button"
            accessibilityState={{ selected: gender === g }}
            style={[
              styles.card,
              {
                backgroundColor: gender === g ? colors.primary : colors.surface,
                borderColor: gender === g ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 28,
                fontWeight: '600',
                color: gender === g ? colors.textInverse : colors.primary,
              }}
            >
              {g === 'male' ? 'М' : 'Ж'}
            </Text>
            <Text
              style={[
                typography.bodySemibold,
                {
                  color: gender === g ? colors.textInverse : colors.text,
                  marginTop: spacing.md,
                },
              ]}
            >
              {g === 'male' ? 'Мужской' : 'Женский'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl },
  optionRow: { flexDirection: 'row', gap: spacing.lg },
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl, borderRadius: borderRadius.xl, borderWidth: 2 },
});
