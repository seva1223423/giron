import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeColors } from '../../../store';
import { AnimatedPressable, Icon, type IconName } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

/**
 * A titled horizontal shelf — "МОИ ШАБЛОНЫ", "БИБЛИОТЕКА ПРОГРАММ",
 * "ГОТОВЫЕ КОМПЛЕКСЫ".
 *
 * These used to be three separate tabs. A tab hides its contents behind a
 * decision the user cannot make yet — you have to guess which tab holds what
 * you want before you can look. A shelf shows a few real items and says how
 * many more there are, so choosing is done with the eyes.
 */

export interface ShelfItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Two letters shown instead of an icon — covers for programs. */
  cover?: string;
  locked?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

interface Props {
  title: string;
  items: ShelfItem[];
  /** Right-hand link, e.g. "все 25". Omitted when there is nothing more. */
  moreLabel?: string;
  onMore?: () => void;
  /** Trailing "＋" card — creating belongs where the existing ones are. */
  onAdd?: () => void;
  addLabel?: string;
  /** Shown instead of the cards when the shelf is empty. */
  emptyText?: string;
}

export const ShelfStrip: React.FC<Props> = ({
  title, items, moreLabel, onMore, onAdd, addLabel = 'Создать', emptyText,
}) => {
  const colors = useThemeColors();
  const haptic = useHaptic();

  if (items.length === 0 && !onAdd && !emptyText) return null;

  return (
    <View style={{ marginBottom: spacing.xl }}>
      <View style={styles.header}>
        <Text style={[typography.metaLabel, { color: colors.textSecondary, flex: 1 }]}>{title}</Text>
        {!!moreLabel && !!onMore && (
          <AnimatedPressable
            onPress={() => { haptic.selection(); onMore(); }}
            haptic={false}
            scaleDown={0.94}
            style={styles.more as any}
            accessibilityRole="button"
            accessibilityLabel={moreLabel}
          >
            <Text style={[typography.caption, { color: colors.primary }]}>{moreLabel}</Text>
            <Icon name="chev" size={13} color={colors.primary} />
          </AnimatedPressable>
        )}
      </View>

      {items.length === 0 && !!emptyText ? (
        <Text style={[typography.caption, { color: colors.textTertiary, marginBottom: spacing.sm }]}>
          {emptyText}
        </Text>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs, paddingRight: spacing.md }}
      >
        {items.map((item) => (
          <AnimatedPressable
            key={item.id}
            onPress={item.onPress}
            onLongPress={item.onLongPress}
            haptic={false}
            scaleDown={0.96}
            style={[styles.card, {
              backgroundColor: colors.card,
              borderColor: item.locked ? colors.border : colors.border,
              opacity: item.locked ? 0.72 : 1,
            }] as any}
            accessibilityRole="button"
            accessibilityLabel={item.locked ? `${item.title}. Доступно с Pro` : item.title}
          >
            <View style={[styles.badge, {
              backgroundColor: item.locked ? colors.border + '55' : colors.primary + '18',
              borderColor: item.locked ? colors.border : colors.primary + '40',
            }]}>
              {item.locked ? (
                <Icon name="lock" size={15} color={colors.textTertiary} />
              ) : item.cover ? (
                <Text style={[typography.captionMedium, { color: colors.primary }]} allowFontScaling={false}>
                  {item.cover}
                </Text>
              ) : (
                <Icon name={item.icon ?? 'bookmark'} size={16} color={colors.primary} />
              )}
            </View>
            <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            {!!item.subtitle && (
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
                {item.subtitle}
              </Text>
            )}
          </AnimatedPressable>
        ))}

        {!!onAdd && (
          <AnimatedPressable
            onPress={() => { haptic.selection(); onAdd(); }}
            haptic={false}
            scaleDown={0.96}
            style={[styles.card, styles.addCard, { borderColor: colors.primary + '45' }] as any}
            accessibilityRole="button"
            accessibilityLabel={addLabel}
          >
            <Icon name="plus" size={22} color={colors.primary} strokeWidth={2.2} />
            <Text style={[typography.caption, { color: colors.primary, marginTop: spacing.sm, textAlign: 'center' }]}>
              {addLabel}
            </Text>
          </AnimatedPressable>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, minHeight: 24 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: spacing.xs, paddingLeft: spacing.md },
  card: {
    width: 150, minHeight: 118, padding: spacing.md,
    borderRadius: borderRadius.xl, borderWidth: 1, justifyContent: 'flex-start',
  },
  badge: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  addCard: {
    borderStyle: 'dashed', backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
});
