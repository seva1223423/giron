/**
 * AnnouncementsBanner — list of active admin announcements at the top
 * of HomeScreen.
 *
 * Extracted from HomeScreen.tsx (audit R-2026-05-22, Tier 1 item 3).
 * Was an inline `(() => {...})()` IIFE; useMemo-fied first, now a
 * proper React.memo component so even the .map() iteration skips when
 * the announcements/dismissedIds tuple is stable.
 *
 * Why a component (not just useMemo at the call site): the inline
 * version's .map() reran on every HomeScreen render — useMemo on the
 * filtered array helped but the JSX still rebuilt. A memoized child
 * with shallow equality on (announcements, dismissedIds, colors)
 * bails out cleanly when nothing relevant changed.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon, type IconName } from '../../../components';
import type { Colors } from '../../../theme/colors';
import type { AnnouncementType } from '../../../types';

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  createdAt: string;
}

interface AnnouncementsBannerProps {
  announcements: Announcement[];
  dismissedIds: Set<string>;
  colors: Colors;
  meta: Record<AnnouncementType, { color: string; iconName: IconName }>;
  onDismiss: (id: string) => void;
}

const AnnouncementsBannerImpl: React.FC<AnnouncementsBannerProps> = ({
  announcements,
  dismissedIds,
  colors,
  meta,
  onDismiss,
}) => {
  const visible = announcements.filter((a) => !dismissedIds.has(a.id));
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((a) => {
        const m = meta[a.type];
        return (
          <View key={a.id} style={[styles.banner, { borderColor: m.color + '40', backgroundColor: m.color + '10' }]}>
            <Icon name={m.iconName} size={18} color={m.color} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: m.color }]}>{a.title}</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={3}>{a.body}</Text>
            </View>
            <TouchableOpacity
              onPress={() => onDismiss(a.id)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Скрыть объявление"
            >
              <View style={{ transform: [{ rotate: '45deg' }], padding: 4 }}>
                <Icon name="plus" size={18} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          </View>
        );
      })}
    </>
  );
};

export const AnnouncementsBanner = React.memo(AnnouncementsBannerImpl);

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12,
    marginBottom: 10,
  },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  body: { fontSize: 12, lineHeight: 18 },
});
