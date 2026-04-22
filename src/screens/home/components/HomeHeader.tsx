import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore, useAuthStore } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

/** Formats the current date to match the design export exactly:
 *  "Вторник · 22 апреля" — meta-label uppercase monospace. */
function formatDateMetaRu(d: Date): string {
  const weekdays = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  const weekday = weekdays[d.getDay()];
  const day = d.getDate();
  const month = months[d.getMonth()];
  return `${weekday} · ${day} ${month}`;
}

/**
 * Header row from Direction A home design:
 *  - Left: uppercase date meta label, then large greeting "Привет, Имя"
 *  - Right: bell icon in a rounded surface tile with a gold dot overlay
 *    (unread indicator — the design shows it constantly for demo, we keep
 *    it wired to notifications later but render a subtle dot as an
 *    ambient "there's something to see" cue).
 *
 * The bell tile taps through to the profile tab (which is where account
 * notifications live). A future pass can route it to a dedicated
 * notifications screen.
 */
export const HomeHeader: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg }}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text
          style={[
            typography.metaLabel,
            { color: colors.textTertiary, textTransform: 'uppercase' },
          ]}
          numberOfLines={1}
        >
          {formatDateMetaRu(new Date())}
        </Text>
        <Text
          style={[typography.h2, { color: colors.text, marginTop: 4 }]}
          numberOfLines={1}
        >
          Привет, {user?.firstName || 'Атлет'}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => navigation.navigate('ProfileTab')}
        accessibilityLabel="Уведомления и профиль"
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="bell" size={18} color={colors.text} />
        </View>
        {/* Gold dot overlay in the corner — ambient unread indicator */}
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: colors.background,
          }}
        />
      </TouchableOpacity>
    </View>
  );
};
