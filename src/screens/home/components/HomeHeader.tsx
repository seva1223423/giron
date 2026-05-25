import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useAuthStore, useThemeColors } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { formatDateMetaRu } from '../../../utils/date';

/**
 * Header row — V5 design (/goal-mode design exploration, audit
 * R-2026-05-22). Combines V2 (time-aware gold greeting) + V3
 * (streak chip beside bell). 4 HTML mockups iterated in
 * docs/design/variants/homeHeader/; V5 is the picked synthesis.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ <gold>Доброе утро,</gold> Имя       [🔥 5] [🔔]      │
 *   │ Понедельник, 27 мая                                  │
 *   └──────────────────────────────────────────────────────┘
 *
 * Why V5 over V1 (production):
 *   - Greeting is time-aware ("Доброе утро / день / вечер / Спокойной
 *     ночи") — warmer than the static "Привет, Имя". Gold accent on
 *     the time-of-day word makes the header feel alive.
 *   - Date demoted to subtitle (the user knows what day it is; the
 *     uppercase meta label was eating the eye for no value).
 *   - Streak chip surfaced inline with the bell. Streak is the single
 *     strongest behavioral hook in fitness apps; promoting it to the
 *     header (always visible) reinforces the habit loop without
 *     adding a card. Hidden when streak < 2 to avoid celebrating
 *     nothing.
 *
 * Props are backwards-compatible. Existing usage
 *   `<HomeHeader navigation={nav} />`
 * still works — `streakDays` undefined → no chip; greeting becomes
 * time-aware (V2 upgrade automatically).
 */
interface Props {
  navigation: any;
  /** Current consecutive-days streak. When ≥ 2, the gold chip
   *  renders. Pass from HomeScreen's `streak` useMemo (already
   *  computed via computeStreak(workoutHistory)). */
  streakDays?: number;
}

/**
 * Pick the right greeting for the current hour. Buckets:
 *   00-04  Спокойной ночи (rare — assume someone closing the app)
 *   05-11  Доброе утро
 *   12-17  Добрый день
 *   18-22  Добрый вечер
 *   23     Спокойной ночи
 * Returns the FULL phrase including comma, ready to splice with name.
 */
function getTimeGreeting(hour: number): string {
  if (hour < 5 || hour >= 23) return 'Спокойной ночи,';
  if (hour < 12) return 'Доброе утро,';
  if (hour < 18) return 'Добрый день,';
  return 'Добрый вечер,';
}

export const HomeHeader: React.FC<Props> = ({ navigation, streakDays }) => {
  const colors = useThemeColors();
  const { user } = useAuthStore();

  // Hour-based greeting. Computed in a useMemo so it doesn't
  // recompute on every parent state churn. Stable within a render —
  // crossing the hour boundary mid-session is rare enough that we
  // skip the every-minute tick. (Worst case: "Доброе утро" lingers
  // 5 minutes into the afternoon. Acceptable trade.)
  const greeting = useMemo(() => getTimeGreeting(new Date().getHours()), []);
  const showStreak = (streakDays ?? 0) >= 2;

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
      <View style={{ flex: 1, marginRight: spacing.sm, minWidth: 0 }}>
        <Text
          style={[typography.h2, { color: colors.text, letterSpacing: -0.3 }]}
          numberOfLines={2}
        >
          <Text style={{ color: colors.primary }}>{greeting}</Text>
          <Text>{' '}{user?.firstName || 'Атлет'}</Text>
        </Text>
        <Text
          style={{ color: colors.textTertiary, fontSize: 12, marginTop: 2 }}
          numberOfLines={1}
        >
          {formatDateMetaRu(new Date())}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        {showStreak && (
          <View
            accessibilityLabel={`Серия тренировок: ${streakDays} дней подряд`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 11,
              paddingVertical: 7,
              borderRadius: 100,
              backgroundColor: colors.primary + '1F' /* ~12% */,
              borderWidth: 1,
              borderColor: colors.primary + '59' /* ~35% */,
            }}
          >
            <Icon name="flame" size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>
              {streakDays}
            </Text>
          </View>
        )}
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
          {/* Gold dot — ambient unread indicator. Kept from V1; will
              get wired to real notification state in a future pass. */}
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
    </View>
  );
};
