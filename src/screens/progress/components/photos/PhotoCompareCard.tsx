import React from 'react';
import { View, Text, Image } from 'react-native';
import { useThemeStore } from '../../../../store';
import { Card, FadeIn } from '../../../../components';
import { typography } from '../../../../theme';
import { spacing, borderRadius } from '../../../../theme/spacing';
import type { ProgressPhoto } from '../PhotosTab';

interface Props {
  photos: ProgressPhoto[];
  delay?: number;
}

export const PhotoCompareCard: React.FC<Props> = ({ photos, delay = 80 }) => {
  const { colors } = useThemeStore();
  if (photos.length < 2) return null;

  const first = photos[photos.length - 1];
  const last = photos[0];
  const days = Math.round((new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <FadeIn delay={delay}>
      <Card style={{ marginBottom: spacing.xl }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md, textAlign: 'center' }]}>
          СРАВНЕНИЕ: первое vs последнее
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[first, last].map((photo, idx) => (
            <View key={photo.id} style={{ flex: 1 }}>
              <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: borderRadius.md }} resizeMode="cover" />
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' }]}>
                {idx === 0 ? 'Начало' : 'Сейчас'}
              </Text>
              <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center' }]}>
                {new Date(photo.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          ))}
        </View>
        {days > 0 && (
          <Text style={[typography.captionMedium, { color: colors.primary, textAlign: 'center', marginTop: spacing.md }]}>
            {days} {days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} трансформации
          </Text>
        )}
      </Card>
    </FadeIn>
  );
};
