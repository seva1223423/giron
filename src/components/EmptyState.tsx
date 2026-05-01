import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from './Text';
import { useThemeStore } from '../store/useThemeStore';
import { useResponsive } from '../hooks/useResponsive';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  /** Icon or illustration component to render above the title. */
  icon?: React.ReactNode;
  /** Optional primary action. */
  action?: { label: string; onPress: () => void };
  /** Compact = used inside cards (smaller padding, smaller text). */
  compact?: boolean;
}

/**
 * Universal "nothing here yet" block. Drop into FlatList's ListEmptyComponent,
 * or render directly when a screen has no data.
 *
 *   <EmptyState
 *     icon={<DumbbellIcon size={48}/>}
 *     title="Нет тренировок"
 *     subtitle="Добавьте первую программу, чтобы начать отслеживать прогресс"
 *     action={{ label: 'Добавить программу', onPress: openProgramPicker }}
 *   />
 */
export function EmptyState({ title, subtitle, icon, action, compact }: EmptyStateProps) {
  const colors = useThemeStore((s) => s.colors);
  const r = useResponsive();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingVertical: compact ? r.space('lg') : r.space('xxxl'),
          paddingHorizontal: r.space('lg'),
        },
      ]}
    >
      {icon ? <View style={{ marginBottom: r.space('md'), opacity: 0.6 }}>{icon}</View> : null}
      <Text
        style={{
          fontSize: compact ? r.fontScale_(15) : r.fontScale_(18),
          fontWeight: '600',
          color: colors.text,
          textAlign: 'center',
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            fontSize: r.fontScale_(13),
            color: colors.textMuted ?? colors.text,
            textAlign: 'center',
            lineHeight: 18,
            maxWidth: 320,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: colors.primary ?? colors.text,
              opacity: pressed ? 0.85 : 1,
              marginTop: r.space('lg'),
              paddingHorizontal: r.space('lg'),
              minHeight: 44,
              borderRadius: r.scale(12),
            },
          ]}
        >
          <Text style={{ color: colors.background, fontWeight: '600', fontSize: r.fontScale_(14) }}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
