import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

/**
 * Toast that appears above the chat input after a destructive AI action
 * (delete_meal / delete_program). Gives the user 8 seconds to tap "Отменить"
 * and restore the deleted data — the safety net chosen instead of a heavier
 * pre-confirmation modal, so the AI remains fast and agentic while typos
 * and misunderstandings don't cost data.
 *
 * The progress bar at the bottom is purely decorative — the real source of
 * truth for the remaining time is the timer set by the parent. If this
 * component unmounts before the timer fires (e.g. user navigates away),
 * the parent should treat the undo window as having elapsed.
 */
interface Props {
  /** Primary label — e.g. "Завтрак удалён (450 ккал)" */
  label: string;
  /** Called when the user taps "Отменить". Parent is responsible for dismissing. */
  onUndo: () => void;
  /** Called when the timer expires or the user taps "×". */
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. Default 8000 — long enough to read + react, short enough to not clutter. */
  durationMs?: number;
}

export const UndoToast: React.FC<Props> = ({ label, onUndo, onDismiss, durationMs = 8000 }) => {
  const { colors } = useThemeStore();
  const [fired, setFired] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  // Drive the progress bar and dismiss timer together.
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      useNativeDriver: false,
    }).start();
    const timer = setTimeout(() => {
      if (!fired) onDismiss();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs]);

  const handleUndo = () => {
    if (fired) return;
    setFired(true);
    onUndo();
  };

  const handleDismiss = () => {
    if (fired) return;
    setFired(true);
    onDismiss();
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderTopColor: colors.error + '40', borderBottomColor: colors.error + '40' }]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: colors.error + '18', borderColor: colors.error + '40' }]}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.error }}>×</Text>
        </View>
        <Text style={[typography.smallMedium, { color: colors.text, flex: 1 }]} numberOfLines={2}>
          {label}
        </Text>
        <TouchableOpacity
          onPress={handleUndo}
          style={[styles.undoBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '60' }]}
          accessibilityLabel="Отменить удаление"
        >
          <Text style={[typography.captionMedium, { color: colors.primary, fontWeight: '700' }]}>Отменить</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Закрыть"
        >
          <Text style={{ fontSize: 18, color: colors.textTertiary }}>×</Text>
        </TouchableOpacity>
      </View>
      {/* Progress bar countdown */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              backgroundColor: colors.error,
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['100%', '0%'] }),
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 2,
    marginHorizontal: -spacing.lg, // bleed to the edges
    overflow: 'hidden',
  },
  progressFill: {
    height: 2,
  },
});
