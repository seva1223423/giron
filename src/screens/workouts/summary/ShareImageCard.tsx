import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Workout } from '../../../types';

interface Props {
  workout: Workout;
  totalSets: number;
  totalReps: number;
  newPRs: { name: string; weight: number; reps: number; est1rm: number }[];
  dateStr: string;
}

export const ShareImageCard = React.forwardRef<View, Props>(
  ({ workout, totalSets, totalReps, newPRs, dateStr }, ref) => {
    return (
      <View style={styles.wrapper}>
        <View ref={ref} style={styles.card} collapsable={false}>
          {/* Background */}
          <View style={StyleSheet.absoluteFillObject}>
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0D0D0D' }]} />
            <View style={styles.glow} />
            <View style={styles.glow2} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 14 }}>🏋️</Text>
              <Text style={styles.brand}>IRON GYM</Text>
            </View>
            <Text style={styles.date}>{dateStr}</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>{workout.name}</Text>

          {/* PR badge */}
          {newPRs.length > 0 && (
            <View style={styles.prBadge}>
              <Text style={styles.prText}>
                🏆 {newPRs.length === 1 ? `ЛИЧНЫЙ РЕКОРД • ${newPRs[0].name}` : `${newPRs.length} ЛИЧНЫХ РЕКОРДА`}
              </Text>
            </View>
          )}

          {/* Stats row */}
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{workout.durationMinutes || 0}</Text>
              <Text style={styles.statLabel}>МИН</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalSets}</Text>
              <Text style={styles.statLabel}>ПОДХ.</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalReps}</Text>
              <Text style={styles.statLabel}>ПОВТ.</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: '#4FC3F7' }]}>
                {((workout.totalVolume || 0) / 1000).toFixed(1)}т
              </Text>
              <Text style={styles.statLabel}>ОБЪЁМ</Text>
            </View>
          </View>

          {/* Exercises (top 5) */}
          <View style={styles.exercises}>
            {workout.exercises.slice(0, 5).map((ex, i) => {
              const completedSets = ex.sets.filter((s) => s.completed);
              const topSet = completedSets.reduce<{ weight: number; reps: number } | null>((best, s) => {
                const v = (s.weight || 0) * (s.reps || 0);
                return !best || v > best.weight * best.reps ? { weight: s.weight || 0, reps: s.reps || 0 } : best;
              }, null);
              const isExPR = newPRs.some((pr) => pr.name === ex.exercise.name);
              return (
                <View key={i} style={styles.exRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 5 }}>
                    {isExPR && <Text style={{ fontSize: 10 }}>🏆</Text>}
                    <Text style={[styles.exName, isExPR && { color: '#FFD700' }]} numberOfLines={1}>
                      {ex.exercise.name}
                    </Text>
                  </View>
                  {topSet && topSet.weight > 0 ? (
                    <Text style={styles.exSet}>{topSet.weight}кг × {topSet.reps}</Text>
                  ) : topSet ? (
                    <Text style={styles.exSet}>{completedSets.length} подх.</Text>
                  ) : null}
                </View>
              );
            })}
            {workout.exercises.length > 5 && (
              <Text style={styles.exMore}>+{workout.exercises.length - 5} ещё</Text>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 9, color: '#333' }}>●</Text>
              <Text style={styles.footerText}>СДЕЛАНО В IRON GYM</Text>
              <Text style={{ fontSize: 9, color: '#333' }}>●</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: -9999,
    top: 0,
  },
  card: {
    width: 360,
    backgroundColor: '#0D0D0D',
    borderRadius: 24,
    padding: 28,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#E53935',
    opacity: 0.18,
  },
  glow2: {
    position: 'absolute',
    bottom: -80,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#1565C0',
    opacity: 0.14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  brand: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#E53935',
  },
  date: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  prBadge: {
    backgroundColor: '#FFD70022',
    borderWidth: 1,
    borderColor: '#FFD70060',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  prText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFD700',
    letterSpacing: 1,
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#2A2A2A',
  },
  exercises: {
    marginBottom: 20,
  },
  exRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  exName: {
    flex: 1,
    fontSize: 13,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  exSet: {
    fontSize: 13,
    color: '#E53935',
    fontWeight: '700',
    marginLeft: 8,
  },
  exMore: {
    fontSize: 11,
    color: '#555',
    marginTop: 6,
    fontStyle: 'italic',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    paddingTop: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  footerText: {
    fontSize: 10,
    color: '#444',
    fontWeight: '700',
    letterSpacing: 2,
  },
});
