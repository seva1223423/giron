import React, { useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useCardioStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { CardioSession, CardioType } from '../../types';

const TYPE_META: Record<CardioType, { emoji: string; label: string }> = {
  running:    { emoji: '🏃', label: 'Бег' },
  cycling:    { emoji: '🚴', label: 'Велосипед' },
  walking:    { emoji: '🚶', label: 'Ходьба' },
  swimming:   { emoji: '🏊', label: 'Плавание' },
  hiit:       { emoji: '⚡', label: 'HIIT' },
  elliptical: { emoji: '🔄', label: 'Эллипс' },
  rowing:     { emoji: '🚣', label: 'Гребля' },
  other:      { emoji: '🏅', label: 'Другое' },
};

function formatDuration(min: number) {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

function formatDate(dateStr: string) {
  const today = new Date().toISOString().split('T')[0];
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().split('T')[0];
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterday) return 'Вчера';
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

const SessionCard: React.FC<{ session: CardioSession; onDelete: () => void }> = ({ session, onDelete }) => {
  const { colors } = useThemeStore();
  const meta = TYPE_META[session.type];

  return (
    <View style={[styles.sessionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sessionRow}>
        <Text style={{ fontSize: 28 }}>{meta.emoji}</Text>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.bodySemibold, { color: colors.text }]}>{meta.label}</Text>
          <Text style={[typography.small, { color: colors.textSecondary }]}>
            {formatDuration(session.durationMinutes)}
            {session.distanceKm ? ` · ${session.distanceKm} км` : ''}
            {session.caloriesBurned ? ` · ${session.caloriesBurned} ккал` : ''}
            {session.avgHeartRate ? ` · ${session.avgHeartRate} уд/мин` : ''}
          </Text>
          {session.notes ? (
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
              {session.notes}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[typography.caption, { color: colors.error }]}>Удалить</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const CardioScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { sessions, removeSession, getWeekSessions, syncFromServer } = useCardioStore();

  useEffect(() => { syncFromServer(); }, []);

  const weekSessions = getWeekSessions();

  const weekStats = useMemo(() => ({
    totalMinutes: weekSessions.reduce((s, w) => s + w.durationMinutes, 0),
    totalKm: weekSessions.reduce((s, w) => s + (w.distanceKm ?? 0), 0),
    totalCal: weekSessions.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0),
    count: weekSessions.length,
  }), [weekSessions]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, CardioSession[]>();
    sessions.forEach((s) => {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [sessions]);

  const handleDelete = (id: string) => {
    Alert.alert('Удалить сессию?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => { haptic.light(); removeSession(id); } },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[typography.h2, { color: colors.text, flex: 1, marginLeft: spacing.md }]}>Кардио</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('AddCardio')}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '700', lineHeight: 22 }}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Weekly stats */}
        <FadeIn delay={0}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>📅 За 7 дней</Text>
            <View style={styles.statsRow}>
              {[
                { label: 'Сессий', value: weekStats.count.toString(), color: colors.primary },
                { label: 'Минут', value: weekStats.totalMinutes.toString(), color: colors.success },
                ...(weekStats.totalKm > 0 ? [{ label: 'Км', value: weekStats.totalKm.toFixed(1), color: colors.accent }] : []),
                ...(weekStats.totalCal > 0 ? [{ label: 'Ккал', value: weekStats.totalCal.toString(), color: colors.warning }] : []),
              ].map(({ label, value, color }) => (
                <View key={label} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={[typography.h3, { color }]}>{value}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
                </View>
              ))}
            </View>
          </Card>
        </FadeIn>

        {/* Sessions list */}
        {grouped.length === 0 ? (
          <FadeIn delay={100}>
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 56 }}>🏃</Text>
              <Text style={[typography.h4, { color: colors.text, marginTop: spacing.lg }]}>Нет записей</Text>
              <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
                Запиши первую кардио-сессию
              </Text>
              <Button
                title="+ Добавить кардио"
                onPress={() => navigation.navigate('AddCardio')}
                style={{ marginTop: spacing.xl }}
              />
            </View>
          </FadeIn>
        ) : (
          grouped.map(([date, daySessions], i) => (
            <FadeIn key={date} delay={i * 50}>
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>
                {formatDate(date).toUpperCase()}
              </Text>
              {daySessions.map((s) => (
                <SessionCard key={s.id} session={s} onDelete={() => handleDelete(s.id)} />
              ))}
            </FadeIn>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md, borderBottomWidth: 1 },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  sessionCard: { borderRadius: borderRadius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  sessionRow: { flexDirection: 'row', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: spacing.huge },
});
