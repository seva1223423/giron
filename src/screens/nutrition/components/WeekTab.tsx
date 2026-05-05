import React from 'react';
import { View } from 'react-native';
import { WeekStats } from './WeekStats';

/**
 * Week tab content for NutritionScreen.
 *
 * Currently just renders WeekStats. Kept as a real component so future
 * weekly content (week-level KBJU averages, streak summary, etc) has a
 * dedicated home.
 */
export const WeekTab: React.FC = () => {
  return (
    <View>
      <WeekStats />
    </View>
  );
};
