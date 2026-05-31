import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import type { ChatWidget } from '../chatWidgets';

/**
 * Renders an inline chat widget under an assistant bubble (design ai-chat-pro
 * block 2). One small surface card per widget kind, on-brand Direction A:
 *   - water   → cup-fill progress + total
 *   - macro   → protein progress bar to target
 *   - diff    → before → after pill (e.g. weight change)
 *   - summary → 3 mini progress columns (water / protein / sets done)
 *
 * Colour rules mirror ContextStrip: sage (success) once a target is met,
 * gold (primary) otherwise. No banned-palette literals.
 */
export const ChatWidgetView: React.FC<{ widget: ChatWidget }> = ({ widget }) => {
  const colors = useThemeColors();

  if (widget.kind === 'water') {
    const pct = widget.target > 0 ? Math.min(1, widget.got / widget.target) : 0;
    const done = widget.got >= widget.target;
    return (
      <Card>
        <Row>
          <Icon name="water" size={14} color={colors.primary} />
          <Label>Вода</Label>
          <Value color={done ? colors.success : colors.primary}>
            {(widget.got / 1000).toFixed(2)} / {(widget.target / 1000).toFixed(1)} л
          </Value>
        </Row>
        <Bar pct={pct} color={done ? colors.success : colors.primary} />
      </Card>
    );
  }

  if (widget.kind === 'macro') {
    const pct = widget.target > 0 ? Math.min(1, widget.protein / widget.target) : 0;
    const done = widget.protein >= widget.target * 0.875;
    return (
      <Card>
        <Row>
          <Icon name="apple" size={14} color={colors.primary} />
          <Label>Белок</Label>
          <Value color={done ? colors.success : colors.primary}>
            {widget.protein} / {widget.target} г
          </Value>
        </Row>
        <Bar pct={pct} color={done ? colors.success : colors.primary} />
      </Card>
    );
  }

  if (widget.kind === 'diff') {
    return (
      <Card accent>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Label>{widget.title}</Label>
            <Text style={[styles.diffSub, { color: colors.textSecondary }]}>{widget.label}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.diffBefore, { color: colors.textTertiary }]}>
              {widget.before}{widget.unit}
            </Text>
            <Icon name="arrow" size={12} color={colors.primary} />
            <Text style={[styles.diffAfter, { color: colors.primary }]}>
              {widget.after}{widget.unit}
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  // summary — 3 mini columns
  const cols = [
    { label: 'Вода', value: `${(widget.water.got / 1000).toFixed(2)} л`, pct: widget.water.target > 0 ? widget.water.got / widget.water.target : 0, color: colors.primary },
    { label: 'Белок', value: `${widget.protein.got} г`, pct: widget.protein.target > 0 ? widget.protein.got / widget.protein.target : 0, color: widget.protein.got >= widget.protein.target * 0.875 ? colors.success : colors.primary },
    { label: 'Подходы', value: String(widget.setsDone), pct: widget.setsDone > 0 ? 1 : 0, color: colors.success },
  ];
  return (
    <Card>
      <View style={styles.summaryRow}>
        {cols.map((c) => (
          <View key={c.label} style={{ flex: 1 }}>
            <Label>{c.label}</Label>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{c.value}</Text>
            <Bar pct={Math.min(1, c.pct)} color={c.color} />
          </View>
        ))}
      </View>
    </Card>
  );
};

// ── small building blocks ───────────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; accent?: boolean }> = ({ children, accent }) => {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: accent ? colors.primary + '66' : colors.border },
      ]}
    >
      {children}
    </View>
  );
};

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.row}>{children}</View>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const colors = useThemeColors();
  return <Text style={[styles.label, { color: colors.textSecondary }]}>{children}</Text>;
};

const Value: React.FC<{ children: React.ReactNode; color: string }> = ({ children, color }) => (
  <Text style={[styles.value, { color }]}>{children}</Text>
);

const Bar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => {
  const colors = useThemeColors();
  return (
    <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
      <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 6,
    maxWidth: '82%',
    alignSelf: 'flex-start',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  label: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  value: { fontSize: 13, fontWeight: '600', marginLeft: 'auto', fontVariant: ['tabular-nums'] },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  diffSub: { fontSize: 11, marginTop: 2 },
  diffBefore: { fontSize: 13, textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] },
  diffAfter: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryValue: { ...typography.h4, marginVertical: 4 },
});
