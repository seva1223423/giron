import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Image } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useThemeStore } from '../../../store';

interface Props {
  /** Direct .mp4 / HLS URL served from our own CDN (set via EXPO_PUBLIC_MEDIA_URL). */
  videoUrl: string;
  /** Optional poster image shown before the video starts playing. */
  posterUrl?: string;
  /** Height in px (16:9 aspect is handled by the caller). */
  height: number;
  /** Start muted (default true — autoplay only works muted on most platforms). */
  startMuted?: boolean;
  /** Hide the mute toggle (useful for secondary cards). */
  hideMuteButton?: boolean;
  /** Fallback to render on player error (e.g. video missing). */
  onError?: () => void;
}

/**
 * Inline native video player for exercise demonstration videos.
 *
 * Behavior:
 *   - Autoplays on mount (muted, looped).
 *   - Shows poster JPG overlay until the first frame actually renders — makes
 *     the card look "instant" even on slow connections where the MP4 takes
 *     200-400 ms to buffer.
 *   - Tap anywhere on the video toggles mute. Small mute-state badge in the
 *     bottom-left so the user knows what state the sound is in.
 *   - Surfaces load errors via onError so the parent card can fall back to a
 *     YouTube/Rutube link.
 *
 * Uses expo-video (Expo SDK 54+). Works identically on iOS and Android.
 */
export const ExerciseInlineVideo: React.FC<Props> = ({
  videoUrl, posterUrl, height, startMuted = true, hideMuteButton = false, onError,
}) => {
  const { colors } = useThemeStore();
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const [muted, setMuted] = useState(startMuted);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = startMuted;
    p.play();
  });

  // Track player state. statusChange → 'readyToPlay' / 'error'. We use 'playingChange'
  // to know when real frames are being rendered so we can hide the poster overlay.
  useEffect(() => {
    const statusSub = player.addListener('statusChange', (e) => {
      if (e.status === 'error') onError?.();
    });
    const playingSub = player.addListener('playingChange', (e) => {
      if (e.isPlaying) setHasStartedPlayback(true);
    });
    return () => { statusSub.remove(); playingSub.remove(); };
  }, [player, onError]);

  const toggleMute = () => {
    const next = !player.muted;
    player.muted = next;
    setMuted(next);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={toggleMute}
      style={[styles.wrapper, { height, backgroundColor: colors.background }]}
    >
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />

      {/* Poster overlay — fades away the moment the player starts rendering frames */}
      {!hasStartedPlayback && posterUrl && (
        <Image
          source={{ uri: posterUrl }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      )}

      {!hideMuteButton && (
        <View style={styles.muteBadge} pointerEvents="none">
          <Text style={styles.muteIcon}>{muted ? '🔇' : '🔊'}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: { width: '100%', overflow: 'hidden' },
  muteBadge: {
    position: 'absolute', bottom: 10, left: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10,
  },
  muteIcon: { fontSize: 13 },
});
