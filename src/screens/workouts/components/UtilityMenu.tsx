import React from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { useThemeColors } from '../../../store';
import { FadeIn, Icon, type IconName } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  visible: boolean;
  onClose: () => void;
  onNavigate: (screen: string) => void;
}

interface MenuItem {
  icon: IconName;
  label: string;
  screen: string;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const GROUPS: MenuGroup[] = [
  {
    // These three screens are fully built and registered in the navigator, but
    // nothing rendered a way in: the History tab — the only surface that linked to
    // them — is exported and never used, and this menu (which WorkoutsScreen
    // claims holds them) did not list them. Finished work no user could reach
    // (audit U7 / W9).
    title: 'ЖУРНАЛ',
    items: [
      { icon: 'chart', label: 'История тренировок', screen: 'WorkoutHistory' },
      { icon: 'grid', label: 'Календарь', screen: 'WorkoutCalendar' },
      { icon: 'trophy', label: 'Личные рекорды', screen: 'PersonalRecords' },
    ],
  },
  {
    title: 'ИНСТРУМЕНТЫ',
    items: [
      { icon: 'target', label: '1ПМ калькулятор', screen: 'OneRMCalculator' },
      { icon: 'dumbbell', label: 'Калькулятор блинов', screen: 'PlateCalculator' },
    ],
  },
  {
    title: 'ЛОГИРОВАНИЕ',
    items: [
      { icon: 'heart', label: 'Кардио', screen: 'Cardio' },
      { icon: 'flame', label: 'Шаги', screen: 'Steps' },
      { icon: 'timer', label: 'План недели', screen: 'WeeklyPlan' },
    ],
  },
];

/**
 * Inline utility menu — anchored under the header (not a modal).
 *
 * Phase 3 restructure:
 *   - Items split into "Инструменты" + "Логирование" groups with metaLabel
 *     headers so the menu has information scent (юзер видит сразу что внутри).
 *   - Removed "Свободная тренировка" — that action lives on the Начать tab
 *     as "Создать свою тренировку" (one entry point, no duplicate).
 *
 * Backdrop is a transparent Pressable that closes the menu on outside
 * taps. The panel itself is an elevated surface with the Direction A
 * border + radius treatment.
 */
export const UtilityMenu: React.FC<Props> = ({ visible, onClose, onNavigate }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();
  const safeTop = useSafeTop();

  if (!visible) return null;

  // Anchor the menu just below the header. Header layout = safeTop + paddingTop(md)
  // + h2 row (~32) + paddingBottom(md) + 1pt border, plus a small gap.
  const anchorTop = safeTop + spacing.md + 32 + spacing.md + spacing.sm;

  const handleItemPress = (screen: string) => {
    haptic.selection();
    onClose();
    onNavigate(screen);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Закрыть меню"
      />
      <FadeIn duration={140} from="top" distance={8} style={{ position: 'absolute', top: anchorTop, right: spacing.xl }}>
        <View
          style={{
            minWidth: 260,
            backgroundColor: colors.surfaceElevated,
            borderRadius: borderRadius.xl,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 16,
            elevation: 8,
          }}
        >
          {GROUPS.map((group, gi) => (
            <View key={group.title} style={{ marginTop: gi === 0 ? 0 : spacing.sm }}>
              <Text
                style={[
                  typography.metaLabel,
                  {
                    color: colors.textSecondary,
                    paddingHorizontal: spacing.sm,
                    paddingTop: spacing.sm,
                    paddingBottom: spacing.xs,
                  },
                ]}
              >
                {group.title}
              </Text>
              {group.items.map((item) => (
                <TouchableOpacity
                  key={item.screen}
                  onPress={() => handleItemPress(item.screen)}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    minHeight: 44,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.sm,
                    borderRadius: borderRadius.md,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: borderRadius.sm,
                      backgroundColor: colors.primary + '18',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name={item.icon} size={16} color={colors.primary} strokeWidth={2} />
                  </View>
                  <Text style={[typography.smallMedium, { color: colors.text, flex: 1 }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
              {gi < GROUPS.length - 1 && (
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.primary + '20',
                    marginVertical: spacing.xs,
                    marginHorizontal: spacing.sm,
                  }}
                />
              )}
            </View>
          ))}
        </View>
      </FadeIn>
    </View>
  );
};
