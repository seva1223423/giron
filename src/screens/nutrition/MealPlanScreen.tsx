import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { Card, Button, FadeIn, PaywallModal } from '../../components';
import { useThemeStore, useNutritionStore, useSubscriptionStore } from '../../store';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { aiService } from '../../services';
import { localDateStr } from '../../utils/date';
import type { Meal, NutritionItem } from '../../types';

interface PlanMealItem {
  name: string;
  calories: number;
  protein: number;
  fats: number;
  carbs: number;
  weightGrams: number;
}

interface PlanMeal {
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  name: string;
  items: PlanMealItem[];
  totalCalories: number;
  totalProtein: number;
  totalFats: number;
  totalCarbs: number;
}

interface PlanDay {
  dayName: string;
  dateOffset: number; // 0 = today, 1 = tomorrow, etc.
  meals: PlanMeal[];
  totalCalories: number;
  totalProtein: number;
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getMondayBasedDayIndex() {
  const d = new Date().getDay(); // 0=Sun
  return d === 0 ? 6 : d - 1;
}

function offsetDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localDateStr(d);
}

function parsePlanFromAI(text: string): PlanDay[] | null {
  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\[[\s\S]*\])/);
    const raw = jsonMatch ? jsonMatch[1] : text;
    const parsed = JSON.parse(raw.trim());
    const days: PlanDay[] = Array.isArray(parsed) ? parsed : parsed.days ?? [];
    return days.map((day: any, i: number) => {
      const meals: PlanMeal[] = (day.meals ?? []).map((m: any) => {
        const items: PlanMealItem[] = (m.items ?? []).map((it: any) => ({
          name: String(it.name ?? ''),
          calories: Math.round(Number(it.calories ?? 0)),
          protein: Math.round(Number(it.protein ?? 0) * 10) / 10,
          fats: Math.round(Number(it.fats ?? 0) * 10) / 10,
          carbs: Math.round(Number(it.carbs ?? 0) * 10) / 10,
          weightGrams: Math.round(Number(it.weightGrams ?? 100)),
        }));
        const total = items.reduce(
          (acc, it) => ({ cal: acc.cal + it.calories, p: acc.p + it.protein, f: acc.f + it.fats, c: acc.c + it.carbs }),
          { cal: 0, p: 0, f: 0, c: 0 },
        );
        return {
          type: m.type ?? 'breakfast',
          name: String(m.name ?? m.type ?? 'Приём пищи'),
          items,
          totalCalories: Math.round(total.cal),
          totalProtein: Math.round(total.p * 10) / 10,
          totalFats: Math.round(total.f * 10) / 10,
          totalCarbs: Math.round(total.c * 10) / 10,
        };
      });
      return {
        dayName: day.dayName ?? DAY_NAMES[i % 7],
        dateOffset: i,
        meals,
        totalCalories: meals.reduce((s, m) => s + m.totalCalories, 0),
        totalProtein: meals.reduce((s, m) => s + m.totalProtein, 0),
      };
    });
  } catch {
    return null;
  }
}

