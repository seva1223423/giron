import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useThemeColors } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { ExerciseVideoModal } from './ExerciseVideoModal';
import { ExerciseInlineVideo } from './ExerciseInlineVideo';
import { features } from '../../../config/store';

type MediaSource = number | string;

interface Props {
  exerciseName: string;
  /** Bundled video asset (require(...)) or remote URL. Takes priority over YouTube/Rutube. */
  inlineVideoSource?: MediaSource;
  /** Poster asset / URL for the inline video. */
  inlineVideoPoster?: MediaSource;
  youtubeId?: string;
  rutubeId?: string;
  primaryMuscles: string[];
  muscleLabels: Record<string, string>;
  description?: string;
  instructions?: string[];
  tips?: string[];
  commonMistakes?: string[];
}

const CARD_HEIGHT = 220;

function toImageSource(s: MediaSource | undefined) {
  if (s === undefined) return undefined;
  return typeof s === 'number' ? s : { uri: s };
}

/**
 * Exercise demo card.
 *
 * Two modes:
 *   1. `inlineVideoSource` present → video auto-plays (muted, looped) right
 *      inside the card as the detail screen opens. Tap opens a fullscreen
 *      modal. If playback errors out, falls back to the YouTube/Rutube flow
 *      automatically.
 *   2. No inline source → static thumbnail + tap-to-open modal.
 *
 * When the modal is open, the inline player below it is paused — avoids two
 * simultaneous decoders on the same source.
 */
export const ExerciseVideoCard: React.FC<Props> = ({
  exerciseName, inlineVideoSource, inlineVideoPoster, youtubeId, rutubeId,
  primaryMuscles, muscleLabels, description, instructions, tips, commonMistakes,
}) => {
  const colors = useThemeColors();
  const haptic = useHaptic();
  const [modalVisible, setModalVisible] = useState(false);
  const [inlineFailed, setInlineFailed] = useState(false);

  const effectiveYoutubeId = features.youtubeVideos ? youtubeId : undefined;
  const showInlineVideo = inlineVideoSource !== undefined && !inlineFailed;

  const posterSrc = toImageSource(inlineVideoPoster)
    ?? (effectiveYoutubeId ? { uri: `https://img.youtube.com/vi/${effectiveYoutubeId}/hqdefault.jpg` } : null);

  const openFullscreen = () => { haptic.light(); setModalVisible(true); };
  const stepsCount = instructions?.length ?? 0;

  return (
    <>
      <View style={[styles.card, { borderColor: colors.border }]}>
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={openFullscreen}
          style={[styles.media, { backgroundColor: colors.surfaceElevated }]}
          accessibilityRole="button"
          accessibilityLabel={`${exerciseName} — открыть видео в полном экране`}
        >
          {showInlineVideo ? (
            <ExerciseInlineVideo
              videoSource={inlineVideoSource!}
              posterSource={inlineVideoPoster}
              height={CARD_HEIGHT}
              paused={modalVisible}
              onError={() => setInlineFailed(true)}
            />
          ) : posterSrc ? (
            <Image source={posterSrc} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.placeholder, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>▶</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' }}>Техника выполнения</Text>
            </View>
          )}

          <Text style={styles.muscleText}>
            {primaryMuscles.slice(0, 3).map((m) => muscleLabels[m] || m).join(' · ')}
          </Text>

          {showInlineVideo && (
            <View style={styles.expandBtn} pointerEvents="none">
              <Text style={styles.expandIcon}>⤢</Text>
            </View>
          )}

          {!showInlineVideo && (
            <View style={styles.playCircle}>
              <Text style={{ color: '#FFF', fontSize: 22, marginLeft: 3 }}>▶</Text>
            </View>
          )}

          {stepsCount > 0 && (
            <View style={styles.stepsBadge}>
              <Text style={styles.stepsText}>{stepsCount} шагов</Text>
            </View>
          )}

          {showInlineVideo ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Демо</Text>
            </View>
          ) : (
            <View style={styles.ytBadge}>
              <Text style={styles.ytText}>
                {effectiveYoutubeId ? '▶ YouTube' : rutubeId ? '▶ Rutube' : '🔍 Найти'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={openFullscreen}
          style={[styles.info, { backgroundColor: colors.surface }]}
          accessibilityRole="button"
        >
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]} numberOfLines={1}>
              {exerciseName} — техника выполнения
            </Text>
            <Text style={[typography.caption, { color: inlineFailed ? colors.warning : colors.textTertiary, marginTop: 2 }]}>
              {inlineFailed
                ? 'Видео недоступно — откроется внешняя ссылка'
                : showInlineVideo
                  ? 'Тап для полноэкранного режима'
                  : effectiveYoutubeId
                    ? 'Откроется в YouTube'
                    : rutubeId
                      ? 'Откроется в Rutube'
                      : 'Поиск видео в браузере'}
              {tips && tips.length > 0 && !inlineFailed ? ` · ${tips.length} совета` : ''}
            </Text>
          </View>
          <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
        </TouchableOpacity>
      </View>

      <ExerciseVideoModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        exerciseName={exerciseName}
        inlineVideoSource={inlineFailed ? undefined : inlineVideoSource}
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
  // Backgrounds come from the theme at the usage sites — #0F0F1A was a
  // leftover of the old purple palette (audit R21).
  media: {
    height: CARD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  muscleText: {
    position: 'absolute', top: 12, left: 14,
    color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  expandBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  expandIcon: { color: '#FFF', fontSize: 16, fontWeight: '700', lineHeight: 18 },
  playCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#D4B07A',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#D4B07A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55, shadowRadius: 12, elevation: 8,
  },
  stepsBadge: {
    position: 'absolute', bottom: 10, left: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 4,
  },
  stepsText: { color: '#FFF', fontSize: 10, fontWeight: '600' },
  liveBadge: {
    position: 'absolute', bottom: 10, right: 12,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10, gap: 5,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759' },
  liveText: { color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
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
