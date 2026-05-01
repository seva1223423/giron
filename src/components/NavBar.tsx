import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { useThemeStore } from '../store/useThemeStore';
import { useResponsive } from '../hooks/useResponsive';
import { HitTarget } from './HitTarget';

interface NavBarProps {
  title?: string;
  /** Show the back chevron on the left (calls onBack). */
  onBack?: () => void;
  /** Right-side actions (icons / buttons). */
  trailing?: React.ReactNode;
  /** Optional subtitle below the title. */
  subtitle?: string;
  /** Make the bar transparent over hero images. */
  transparent?: boolean;
  /** Center the title (iOS style). Default: false on tablet, true on phone. */
  centeredTitle?: boolean;
}

/**
 * Adaptive top nav-bar:
 *   - Phone: 44pt tall, centered title, single row of actions
 *   - Tablet: 56pt tall, left-aligned title, more breathing room
 *   - Always sits below status bar via safe-area top inset
 */
export function NavBar({ title, subtitle, onBack, trailing, transparent, centeredTitle }: NavBarProps) {
  const colors = useThemeStore((s) => s.colors);
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const isCentered = centeredTitle ?? r.isPhone;
  const height = r.isTablet ? 56 : 44;

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top,
          backgroundColor: transparent ? 'transparent' : colors.background,
          borderBottomColor: transparent ? 'transparent' : colors.border,
          paddingHorizontal: r.space('md'),
          height: height + insets.top,
        },
      ]}
    >
      <View style={styles.row}>
        {onBack ? (
          <HitTarget onPress={onBack} accessibilityLabel="Назад">
            <View style={[styles.iconBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: 22, marginTop: -2 }}>‹</Text>
            </View>
          </HitTarget>
        ) : (
          <View style={styles.spacer} />
        )}

        <View style={[styles.titleWrap, isCentered ? styles.titleCenter : styles.titleLeft]}>
          {title ? (
            <Text
              numberOfLines={1}
              style={{
                color: colors.text,
                fontSize: r.fontScale_(16),
                fontWeight: '600',
                textAlign: isCentered ? 'center' : 'left',
              }}
            >
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={{
                color: colors.textMuted ?? colors.text,
                fontSize: r.fontScale_(11),
                textAlign: isCentered ? 'center' : 'left',
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.trailing}>{trailing}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  spacer: { width: 32 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1, paddingHorizontal: 12 },
  titleCenter: { alignItems: 'center' },
  titleLeft: { alignItems: 'flex-start' },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

interface SectionHeaderProps {
  title: string;
  /** Optional small caption above the title (eyebrow). */
  eyebrow?: string;
  /** Right-side action ("See all"). */
  action?: { label: string; onPress: () => void };
  /** Compact = no eyebrow space. */
  compact?: boolean;
}

/**
 * Repeatable section header for lists.
 *   <SectionHeader eyebrow="ИЮНЬ" title="Тренировки" action={{ label: 'Все', onPress: ... }}/>
 */
export function SectionHeader({ title, eyebrow, action, compact }: SectionHeaderProps) {
  const colors = useThemeStore((s) => s.colors);
  const r = useResponsive();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: r.space('md'),
        marginTop: compact ? 0 : r.space('lg'),
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 1.6,
              color: colors.textMuted ?? colors.text,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text
          style={{
            fontSize: r.fontScale_(20),
            fontWeight: '600',
            color: colors.text,
            letterSpacing: -0.3,
          }}
        >
          {title}
        </Text>
      </View>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={10}>
          <Text style={{ color: colors.primary ?? colors.text, fontSize: 14, fontWeight: '600' }}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
