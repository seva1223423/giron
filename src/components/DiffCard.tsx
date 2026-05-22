/**
 * DiffCard — "before → after" card for value changes.
 *
 * Direction A spec (chat2.md): "DiffCard «было → стало» для изменений
 * значений." Shown in AI chat when a command mutates something — e.g.
 * `сделай тяжелее` produces:
 *
 *   ┌────────────────────────────────────┐
 *   │  Вес подхода                       │
 *   │  [ 80 кг ] → [ 85 кг ]   +5 кг ↑   │
 *   └────────────────────────────────────┘
 *
 * Pure presentation. Caller decides what label / values / unit to pass.
 *
 * Direction:
 *   - delta > 0 → "↑" arrow + success tint on the new pill
 *   - delta < 0 → "↓" arrow + danger tint on the new pill
 *   - delta === 0 → no arrow, no delta line (the change is just a swap,
 *     e.g. exercise rename)
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeStore, useThemeColors } from '../store/useThemeStore';
import { Pill, type PillVariant } from './Pill';

interface DiffCardProps {
  label: string;
  before: string | number;
  after: string | number;
  /**
   * Optional. When omitted, no arrow / delta line shown — used for
   * non-numeric changes (e.g. swapping exercise name). When numeric,
   * sign drives the up/down arrow + colour.
   */
  delta?: number;
  unit?: string;
}

export const DiffCard: React.FC<DiffCardProps> = ({ label, before, after, delta, unit = '' }) => {
  const colors = useThemeColors();
  const dir = direction(delta);
  const afterVariant: PillVariant =
    dir === 'up' ? 'success' : dir === 'down' ? 'danger' : 'default';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.row}>
        <Pill text={`${before}${unit ? ' ' + unit : ''}`} variant="muted" />
        <Text style={[styles.arrow, { color: colors.textTertiary }]}>→</Text>
        <Pill text={`${after}${unit ? ' ' + unit : ''}`} variant={afterVariant} />
        {dir !== 'none' && delta != null && (
          <Text
            style={[
              styles.delta,
              { color: dir === 'up' ? colors.success : colors.error },
            ]}
          >
            {dir === 'up' ? '+' : ''}
            {delta}
            {unit ? ' ' + unit : ''} {dir === 'up' ? '↑' : '↓'}
          </Text>
        )}
      </View>
    </View>
  );
};

function direction(delta: number | undefined): 'up' | 'down' | 'none' {
  if (delta == null || delta === 0) return 'none';
  return delta > 0 ? 'up' : 'down';
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  arrow: {
    fontSize: 14,
    fontWeight: '700',
  },
  delta: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 'auto',
  },
});
