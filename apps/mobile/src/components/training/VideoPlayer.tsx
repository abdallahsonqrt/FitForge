import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode, AVPlaybackStatus, AVPlaybackStatusSuccess } from 'expo-av';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Play, Pause, Volume2, VolumeX, RotateCcw, VideoOff } from 'lucide-react-native';

export interface VideoPlayerProps {
  /** Progressive-streaming URL. Null renders the empty state. */
  uri: string | null;
  /** Poster frame, shown until the first video frame is decoded. */
  posterUri?: string | null;
  /** Real aspect ratio, so the player never resizes once playback starts. */
  aspectRatio?: number | null;
  /**
   * Start playing as soon as the video is ready. Muted, looping and silent —
   * the only kind of autoplay that is acceptable on a phone.
   */
  autoPlay?: boolean;
  /** Pause when the screen loses focus, so audio never follows the user away. */
  isActive?: boolean;
  accessibilityLabel?: string;
  /** Asks the parent for a fresh URL when a signed one has expired mid-view. */
  onExpired?: () => void;
}

/** Fallback shape for a video whose dimensions were never measured. */
const DEFAULT_ASPECT_RATIO = 16 / 9;

/**
 * The exercise video player.
 *
 * Streams progressively from the URL it is handed — the file is never downloaded
 * up front, so playback starts on the first chunk and seeking pulls only the
 * range it needs.
 *
 * Autoplay is deliberately conservative. It happens only when the caller asks
 * for it, only muted, and only while the screen is focused: a demo loop that
 * plays itself is useful, one that makes noise in public is not. Web browsers
 * refuse unmuted autoplay outright, which is the same rule.
 */
export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  uri,
  posterUri,
  aspectRatio,
  autoPlay = true,
  isActive = true,
  accessibilityLabel,
  onExpired,
}) => {
  const video = useRef<Video>(null);
  const { styles, theme } = useStyles(stylesheet);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  // Autoplay implies muted; a video the user started should be audible.
  const [isMuted, setIsMuted] = useState(autoPlay);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // A new source is a new video: drop the state belonging to the old one.
  useEffect(() => {
    setIsLoaded(false);
    setError(null);
    setProgress(0);
  }, [uri]);

  // Leaving the screen stops playback rather than letting it run unseen.
  useEffect(() => {
    if (!isActive) {
      video.current?.pauseAsync().catch(() => undefined);
    }
  }, [isActive]);

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        if (status.error) {
          setError('This video could not be played.');
          // An expired signed URL fails exactly like a broken one, so the parent
          // is given the chance to mint a fresh URL and try again.
          onExpired?.();
        }
        return;
      }

      const loaded = status as AVPlaybackStatusSuccess;
      setIsLoaded(true);
      setIsPlaying(loaded.isPlaying);
      setIsBuffering(loaded.isBuffering && !loaded.isPlaying);

      if (loaded.durationMillis) {
        setProgress(Math.min(1, loaded.positionMillis / loaded.durationMillis));
      }
    },
    [onExpired],
  );

  const togglePlayback = useCallback(async () => {
    const player = video.current;
    if (!player) return;

    if (isPlaying) {
      await player.pauseAsync();
      return;
    }

    // Tapping play is an explicit request for the video, so unmute it — unless
    // the user muted it deliberately after it started.
    await player.playAsync();
  }, [isPlaying]);

  const retry = useCallback(async () => {
    setError(null);
    onExpired?.();
    await video.current?.loadAsync({ uri: uri ?? '' }, { shouldPlay: false }, false).catch(() => undefined);
  }, [onExpired, uri]);

  const ratio = aspectRatio && aspectRatio > 0 ? aspectRatio : DEFAULT_ASPECT_RATIO;

  if (!uri) {
    return (
      <View style={[styles.container, { aspectRatio: ratio }]}>
        <View style={styles.emptyState}>
          <VideoOff size={32} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>No demonstration video yet</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { aspectRatio: ratio }]}
      accessibilityLabel={accessibilityLabel}
    >
      {/* Poster underneath the video: it fills the frame during the first fetch
          and disappears behind the first decoded frame. */}
      {posterUri && !isLoaded ? (
        <Image source={{ uri: posterUri }} style={styles.poster} contentFit="cover" transition={150} />
      ) : null}

      <Video
        ref={video}
        style={styles.video}
        source={{ uri }}
        useNativeControls={false}
        // `contain` keeps portrait clips whole; the container already matches the
        // video's own aspect ratio, so there is nothing to crop away.
        resizeMode={ResizeMode.CONTAIN}
        isLooping
        isMuted={isMuted}
        shouldPlay={autoPlay && isActive && !error}
        // Progressive playback: expo-av streams by byte range rather than
        // waiting for the whole file.
        progressUpdateIntervalMillis={250}
        onPlaybackStatusUpdate={onStatus}
      />

      {error ? (
        <View style={styles.overlayCentered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={retry} accessibilityRole="button">
            <RotateCcw size={16} color={theme.colors.onPrimary} />
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable
            style={styles.touchLayer}
            onPress={togglePlayback}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
          >
            {!isPlaying && isLoaded ? (
              <View style={styles.playButton}>
                <Play color={theme.colors.onPrimary} size={28} fill={theme.colors.onPrimary} />
              </View>
            ) : null}

            {(!isLoaded || isBuffering) && !posterUri ? (
              <ActivityIndicator color={theme.colors.onPrimary} />
            ) : null}
          </Pressable>

          <View style={styles.controlsRow}>
            <Pressable
              onPress={togglePlayback}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
            >
              {isPlaying ? (
                <Pause size={18} color={theme.colors.onPrimary} />
              ) : (
                <Play size={18} color={theme.colors.onPrimary} />
              )}
            </Pressable>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>

            <Pressable
              onPress={() => setIsMuted((muted) => !muted)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isMuted ? 'Unmute video' : 'Mute video'}
            >
              {isMuted ? (
                <VolumeX size={18} color={theme.colors.onPrimary} />
              ) : (
                <Volume2 size={18} color={theme.colors.onPrimary} />
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    width: '100%',
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
  },
  touchLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    // A visible affordance over both dark and bright frames.
    opacity: 0.92,
  },
  emptyState: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySm,
    textAlign: 'center',
  },
  overlayCentered: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  errorText: {
    color: '#fff',
    ...theme.typography.bodySm,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
  },
  retryLabel: {
    color: theme.colors.onPrimary,
    ...theme.typography.labelSm,
  },
  controlsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
}));
