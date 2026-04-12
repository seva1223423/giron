import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { aiService } from '../../../services';
import { useNutritionStore, useCardioStore } from '../../../store';
import { useSleepStore } from '../../../store/useSleepStore';
import { useHaptic } from '../../../hooks/useHaptic';
import type { Workout } from '../../../types';

interface Props {
  colors: any;
  workoutHistory: Workout[];
}

export const WeeklyInsightsCard: React.FC<Props> = ({ colors, workoutHistory }) => {
  const haptic = useHaptic();
  const { getDayLog, defaultTargets } = useNutritionStore();
  const { getWeekSessions } = useCardioStore();
  const { getLastEntries } = useSleepStore();

  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const generate = async () => {
    haptic.medium();
    setLoading(true);
    setError(false);

    try {
      const sevenDaysAgo = Date.now() - 7 * 86400000;
      const weekWorkouts = workoutHistory.filter(
        (w) => w.completedAt && new Date(w.completedAt).getTime() > sevenDaysAgo,
      );
      const weekVol = Math.round(weekWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0));
      const avgDur = weekWorkouts.length > 0
        ? Math.round(weekWorkouts.reduce((s, w) => s + (w.durationMinutes || 0), 0) / weekWorkouts.length)
        : 0;

      const cardio = getWeekSessions();
      const sleep = getLastEntries(7);
      const avgSleep = sleep.length > 0 ? (sleep.reduce((s, e) => s + e.durationHours, 0) / sleep.length).toFixed(1) : null;

      const today = new Date().toISOString().split('T')[0];
      const todayLog = getDayLog(today);
      const protTarget = todayLog.targetProtein || defaultTargets.protein;

      const prompt = [
        `Дай краткий тренерский анализ моей недели (2-3 абзаца, по делу):`,
        `- Силовых тренировок: ${weekWorkouts.length}, объём ${weekVol} кг, средняя ${avgDur} мин`,
        cardio.length > 0 ? `- Кардио: ${cardio.length} сессий, ${cardio.reduce((s, c) => s + c.durationMinutes, 0)} мин` : `- Кардио: нет`,
        avgSleep ? `- Средний сон: ${avgSleep}ч/ночь` : '',
        `- Цель по белку: ${protTarget}г/день`,
        weekWorkouts.length > 0 ? `- Лучшая тренировка: ${weekWorkouts.sort((a, b) => (b.totalVolume || 0) - (a.totalVolume || 0))[0].name}` : '',
        `Скажи что хорошо, что улучшить, и дай 1-2 конкретных совета на следующую неделю.`,
      ].filter(Boolean).join('\n');

      const result = await aiService.chat(prompt);
      setInsight(result.message);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <FadeIn delay={550}>
      <Card style={{ marginTop: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: insight ? spacing.md : 0 }}>
          <View>
            <Text style={[typography.h4, { color: colors.text }]}>Анализ недели</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>ИИ-тренер на основе твоих данных</Text>
          </View>
          {!loading && (
            <TouchableOpacity
              onPress={generate}
              style={{ backgroundColor: colors.primary + '15', borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
            >
              <Text style={[typography.captionMedium, { color: colors.primary }]}>
                {insight ? 'Обновить' : 'Получить'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {loading && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[typography.small, { color: colors.textSecondary }]}>Анализирую твою неделю...</Text>
          </View>
        )}

        {error && !loading && (
          <Text style={[typography.small, { color: colors.error, paddingTop: spacing.sm }]}>
            Не удалось получить анализ. Проверь подключение.
          </Text>
        )}

        {insight && !loading && (
          <Text style={[typography.body, { color: colors.text, lineHeight: 22 }]}>{insight}</Text>
        )}

        {!insight && !loading && !error && (
          <Text style={[typography.small, { color: colors.textTertiary, paddingTop: spacing.xs }]}>
            Нажми «Получить» чтобы ИИ проанализировал твою неделю
          </Text>
        )}
      </Card>
    </FadeIn>
  );
};
