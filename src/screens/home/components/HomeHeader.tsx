import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore, useAuthStore, useWorkoutStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { localDateStr } from '../../../utils/date';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function getStreakDisplay(streak: number, primary: string, primaryLight: string): { text: string; color: string } | null {
  if (streak <= 0) return null;
  if (streak >= 30) return { text: `${streak} дней подряд — Легенда`, color: primaryLight };
  if (streak >= 7) return { text: `${streak} дней подряд`, color: primary };
  const label = streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней';
  return { text: `${streak} ${label} подряд`, color: primary };
}

export const HomeHeader: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const { workoutHistory } = useWorkoutStore();

  const streak = useMemo(() => {
    if (workoutHistory.length === 0) return 0;
    let s = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = localDateStr(d);
      if (workoutHistory.some((w) => w.completedAt?.startsWith(ds))) s++;
      else if (i > 0) break;
    }
    return s;
  }, [workoutHistory]);

  const streakDisplay = getStreakDisplay(streak, colors.primary, colors.primaryLight);

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xxl }}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={[typography.small, { color: colors.textSecondary }]}>{getGreeting()}</Text>
        <Text style={[typography.h2, { color: colors.text }]} numberOfLines={1}>{user?.firstName || 'Атлет'}</Text>
        {streakDisplay && (
          <Text style={[typography.smallMedium, { color: streakDisplay.color, marginTop: 2 }]} numberOfLines={1}>
            {streakDisplay.text}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => navigation.navigate('ProfileTab')}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700' }}>
          {(user?.firstName?.[0] || 'A').toUpperCase()}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
