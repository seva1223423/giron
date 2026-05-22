import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useThemeColors } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

export interface WeekPlanDay {
  /** Short weekday label — e.g. "Пн", "Вт". */
  dayLabel: string;
  /** What's planned — e.g. "Грудь + трицепс", "Сегодня", "Отдых". */
  title: string;
  /** True for the active day card (highlighted gold). */
  active?: boolean;
  /** True if the workout for this day is already completed. */
  done?: boolean;
}

interface Props {
  days: WeekPlanDay[];
  onPressAll?: () => void;
  onPressDay?: (index: number) => void;
}

/**
 * Horizontal week plan strip from Direction A home:
 *
 *   План недели                                        Все →
 *   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
 *   │ ПН ✓ │ │ ВТ   │ │ СР   │ │ ЧТ   │ │ ПТ   │
 *   │ Грудь│ │СЕГО- │ │Кардио│ │Спина │ │Отдых │
 *   │+триц.│ │ДНЯ   │ │30 мин│ │+биц. │ │      │
 *   └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
 *              ^ gold active card, dark text
 *
 * Active card flips to gold background with dark text — same pattern
 * the design uses to highlight "today" in the planned split.
 */
export const WeekPlanStrip: React.FC<Props> = ({ days, onPressAll, onPressDay }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          paddingHorizontal: 4,
        }}
      >
        <Text style={[typography.h4, { color: colors.text }]}>На этой неделе</Text>
        {onPressAll && (
          <TouchableOpacity
            onPress={() => { haptic.selection(); onPressAll(); }}
            accessibilityLabel="Открыть все тренировки"
            accessibilityRole="button"
          >
            <Text style={[typography.captionMedium, { color: colors.primary }]}>Все →</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {days.map((d, i) => {
          const cardBg = d.active ? colors.primary : colors.surface;
          const borderColor = d.active ? colors.primary : colors.border;
          const fg = d.active ? colors.textInverse : colors.text;
          const fgSub = d.active ? colors.textInverse : colors.textSecondary;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => { haptic.selection(); onPressDay?.(i); }}
              accessibilityLabel={`${d.dayLabel} — ${d.title}${d.done ? ', выполнено' : ''}${d.active ? ', сегодня' : ''}`}
              accessibilityRole="button"
              style={{
                minWidth: 96,
                padding: 14,
                borderRadius: 18,
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor,
                // Gold halo on the active day — "today" should be the
                // single element the eye lands on first (PHILOSOPHY §1
                // "Hero, не равные карточки").
                ...(d.active
                  ? {
                      shadowColor: colors.primary,
                      shadowOpacity: 0.35,
                      shadowRadius: 16,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 8,
                    }
                  : null),
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={[
                    typography.metaLabel,
                    {
                      color: fgSub,
                      textTransform: 'uppercase',
                      opacity: d.active ? 0.7 : 0.5,
                    },
                  ]}
                >
                  {d.dayLabel}
                </Text>
                {d.done && <Icon name="check" size={14} color={fg} />}
              </View>
              <Text
                style={[
                  typography.smallMedium,
                  { color: fg, marginTop: spacing.sm },
                ]}
                numberOfLines={2}
              >
                {d.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};
