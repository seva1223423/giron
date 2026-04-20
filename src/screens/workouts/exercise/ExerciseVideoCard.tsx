import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { ExerciseVideoModal } from './ExerciseVideoModal';
import { features } from '../../../config/store';

interface Props {
  exerciseName: string;
  /** Own-hosted demo video URL (takes priority over YouTube/Rutube). */
  inlineVideoUrl?: string;
  /** Poster for own-hosted video. */
  inlineVideoPoster?: string;
  youtubeId?: string;
  rutubeId?: string;
  primaryMuscles: string[];
  muscleLabels: Record<string, string>;
  description?: string;
  instructions?: string[];
  tips?: string[];
  commonMistakes?: string[];
}

export const ExerciseVideoCard: React.FC<Props> = ({
  exerciseName, inlineVideoUrl, inlineVideoPoster, youtubeId, rutubeId,
  primaryMuscles, muscleLabels, description, instructions, tips, commonMistakes,
}) => {
  const { colors } = useThemeStore();
  const [modalVisible, setModalVisible] = useState(false);
  // RuStore build: YouTube is unreliable in RF, so prefer Rutube if available; otherwise hide the
  // thumbnail and show a placeholder. International builds keep YouTube-first behavior.
  const effectiveYoutubeId = features.youtubeVideos ? youtubeId : undefined;
  // Preview thumbnail: own-hosted poster first, YouTube thumbnail otherwise.
  const thumbUrl = inlineVideoPoster ?? (effectiveYoutubeId ? `https://img.youtube.com/vi/${effectiveYoutubeId}/hqdefault.jpg` : null);
  const stepsCount = instructions?.length ?? 0;
  const badgeLabel = inlineVideoUrl ? '▶ Видео' : effectiveYoutubeId ? '▶ YouTube' : (rutubeId ? '▶ Rutube' : '🔍 Найти');

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => setModalVisible(true)}
        style={[styles.card, { borderColor: colors.border }]}
      >
        {/* Thumbnail */}
        <View style={styles.thumbnail}>
          {thumbUrl ? (
            <Image source={{ uri: thumbUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0F0F1A', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>▶</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' }}>Техника выполнения</Text>
            </View>
          )}

          {/* Gradient overlay */}
          <View style={styles.overlay} />

          {/* Top: muscle label */}
          <Text style={styles.muscleText}>
            {primaryMuscles.slice(0, 3).map((m) => muscleLabels[m] || m).join(' · ')}
          </Text>

          {/* Center: play button */}
          <View style={styles.playCircle}>
            <Text style={{ color: '#FFF', fontSize: 22, marginLeft: 3 }}>▶</Text>
          </View>

          {/* Bottom-left: steps count */}
          {stepsCount > 0 && (
            <View style={styles.stepsBadge}>
              <Text style={styles.stepsText}>{stepsCount} шагов</Text>
            </View>
          )}

          {/* Bottom-right: video source badge */}
          <View style={styles.ytBadge}>
            <Text style={styles.ytText}>{badgeLabel}</Text>
          </View>
        </View>

        {/* Bottom info row */}
        <View style={[styles.info, { backgroundColor: colors.surface }]}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]} numberOfLines={1}>
              {exerciseName} — техника выполнения
            </Text>
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>
              {inlineVideoUrl
                ? 'Воспроизведение в приложении'
                : effectiveYoutubeId
                  ? 'Откроется в YouTube'
                  : rutubeId
                    ? 'Откроется в Rutube'
                    : 'Поиск видео в браузере'}
              {tips && tips.length > 0 ? ` · ${tips.length} совета` : ''}
            </Text>
          </View>
          <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
        </View>
      </TouchableOpacity>

      <ExerciseVideoModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        exerciseName={exerciseName}
        inlineVideoUrl={inlineVideoUrl}
        inlineVideoPoster={inlineVideoPoster}
        youtubeId={effectiveYoutubeId}
        rutubeId={rutubeId}
        primaryMuscles={primaryMuscles}
        muscleLabels={muscleLabels}
        description={description}
        instructions={instructions}
        tips={tips}
        commonMistakes={commonMistakes}
      />
    </>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: spacing.xl },
  thumbnail: {
    height: 200,
    backgroundColor: '#0F0F1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.30)' },
  muscleText: {
    position: 'absolute', top: 12, left: 14,
    color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  playCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#FF0000',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF0000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55, shadowRadius: 12, elevation: 8,
  },
  stepsBadge: {
    position: 'absolute', bottom: 10, left: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 4,
  },
  stepsText: { color: '#FFF', fontSize: 10, fontWeight: '600' },
  ytBadge: {
    position: 'absolute', bottom: 10, right: 12,
    backgroundColor: '#FF0000',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 4,
  },
  ytText: { color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  info: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    gap: spacing.sm,
  },
});
