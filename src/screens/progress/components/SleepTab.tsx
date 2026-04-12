import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Card, FadeIn } from '../../../components';
import { LineChart } from './LineChart';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { useSleepStore } from '../../../store/useSleepStore';

const QUALITY_LABELS: Record<number, string> = { 1: 'Ужасно', 2: 'Плохо', 3: 'Нормально', 4: 'Хорошо', 5: 'Отлично' };
const QUALITY_COLORS = ['#FF3B30', '#FF9F0A', '#FFD60A', '#34C759', '#30D158'];

interface Props { colors: any }

export const SleepTab: React.FC<Props> = ({ colors }) => {
  const { entries, getAverageDuration, getAverageQuality } = useSleepStore();

  const sorted = useMemo(() =>
    [...entries].sort((a, b) => b.date.localeCompare(a.date)),
  [entries]);

  const avgDuration7 = getAverageDuration(7);
  const avgQuality7 = getAverageQuality(7);
  const avgDuration30 = getAverageDuration(30);
  const avgQuality30 = getAverageQuality(30);

  const durationChart = useMemo(() =>
    [...sorted].reverse().slice(-30).map((e) => ({
      label: new Date(e.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''),
      value: e.durationHours,
    })),
  [sorted]);

  const qualityChart = useMemo(() =>
    [...sorted].reverse().slice(-30).filter((e) => e.quality != null).map((e) => ({
      label: new Date(e.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''),
      value: e.quality as number,
    })),
  [sorted]);

  const qualityColor = avgQuality7 === 0 ? colors.primary
    : QUALITY_COLORS[Math.min(Math.round(avgQuality7) - 1, 4)];

  if (sorted.length === 0) {
    return (
      <FadeIn delay={0}>
        <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🌙</Text>
          <Text style={[typography.h4, { color: colors.text, marginBottom: 8 }]}>Нет данных о сне</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Добавь запись о сне на экране прогресса
          </Text>
        </Card>
      </FadeIn>
    );
  }

  return (
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
              <View key={i} style={{ alignItems: 'center' }}>
                <Text style={[typography.number, { color, fontSize: 22 }]}>{value}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Sleep duration vs optimal */}
          <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Сон (рекомендовано 7–9ч)</Text>
              <Text style={[typography.captionMedium, { color: avgDuration7 >= 7 ? colors.success : colors.warning }]}>
                {avgDuration7 >= 7 ? 'Норма' : 'Недостаточно'}
              </Text>
            </View>
            <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
              <View style={{
                height: 6,
                borderRadius: 3,
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
            <LineChart
              data={durationChart}
              color={colors.primary}
              colors={colors}
              suffix="ч"
              height={110}
            />
          </Card>
        </FadeIn>
      )}

      {/* Quality trend chart */}
      {qualityChart.length >= 3 && (
        <FadeIn delay={140}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Качество сна (1–5)</Text>
            <LineChart
              data={qualityChart}
              color={qualityColor}
              colors={colors}
              suffix=""
              height={110}
            />
          </Card>
        </FadeIn>
      )}

      {/* History list */}
      <FadeIn delay={180}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>История сна</Text>
          {sorted.slice(0, 20).map((entry, i, arr) => {
            const qualityIdx = entry.quality ? entry.quality - 1 : -1;
            const qualityColor = qualityIdx >= 0 ? QUALITY_COLORS[qualityIdx] : colors.textTertiary;
            return (
              <View key={entry.date} style={[
                { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: 12 },
                i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
              ]}>
                <Text style={{ fontSize: 20 }}>🌙</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.small, { color: colors.text }]}>
                    {new Date(entry.date).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>
                    {entry.bedtime} → {entry.wakeTime}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[typography.captionMedium, { color: colors.primary }]}>
                    {entry.durationHours.toFixed(1)}ч
                  </Text>
                  {entry.quality != null && (
                    <Text style={[typography.caption, { color: qualityColor }]}>
                      {QUALITY_LABELS[entry.quality]}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </Card>
      </FadeIn>
    </>
  );
};
