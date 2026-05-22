import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useThemeColors, useSubscriptionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { aiService } from '../../../services/aiService';
import { Workout } from '../../../types';

interface Props { workout: Workout }

export const AIInsightsCard: React.FC<Props> = ({ workout }) => {
  const colors = useThemeColors();
  const { canSendAiMessage, consumeAiMessage } = useSubscriptionStore();
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [limited, setLimited] = useState(false);

  useEffect(() => {
    if (!canSendAiMessage()) {
      setLimited(true);
      setLoading(false);
      return;
    }
    consumeAiMessage();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    (async () => {
      try {
        const result = await aiService.getWorkoutInsights({
          name: workout.name,
          durationMinutes: workout.durationMinutes || 0,
          totalVolume: workout.totalVolume,
          notes: workout.notes,
          exercises: workout.exercises
            .filter((ex) => ex.exercise?.name)
            .map((ex) => ({
              name: ex.exercise!.name,
              sets: ex.sets.map((s) => ({ weight: s.weight, reps: s.reps, completed: s.completed, rpe: s.rpe })),
            })),
        }, controller.signal);
        setInsights(result);
      } catch {
        setInsights('Отличная тренировка! Продолжай в том же духе.');
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    })();

    return () => { clearTimeout(timeout); controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout.id]);

  if (!loading && !insights && !limited) return null;

  return (
    <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.primary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' }}><Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>IC</Text></View>
        <Text style={[typography.captionMedium, { color: colors.primary }]}>АНАЛИЗ IRON COACH</Text>
      </View>
      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[typography.small, { color: colors.textSecondary }]}>Анализирую тренировку...</Text>
        </View>
      ) : limited ? (
        <Text style={[typography.small, { color: colors.textSecondary, lineHeight: 20 }]}>
          Лимит ИИ-сообщений на сегодня исчерпан. Обнови до Premium чтобы получать анализ каждой тренировки.
        </Text>
      ) : (
        <Text style={[typography.body, { color: colors.text, lineHeight: 22 }]}>{insights}</Text>
      )}
    </Card>
  );
};
