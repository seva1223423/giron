import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Card, FadeIn } from '../../../components';
import { BarChart } from './BarChart';
import { LineChart } from './LineChart';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { useCardioStore } from '../../../store';
import { getMonday } from '../../../utils/date';
import type { CardioSession } from '../../../types';

const TYPE_LABELS: Record<string, string> = {
  running: 'Бег', cycling: 'Велосипед', swimming: 'Плавание', walking: 'Ходьба',
  hiit: 'ВИИТ', elliptical: 'Эллипс', rowing: 'Гребля', other: 'Другое',
};
const TYPE_EMOJI: Record<string, string> = {
  running: '🏃', cycling: '🚴', swimming: '🏊', walking: '🚶',
  hiit: '⚡', elliptical: '🔄', rowing: '🚣', other: '🏋',
};

interface Props { colors: any }

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

export const CardioTab: React.FC<Props> = ({ colors }) => {
  const { sessions } = useCardioStore();

  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const weekSessions = sessions.filter((s) => new Date(s.date) >= weekStart);
    const monthSessions = sessions.filter((s) => new Date(s.date) >= monthStart);

    const totalMin = sessions.reduce((s, c) => s + c.durationMinutes, 0);
    const totalKm = sessions.reduce((s, c) => s + (c.distanceKm || 0), 0);
    const totalCal = sessions.reduce((s, c) => s + (c.caloriesBurned || 0), 0);

    return {
      weekCount: weekSessions.length,
      weekMin: weekSessions.reduce((s, c) => s + c.durationMinutes, 0),
      weekKm: weekSessions.reduce((s, c) => s + (c.distanceKm || 0), 0),
      monthCount: monthSessions.length,
      monthMin: monthSessions.reduce((s, c) => s + c.durationMinutes, 0),
      totalMin, totalKm, totalCal,
    };
  }, [sessions]);

  // Weekly duration chart (last 8 weeks)
  const weeklyDurationChart = useMemo(() => {
    const buckets: { label: string; value: number }[] = [];
    const now = new Date();
    for (let w = 7; w >= 0; w--) {
      const monday = getMonday(now); const start = new Date(monday); start.setDate(monday.getDate() - w * 7); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 7);
      const weekMin = sessions.filter((s) => {
        const d = new Date(s.date);
        return d >= start && d < end;
      }).reduce((s, c) => s + c.durationMinutes, 0);
      buckets.push({
        label: `${start.getDate()}/${start.getMonth() + 1}`,
        value: Math.round(weekMin),
      });
    }
    return buckets;
  }, [sessions]);

  // By type breakdown
  const byType = useMemo(() => {
    const map: Record<string, { count: number; min: number; km: number }> = {};
    sessions.forEach((s) => {
      if (!map[s.type]) map[s.type] = { count: 0, min: 0, km: 0 };
      map[s.type].count++;
      map[s.type].min += s.durationMinutes;
      map[s.type].km += s.distanceKm || 0;
    });
    return Object.entries(map).sort((a, b) => b[1].min - a[1].min);
  }, [sessions]);

  // Last 20 sessions duration trend
  const durationTrend = useMemo(() =>
    [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-20)
      .map((s, i) => ({
        label: new Date(s.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''),
        value: s.durationMinutes,
      })),
  [sessions]);

  if (sessions.length === 0) {
    return (
      <FadeIn delay={0}>
        <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🏃</Text>
          <Text style={[typography.h4, { color: colors.text, marginBottom: 8 }]}>Нет кардио-сессий</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Добавь первую кардио-тренировку во вкладке тренировок
          </Text>
        </Card>
      </FadeIn>
    );
  }

  return (
    <>
      {/* Summary stats */}
      <FadeIn delay={0}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Эта неделя</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {[
              { value: stats.weekCount, label: 'сессий', color: colors.primary },
              { value: formatDuration(stats.weekMin), label: 'времени', color: colors.accent },
              { value: `${stats.weekKm.toFixed(1)}`, label: 'км', color: colors.success },
            ].map(({ value, label, color }, i) => (
              <View key={i} style={{ alignItems: 'center' }}>
                <Text style={[typography.number, { color, fontSize: 22 }]}>{value}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
              </View>
            ))}
          </View>
        </Card>
      </FadeIn>

      {/* Lifetime stats */}
      <FadeIn delay={60}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>За всё время</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {[
              { value: sessions.length, label: 'сессий', color: colors.primary },
              { value: formatDuration(stats.totalMin), label: 'всего', color: colors.accent },
              { value: `${Math.round(stats.totalKm)}`, label: 'км', color: colors.success },
              { value: `${Math.round(stats.totalCal)}`, label: 'ккал', color: colors.warning },
            ].map(({ value, label, color }, i) => (
              <View key={i} style={{ alignItems: 'center' }}>
                <Text style={[typography.number, { color, fontSize: 20 }]}>{value}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
              </View>
            ))}
          </View>
        </Card>
      </FadeIn>

      {/* Weekly duration chart */}
      {weeklyDurationChart.some((b) => b.value > 0) && (
        <FadeIn delay={100}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Время по неделям (мин)</Text>
            <BarChart
              data={weeklyDurationChart}
              color={colors.primary}
              colors={colors}
              height={100}
            />
          </Card>
        </FadeIn>
      )}

      {/* Duration trend */}
      {durationTrend.length >= 3 && (
        <FadeIn delay={140}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Тренд длительности (мин)</Text>
            <LineChart
              data={durationTrend}
              color={colors.accent}
              colors={colors}
              suffix=" мин"
              height={110}
            />
          </Card>
        </FadeIn>
      )}

      {/* By type breakdown */}
      {byType.length > 0 && (
        <FadeIn delay={180}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>По типу активности</Text>
            {byType.map(([type, data], i) => {
              const pct = stats.totalMin > 0 ? (data.min / stats.totalMin) * 100 : 0;
              return (
                <View key={type} style={[
                  { paddingVertical: spacing.sm },
                  i < byType.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                ]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 16 }}>{TYPE_EMOJI[type] || '🏋'}</Text>
                      <Text style={[typography.bodyMedium, { color: colors.text }]} numberOfLines={1}>{TYPE_LABELS[type] || type}</Text>
                      <Text style={[typography.caption, { color: colors.textTertiary }]}>{data.count}×</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[typography.captionMedium, { color: colors.primary }]}>{formatDuration(data.min)}</Text>
                      {data.km > 0 && <Text style={[typography.caption, { color: colors.textTertiary }]}>{data.km.toFixed(1)} км</Text>}
                    </View>
                  </View>
                  {/* Progress bar */}
                  <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.primary, width: `${Math.round(pct)}%` as any }} />
                  </View>
                </View>
              );
            })}
          </Card>
        </FadeIn>
      )}

      {/* Recent sessions */}
      <FadeIn delay={220}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
            Последние сессии
          </Text>
          {[...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15).map((s, i, arr) => (
            <View key={s.id} style={[
              { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: 12 },
              i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
            ]}>
              <Text style={{ fontSize: 20 }}>{TYPE_EMOJI[s.type] || '🏋'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[typography.small, { color: colors.text }]} numberOfLines={1}>{TYPE_LABELS[s.type] || s.type}</Text>
                <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>
                  {new Date(s.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                <Text style={[typography.captionMedium, { color: colors.primary }]}>{formatDuration(s.durationMinutes)}</Text>
                {s.distanceKm ? <Text style={[typography.caption, { color: colors.textTertiary }]}>{s.distanceKm.toFixed(1)} км</Text> : null}
                {s.caloriesBurned ? <Text style={[typography.caption, { color: colors.textTertiary }]}>{s.caloriesBurned} ккал</Text> : null}
              </View>
            </View>
          ))}
        </Card>
      </FadeIn>
    </>
  );
};
