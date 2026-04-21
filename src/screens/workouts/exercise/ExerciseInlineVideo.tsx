import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Image } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useThemeStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';

/**
 * Video + poster sources can be either:
 *   - a React Native module ID (`require('../assets/foo.mp4')`) for bundled assets
 *   - a remote URL string (legacy / fallback)
 * expo-video's useVideoPlayer and RN's <Image source={…} /> both accept either form.
 */
type MediaSource = number | string;

interface Props {
  /** Bundled asset module ID or a remote URL for the demo video. */
  videoSource: MediaSource;
  /** Optional poster shown before the first frame renders. */
  posterSource?: MediaSource;
  /** Height in px (16:9 aspect is handled by the caller). */
  height: number;
  /** Start muted (default true — autoplay only works muted on most platforms). */
  startMuted?: boolean;
  /** Hide the mute toggle (useful for very compact previews). */
  hideMuteButton?: boolean;
  /** Show native player controls (scrubber, fullscreen, mute). Useful in modal view. */
  nativeControls?: boolean;
  /** Pause playback from outside (e.g. when a modal overlays this card). */
  paused?: boolean;
  /** Fallback to render on player error (e.g. video missing). */
  onError?: () => void;
}

/**
 * Inline native video player for exercise demonstration videos.
 *
 * Behavior:
 *   - Autoplays on mount (muted, looped by default).
 *   - Shows poster JPG overlay until the first frame actually renders — makes
 *     the card look "instant" even on slow connections where the MP4 takes
 *     200-400 ms to buffer.
 *   - Mute toggle is a dedicated corner button (not a whole-view tap) so the
 *     parent card can still receive taps for its own action (e.g. fullscreen).
 *   - `paused` prop lets the parent stop this instance when another player
 *     takes over — prevents double-decode when a modal is open over the card.
 *   - Releases the player on unmount to stop background decoding when the user
 *     navigates between exercises.
 *   - Surfaces load errors via onError so the parent can swap to a YouTube/
 *     Rutube link.
 *
 * Uses expo-video (Expo SDK 54+). Works identically on iOS and Android.
 */
function toImageSource(s: MediaSource | undefined) {
  if (s === undefined) return undefined;
  return typeof s === 'number' ? s : { uri: s };
}

export const ExerciseInlineVideo: React.FC<Props> = ({
  videoSource, posterSource, height, startMuted = true, hideMuteButton = false,
  nativeControls = false, paused = false, onError,
}) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const [muted, setMuted] = useState(startMuted);

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.muted = startMuted;
    p.play();
  });

  // Listeners for error + first-frame events.
  useEffect(() => {
    const statusSub = player.addListener('statusChange', (e) => {
      if (e.status === 'error') onError?.();
    });
    const playingSub = player.addListener('playingChange', (e) => {
      if (e.isPlaying) setHasStartedPlayback(true);
    });
    return () => { statusSub.remove(); playingSub.remove(); };
  }, [player, onError]);

  // External pause: when a modal opens over the card, stop decoding here.
  useEffect(() => {
    if (paused) {
      try { player.pause(); } catch { /* player may already be released */ }
    } else {
      try { player.play(); } catch { /* ignore */ }
    }
  }, [paused, player]);

  // Hard cleanup on unmount. expo-video keeps the player alive per hook instance,
  // which otherwise continues decoding in the background while the user
  // navigates away from the screen.
  useEffect(() => {
    return () => {
      try {
        player.pause();
        // replaceAsync(null) / replace(null) clears the source so no further
        // network reads happen. API varies slightly between expo-video versions —
        // guard all calls.
        if (typeof (player as any).replace === 'function') (player as any).replace(null);
        if (typeof (player as any).release === 'function') (player as any).release();
      } catch { /* ignore */ }
    };
  }, [player]);

  const toggleMute = () => {
    haptic.selection();
    const next = !player.muted;
    player.muted = next;
    setMuted(next);
  };

  return (
    <View style={[styles.wrapper, { height, backgroundColor: colors.background }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit={nativeControls ? 'contain' : 'cover'}
        nativeControls={nativeControls}
        allowsPictureInPicture={false}
        // When native controls are on (modal view), the OS renders its own
        // fullscreen button which handles orientation changes properly — much
        // better than wiring expo-screen-orientation ourselves.
      />

      {/* Poster overlay — fades away the moment the player starts rendering frames */}
      {!hasStartedPlayback && posterSource !== undefined && (
        <Image
          source={toImageSource(posterSource)!}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      )}

      {!hideMuteButton && (
        <TouchableOpacity
          style={styles.muteBadge}
          onPress={toggleMute}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Включить звук' : 'Выключить звук'}
        >
          <Text style={styles.muteIcon}>{muted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { width: '100%', overflow: 'hidden' },
  muteBadge: {
    position: 'absolute', bottom: 10, left: 12,
    minWidth: 36, minHeight: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  muteIcon: { fontSize: 16 },
});
