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
  onOpenGoals: () => void;
}

interface MenuItem {
  icon: IconName;
  label: string;
  // Either navigates to a screen or invokes the goals modal opener.
  screen?: string;
  action?: 'goals';
}

// Note: `book`, `calendar`, `calculator` icons don't exist in the Icon
// component, so we fall back to existing alternatives (chart / apple / spark).
const ITEMS: MenuItem[] = [
  { icon: 'target', label: 'Цели', action: 'goals' },
  { icon: 'chart', label: 'История', screen: 'NutritionHistory' },
  { icon: 'apple', label: 'Рецепты', screen: 'Recipes' },
  { icon: 'spark', label: 'ИИ-план', screen: 'MealPlan' },
  { icon: 'chart', label: 'Калькулятор', screen: 'MacroCalculator' },
];

/**
 * Inline utility menu — anchored under the header (not a modal).
 *
 * Backdrop is a transparent Pressable that closes the menu on outside
 * taps. The Цели item invokes onOpenGoals (state lives in the parent
 * NutritionScreen so the GoalsModal can render there).
 */
export const NutritionMenu: React.FC<Props> = ({ visible, onClose, onNavigate, onOpenGoals }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();
  const safeTop = useSafeTop();

  if (!visible) return null;

  // Anchor formula matches WorkoutsHeader / UtilityMenu.
  const anchorTop = safeTop + spacing.md + 32 + spacing.md + spacing.sm;

  const handleItemPress = (item: MenuItem) => {
    haptic.selection();
    onClose();
    if (item.action === 'goals') {
      onOpenGoals();
    } else if (item.screen) {
      onNavigate(item.screen);
    }
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
            minWidth: 240,
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
          {ITEMS.map((item) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => handleItemPress(item)}
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
        </View>
      </FadeIn>
    </View>
  );
};
