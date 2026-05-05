import React from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '../../../store';
import { Card, Icon, type IconName } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  navigation: any;
}

interface CardItem {
  icon: IconName;
  title: string;
  subtitle: string;
  screen: string;
}

const ITEMS: CardItem[] = [
  { icon: 'timer', title: 'Календарь тренировок', subtitle: 'Дни и сессии за месяц', screen: 'WorkoutCalendar' },
  { icon: 'chart', title: 'История тренировок', subtitle: 'Прошлые тренировки и объём', screen: 'WorkoutHistory' },
  { icon: 'trophy', title: 'Личные рекорды', subtitle: 'PR по каждому упражнению', screen: 'PersonalRecords' },
  { icon: 'grid', title: 'Мои рутины', subtitle: 'Сохранённые шаблоны тренировок', screen: 'Routines' },
];

/**
 * История tab — entry points to backwards-looking workout data.
 *
 * Four nav cards in a single column. Replaces the old shortcut-pill row
 * for these destinations (round 287 layout simplification).
 */
export const HistoryTab: React.FC<Props> = ({ navigation }) => {
  const colors = useThemeColors();

  return (
    <View style={{ gap: spacing.md }}>
      {ITEMS.map((item) => (
        <Card key={item.screen} onPress={() => navigation.navigate(item.screen)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: borderRadius.md,
                backgroundColor: colors.primary + '18',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={item.icon} size={22} color={colors.primary} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodySemibold, { color: colors.text }]}>{item.title}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {item.subtitle}
              </Text>
            </View>
            <Icon name="chev" size={18} color={colors.textSecondary} strokeWidth={2} />
          </View>
        </Card>
      ))}
    </View>
  );
};
