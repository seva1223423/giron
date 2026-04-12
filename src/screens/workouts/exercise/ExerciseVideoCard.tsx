import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { ExerciseVideoModal } from './ExerciseVideoModal';

interface Props {
  exerciseName: string;
  youtubeId?: string;
  primaryMuscles: string[];
  muscleLabels: Record<string, string>;
  description?: string;
  instructions?: string[];
}

export const ExerciseVideoCard: React.FC<Props> = ({
  exerciseName, youtubeId, primaryMuscles, muscleLabels, description, instructions,
}) => {
  const { colors } = useThemeStore();
  const [modalVisible, setModalVisible] = useState(false);
  const thumbUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setModalVisible(true)}
        style={[styles.card, { borderColor: colors.border }]}
      >
        <View style={styles.thumbnail}>
          {thumbUrl ? (
            <Image source={{ uri: thumbUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 28, marginBottom: 4 }}>🎥</Text>
            </View>
          )}
          <View style={styles.overlay} />
          <Text style={styles.muscleText}>
            {primaryMuscles.slice(0, 3).map((m) => muscleLabels[m] || m).join(' · ')}
          </Text>
          {/* Play button */}
          <View style={styles.playBtn}>
            <View style={styles.playBtnInner}>
              <Text style={{ color: '#FFF', fontSize: 18, marginLeft: 3 }}>▶</Text>
            </View>
          </View>
          {/* Quality badge */}
          <View style={styles.youtubeBadge}>
            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
              {youtubeId ? '▶ YouTube' : '🔍 Найти'}
            </Text>
          </View>
        </View>
        <View style={[styles.info, { backgroundColor: colors.surface }]}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]} numberOfLines={1}>
              {exerciseName} — техника выполнения
            </Text>
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>
              {youtubeId ? 'Нажми для просмотра · откроется в YouTube' : 'Нажми для поиска видео в YouTube'}
            </Text>
          </View>
          <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
        </View>
      </TouchableOpacity>

      <ExerciseVideoModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        exerciseName={exerciseName}
        youtubeId={youtubeId}
        primaryMuscles={primaryMuscles}
        muscleLabels={muscleLabels}
        description={description}
        instructions={instructions}
      />
    </>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: spacing.xl },
  thumbnail: { height: 160, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  muscleText: { position: 'absolute', top: 10, left: 12, color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  playBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  playBtnInner: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' },
  youtubeBadge: { position: 'absolute', bottom: 8, right: 10, backgroundColor: '#FF0000', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  info: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
});
