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
    const exerciseCount = workout.exercises.length;
    const volumeTons = ((workout.totalVolume || 0) / 1000).toFixed(1);

    return (
      <View style={styles.wrapper}>
        <View ref={ref} style={styles.card} collapsable={false}>
          {/* Background glows */}
          <View style={StyleSheet.absoluteFillObject}>
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0F0F1A' }]} />
            <View style={styles.glow} />
            <View style={styles.glow2} />
          </View>

          {/* Header: branding + date */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>IG</Text>
              <Text style={styles.brand}>IRON GYM</Text>
            </View>
            <Text style={styles.date}>{dateStr}</Text>
          </View>

          {/* Workout name */}
          <Text style={styles.title}>{workout.name}</Text>

          {/* PR badges */}
          {newPRs.length > 0 && (
            <View style={styles.prSection}>
              {newPRs.map((pr, i) => (
                <View key={i} style={styles.prBadge}>
                  <Text style={styles.prText}>
                    PR {pr.name} — {pr.weight}кг × {pr.reps}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Stats grid: 2x2 */}
          <View style={styles.statsGrid}>
            <View style={styles.statsRow}>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{workout.durationMinutes || 0}</Text>
                <Text style={styles.statLabel}>МИНУТ</Text>
              </View>
              <View style={styles.statCellDivider} />
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: '#4FC3F7' }]}>{volumeTons}т</Text>
                <Text style={styles.statLabel}>ОБЪЁМ</Text>
              </View>
            </View>
            <View style={styles.statsRowDivider} />
            <View style={styles.statsRow}>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{totalSets}</Text>
                <Text style={styles.statLabel}>ПОДХОДОВ</Text>
              </View>
              <View style={styles.statCellDivider} />
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{exerciseCount}</Text>
                <Text style={styles.statLabel}>УПРАЖНЕНИЙ</Text>
              </View>
            </View>
          </View>

          {/* Exercises list (top 5) */}
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
                    {isExPR && <Text style={{ fontSize: 9, fontWeight: '700', color: '#8B5CF6' }}>PR</Text>}
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
            <Text style={styles.footerText}>Тренируйся с Iron Gym</Text>
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
    backgroundColor: '#0F0F1A',
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
    backgroundColor: '#FF6B35',
    opacity: 0.15,
  },
  glow2: {
    position: 'absolute',
    bottom: -80,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#1565C0',
    opacity: 0.12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },
  brand: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#FF6B35',
  },
  date: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  prSection: {
    marginBottom: 20,
    gap: 6,
  },
  prBadge: {
    backgroundColor: '#FFD70018',
    borderWidth: 1,
    borderColor: '#FFD70050',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  prText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFD700',
    letterSpacing: 0.5,
  },
  statsGrid: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  statsRow: {
    flexDirection: 'row',
  },
  statsRowDivider: {
    height: 1,
    backgroundColor: '#2A2A3E',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
  },
  statCellDivider: {
    width: 1,
    backgroundColor: '#2A2A3E',
    marginVertical: 10,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 1,
    marginTop: 3,
  },
  exercises: {
    marginBottom: 20,
  },
  exRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  exName: {
    flex: 1,
    fontSize: 13,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  exSet: {
    fontSize: 13,
    color: '#FF6B35',
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
    borderTopColor: '#1E1E2E',
    paddingTop: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  footerText: {
    fontSize: 13,
    color: '#FF6B35',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
