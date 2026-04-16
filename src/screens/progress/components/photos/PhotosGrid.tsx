import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { useThemeStore } from '../../../../store';
import { FadeIn } from '../../../../components';
import { typography } from '../../../../theme';
import { spacing, borderRadius } from '../../../../theme/spacing';
import type { ProgressPhoto } from '../PhotosTab';


interface Props {
  photos: ProgressPhoto[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  delay?: number;
}

export const PhotosGrid: React.FC<Props> = ({ photos, selectedId, onSelect, onDelete, delay = 100 }) => {
  const { width: screenWidth } = useWindowDimensions();
  const cellWidth = (screenWidth - spacing.xl * 2 - spacing.md * 2) / 3;
  const { colors } = useThemeStore();

  if (photos.length === 0) return null;

  return (
    <FadeIn delay={delay}>
      <View style={styles.grid}>
        {photos.map((photo, i) => {
          const isSelected = selectedId === photo.id;
          return (
            <View key={photo.id} style={[styles.cell, { width: cellWidth }]}>
              <TouchableOpacity
                onPress={() => { onSelect(isSelected ? null : photo.id); }}
                onLongPress={() => onDelete(photo.id)}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: photo.uri }}
                  style={[styles.thumb, isSelected && { borderColor: colors.primary, borderWidth: 2 }]}
                  resizeMode="cover"
                />
                {i === 0 && (
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>NOW</Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: 4, textAlign: 'center', fontSize: 10 }]}>
                {new Date(photo.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              </Text>
              {photo.note ? (
                <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', fontSize: 9 }]} numberOfLines={1}>
                  {photo.note}
                </Text>
              ) : null}
              {isSelected && (
                <TouchableOpacity
                  onPress={() => onDelete(photo.id)}
                  style={[styles.deleteBtn, { backgroundColor: colors.error + '20', borderColor: colors.error }]}
                >
                  <Text style={[typography.small, { color: colors.error, fontSize: 10 }]}>Удалить</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
      <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.lg }]}>
        Удержи фото для удаления
      </Text>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell: { alignItems: 'center' },
  thumb: { width: '100%', aspectRatio: 3 / 4, borderRadius: borderRadius.md },
  badge: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  deleteBtn: { marginTop: 4, paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: borderRadius.sm, borderWidth: 1, alignItems: 'center' },
});
