import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore, useCardioStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { CardioType } from '../../../types';
import { formatNum } from '../../../utils/date';

const TYPE_LABEL: Record<CardioType, string> = {
  running: 'Б', cycling: 'В', walking: 'Х', swimming: 'П',
  hiit: 'HI', elliptical: 'Э', rowing: 'Г', other: '...',
};

interface Props {
  navigation: any;
}

export const CardioWeekCard: React.FC<Props> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { getWeekSessions } = useCardioStore();
  const weekSessions = getWeekSessions();

  const stats = useMemo(() => ({
    count: weekSessions.length,
    totalMinutes: weekSessions.reduce((s, w) => s + w.durationMinutes, 0),
    totalKm: weekSessions.reduce((s, w) => s + (w.distanceKm ?? 0), 0),
    totalCal: weekSessions.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0),
  }), [weekSessions]);

  // Last 3 unique types this week
  const recentTypes = [...new Set(weekSessions.map((s) => s.type))].slice(0, 3);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <TouchableOpacity
        onPress={() => navigation.navigate('WorkoutsTab', { screen: 'Cardio' })}
        activeOpacity={0.7}
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={[typography.h4, { color: colors.text }]}>Кардио</Text>
              {recentTypes.length > 0 && (
                <View style={styles.badges}>
                  {recentTypes.map((t) => (
                    <View key={t} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>{TYPE_LABEL[t]}</Text></View>
                  ))}
                </View>
              )}
            </View>

            {stats.count === 0 ? (
              <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.xs }]}>
                На этой неделе кардио не записано
              </Text>
            ) : (
              <View style={styles.statsRow}>
                <Stat label="Сессий" value={stats.count.toString()} color={colors.primary} />
                <Stat label="Минут" value={stats.totalMinutes.toString()} color={colors.success} />
                {stats.totalKm > 0 && <Stat label="Км" value={formatNum(stats.totalKm)} color={colors.accent} />}
                {stats.totalCal > 0 && <Stat label="Ккал" value={stats.totalCal.toString()} color={colors.warning} />}
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('WorkoutsTab', { screen: 'AddCardio' })}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '700', lineHeight: 22 }}>+</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Card>
  );
};

const Stat: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => {
  const { colors } = useThemeStore();
  return (
    <View style={{ alignItems: 'center', marginRight: spacing.lg }}>
      <Text style={[typography.bodySemibold, { color }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
  badges: { flexDirection: 'row', gap: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.md },
});
