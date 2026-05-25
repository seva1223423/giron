import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useThemeColors } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
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
  /** Day classification. `'rest'` swaps the card to a dashed-border
   *  empty-state visual (audit R-2026-05-22 V3 design pick) — makes it
   *  obvious which days have nothing scheduled, distinct from "planned
   *  but not done yet". Defaults to `'workout'`.  */
  kind?: 'workout' | 'cardio' | 'rest';
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
        <Text style={[typography.h4, { color: colors.text }]}>План недели</Text>
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
          // Audit R-2026-05-22 V3: 3 distinct visual states beyond
          // the active/done flags:
          //   active → gold solid + "СЕГОДНЯ" badge (clear "today")
          //   done   → gold tint + bright primary day-letter + ✓
          //   rest   → transparent + dashed border (planned NOTHING)
          //   else   → plain surface (planned-but-pending workout)
          const isRest = d.kind === 'rest';
          const cardBg = d.active
            ? colors.primary
            : d.done
              ? colors.primary + '14' // ~8% gold tint
              : isRest
                ? 'transparent'
                : colors.surface;
          const borderColor = d.active
            ? colors.primary
            : d.done
              ? colors.primary + '4D' // ~30%
              : isRest
                ? 'rgba(255,255,255,0.15)'
                : colors.border;
          const borderStyle = isRest ? 'dashed' : 'solid';
          const fg = d.active ? colors.textInverse : isRest ? colors.textTertiary : colors.text;
          const fgSub = d.active ? colors.textInverse : colors.textSecondary;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => { haptic.selection(); onPressDay?.(i); }}
              accessibilityLabel={`${d.dayLabel} — ${d.title}${d.done ? ', выполнено' : ''}${d.active ? ', сегодня' : ''}${isRest ? ', день отдыха' : ''}`}
              accessibilityRole="button"
              style={{
                minWidth: 96,
                padding: 14,
                borderRadius: 18,
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor,
                borderStyle,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {d.active ? (
                  // Explicit "СЕГОДНЯ" pill — removes ambiguity that
                  // V1's plain gold card produced ("which day is gold?").
                  <View
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.18)',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textInverse,
                        fontSize: 9,
                        fontWeight: '700',
                        letterSpacing: 1.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      Сегодня
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={{
                      color: d.done ? colors.primary : fgSub,
                      fontSize: 10,
                      fontWeight: d.done ? '700' : '500',
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      opacity: d.done ? 1 : 0.5,
                    }}
                  >
                    {d.dayLabel}
                  </Text>
                )}
                {d.done && (
                  <Text
                    style={[
                      typography.captionMedium,
                      { color: d.active ? fg : colors.primary, fontWeight: '700' },
                    ]}
                  >
                    ✓
                  </Text>
                )}
              </View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: isRest ? '500' : '600',
                  color: fg,
                  marginTop: 10,
                  lineHeight: 16,
                }}
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