export const MealPlanScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { addMeal, getDayLog, defaultTargets } = useNutritionStore();
  const { canSendAiMessage, consumeAiMessage } = useSubscriptionStore();

  const [plan, setPlan] = useState<PlanDay[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);

  const todayIdx = getMondayBasedDayIndex();

  const generate = useCallback(async () => {
    haptic.medium();
    if (!canSendAiMessage()) {
      setShowPaywall(true);
      return;
    }
    consumeAiMessage();
    setLoading(true);
    setPlan(null);
    try {
      const today = localDateStr(new Date());
      const log = getDayLog(today);
      const cal = log.targetCalories || defaultTargets.calories;
      const prot = log.targetProtein || defaultTargets.protein;
      const fat = log.targetFats ?? defaultTargets.fats;
      const carb = log.targetCarbs ?? defaultTargets.carbs;

      const prompt = `Составь план питания на 7 дней (начиная с сегодня — ${DAY_NAMES[todayIdx]}).
Цели в день: ${cal} ккал, ${prot}г белка, ${fat}г жиров, ${carb}г углеводов.
Требования:
- 3-4 приёма пищи в день (завтрак, обед, ужин и по возможности перекус)
- Разнообразные блюда на каждый день, реалистичные ингредиенты
- Каждый приём содержит список ингредиентов с КБЖУ на указанный вес

Верни ТОЛЬКО JSON-массив без пояснений:
[
  {
    "dayName": "Пн",
    "meals": [
      {
        "type": "breakfast",
        "name": "Название блюда",
        "items": [
          {"name": "Ингредиент", "calories": 150, "protein": 10, "fats": 5, "carbs": 20, "weightGrams": 100}
        ]
      }
    ]
  }
]`;

      const result = await aiService.chat(prompt, { calories: cal, protein: prot, fats: fat, carbs: carb, waterTargetMl: 2500 });
      const parsed = parsePlanFromAI(result.message);
      if (!parsed || parsed.length === 0) {
        Alert.alert('Ошибка', 'Не удалось разобрать ответ ИИ. Попробуй ещё раз.');
      } else {
        setPlan(parsed);
        setSelectedDay(0);
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось сгенерировать план. Проверь подключение.');
    } finally {
      setLoading(false);
    }
  }, [getDayLog, defaultTargets, todayIdx, haptic, canSendAiMessage, consumeAiMessage]);

  const addMealToLog = (meal: PlanMeal, dayOffset: number) => {
    haptic.success();
    const date = offsetDate(dayOffset);
    const ts = Date.now();
    const rid = Math.random().toString(36).slice(2, 7);
    const nutritionItems: NutritionItem[] = meal.items.map((it, i) => ({
      id: `plan-${ts}-${rid}-${i}`,
      name: it.name,
      calories: it.calories,
      protein: it.protein,
      fats: it.fats,
      carbs: it.carbs,
      weightGrams: it.weightGrams,
    }));
    const newMeal: Meal = {
      id: `meal-plan-${ts}-${rid}`,
      type: meal.type,
      items: nutritionItems,
      totalCalories: meal.totalCalories,
      totalProtein: meal.totalProtein,
      totalFats: meal.totalFats,
      totalCarbs: meal.totalCarbs,
      createdAt: new Date().toISOString(),
    };
    addMeal(date, newMeal);
    const dayLabel = dayOffset === 0 ? 'сегодня' : dayOffset === 1 ? 'завтра' : date;
    Alert.alert('Добавлено', `«${meal.name}» добавлен в журнал на ${dayLabel}.`);
  };

  const addAllMeals = (day: PlanDay) => {
    haptic.medium();
    Alert.alert(
      'Добавить весь день?',
      `Добавить все ${day.meals.length} приёма пищи из ${day.dayName} в журнал?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Добавить',
          onPress: () => {
            day.meals.forEach((meal) => addMealToLog(meal, day.dateOffset));
          },
        },
      ],
    );
  };

  const currentDay = plan?.[selectedDay];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.content, { paddingTop: safeTop }]} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <FadeIn delay={0} from="top">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[typography.h3, { color: colors.primary }]}>{'‹'} </Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[typography.h2, { color: colors.text }]}>План питания</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>ИИ составит рацион на неделю</Text>
          </View>
        </View>
      </FadeIn>

      {/* Generate button */}
      <FadeIn delay={80}>
        <Button
          title={plan ? 'Пересоставить план' : 'Составить план на неделю'}
          onPress={generate}
          fullWidth
          size="lg"
          loading={loading}
          style={{ marginBottom: spacing.xl }}
        />
      </FadeIn>

      {loading && (
        <FadeIn delay={0}>
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
              ИИ составляет рацион...
            </Text>
          </View>
        </FadeIn>
      )}

      {plan && !loading && (
        <FadeIn delay={0}>
          {/* Day selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {plan.map((day, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => { haptic.selection(); setSelectedDay(i); }}
                  style={{
                    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
                    borderRadius: borderRadius.md,
                    borderWidth: 1,
                    backgroundColor: selectedDay === i ? colors.primary : colors.surface,
                    borderColor: selectedDay === i ? colors.primary : colors.border,
                  }}
                >
                  <Text style={[typography.captionMedium, { color: selectedDay === i ? '#fff' : colors.text }]}>
                    {day.dayName}
                  </Text>
                  <Text style={{ fontSize: 10, color: selectedDay === i ? 'rgba(255,255,255,0.7)' : colors.textTertiary, textAlign: 'center' }}>
                    {day.totalCalories} ккал
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Day summary */}
          {currentDay && (
            <>
              <Card style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <Text style={[typography.h4, { color: colors.text }]}>{currentDay.dayName}</Text>
                  <TouchableOpacity
                    onPress={() => addAllMeals(currentDay)}
                    style={{ backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40', borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
                  >
                    <Text style={[typography.captionMedium, { color: colors.primary }]}>+ Весь день</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  {[
                    { label: 'Ккал', value: currentDay.totalCalories, color: colors.calories },
                    { label: 'Белки', value: `${currentDay.totalProtein}г`, color: colors.protein },
                    { label: 'Блюд', value: currentDay.meals.length, color: colors.accent },
                  ].map(({ label, value, color }) => (
                    <View key={label} style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 20, fontWeight: '800', color }}>{value}</Text>
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              {/* Meals */}
              {currentDay.meals.map((meal, mi) => (
                <Card key={mi} style={{ marginBottom: spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                    <View>
                      <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: 2 }]}>
                        {MEAL_TYPE_LABELS[meal.type] ?? meal.type}
                      </Text>
                      <Text style={[typography.bodySemibold, { color: colors.text }]}>{meal.name}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => addMealToLog(meal, currentDay.dateOffset)}
                      style={{ backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40', borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
                    >
                      <Text style={[typography.captionMedium, { color: colors.primary }]}>+ Добавить</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Macros row */}
                  <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm }}>
                    {[
                      { label: 'ккал', val: meal.totalCalories, c: colors.calories },
                      { label: 'б', val: `${meal.totalProtein}г`, c: colors.protein },
                      { label: 'ж', val: `${meal.totalFats}г`, c: colors.fats },
                      { label: 'у', val: `${meal.totalCarbs}г`, c: colors.carbs },
                    ].map(({ label, val, c }) => (
                      <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: c }}>{val}</Text>
                        <Text style={{ fontSize: 10, color: colors.textTertiary }}>{label}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Ingredients */}
                  {meal.items.map((it, ii) => (
                    <View key={ii} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderTopWidth: ii === 0 ? 1 : 0, borderTopColor: colors.divider }}>
                      <Text style={[typography.small, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                        {it.name}
                      </Text>
                      <Text style={[typography.small, { color: colors.textSecondary }]}>
                        {it.weightGrams}г · {it.calories} ккал
                      </Text>
                    </View>
                  ))}
                </Card>
              ))}
            </>
          )}
        </FadeIn>
      )}

      {!plan && !loading && (
        <FadeIn delay={160}>
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl * 2 }}>
            <Text style={{ fontSize: 48 }}>🥗</Text>
            <Text style={[typography.h4, { color: colors.text, marginTop: spacing.lg, textAlign: 'center' }]}>
              Персональный план питания
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', lineHeight: 22 }]}>
              ИИ составит рацион на 7 дней под твои цели по КБЖУ. Можно добавить любой приём пищи в журнал одним нажатием.
            </Text>
          </View>
        </FadeIn>
      )}

      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} reason="ai_limit" />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg, gap: spacing.sm },
});
