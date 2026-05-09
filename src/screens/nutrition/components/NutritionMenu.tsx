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
  // For navigation entries this is the route name; for the local "Цели"
  // action this is left undefined and handled by the special branch below.
  screen?: string;
  action?: 'goals';
}

// Icon fallbacks: the Icon set has no `book`, `calculator`, or `calendar`,
// so we lean on the closest existing pictograms — `apple` for recipes,
// `spark` for AI plan, `dumbbell` for the macro calculator,
// `chart` for history, `target` for goals.
const ITEMS: MenuItem[] = [
  { icon: 'target',   label: 'Цели',        action: 'goals' },
  { icon: 'chart',    label: 'История',     screen: 'NutritionHistory' },
  { icon: 'apple',    label: 'Рецепты',     screen: 'Recipes' },
  { icon: 'spark',    label: 'ИИ-план',     screen: 'MealPlan' },
  { icon: 'dumbbell', label: 'Калькулятор', screen: 'MacroCalculator' },
];

/**
 * Inline utility menu — anchored under the nutrition header (not a modal).
 *
 * Backdrop is a transparent Pressable that closes the menu on outside
 * taps. The panel itself is an elevated surface with the Direction A
 * border + radius treatment. The "Цели" item invokes `onOpenGoals` so
 * the GoalsModal state stays in NutritionScreen; everything else routes
 * via `onNavigate`.
 */
export const NutritionMenu: React.FC<Props> = ({ visible, onClose, onNavigate, onOpenGoals }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();
  const safeTop = useSafeTop();

  if (!visible) return null;

  // Anchor the menu just below the header. Header layout = safeTop + paddingTop(md)
  // + h2 row (~32) + paddingBottom(md) + 1pt border, plus a small gap.
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
