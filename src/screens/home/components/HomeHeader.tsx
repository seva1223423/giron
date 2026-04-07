import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore, useAuthStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export const HomeHeader: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xxl }}>
      <View>
        <Text style={[typography.small, { color: colors.textSecondary }]}>{getGreeting()}</Text>
        <Text style={[typography.h2, { color: colors.text }]}>{user?.firstName || 'Атлет'}</Text>
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
