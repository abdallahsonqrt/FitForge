import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useResponsiveContent } from '../../../src/components/layout/useResponsiveContent';
import { useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import {
  AlertTriangle,
  Flame,
  Lightbulb,
  Repeat,
  Target,
  Timer,
  Wrench,
} from 'lucide-react-native';
import { ErrorState, Skeleton } from '../../../src/components/ui';
import { VideoPlayer } from '../../../src/components/training/VideoPlayer';
import {
  useExercise,
  useVideoPlaybackUrl,
} from '../../../src/features/training/api/useExercises';
import { getApiErrorMessage } from '../../../src/lib/api';
import type { MuscleRef } from '../../../src/features/training/types';

/**
 * The exercise screen.
 *
 * `sets`, `reps` and `rest` arrive as route params when the screen is opened
 * from a plan, so the prescription shown is the one actually programmed for that
 * day; opened from the library, the exercise's own defaults stand in.
 */
export default function ExerciseDetailScreen() {
  const { id, sets, reps, rest } = useLocalSearchParams<{
    id: string;
    sets?: string;
    reps?: string;
    rest?: string;
  }>();
  const { styles, theme } = useStyles(stylesheet);
  const responsiveContent = useResponsiveContent({ withPadding: false });
  const exercise = useExercise(id);

  // Pausing on blur is the player's job, but only this screen knows it is focused.
  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    React.useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  const video = exercise.data?.video ?? null;

  /**
   * Signed URLs expire. The player reports a load failure, which flips this on
   * and fetches a fresh URL for the same video.
   */
  const [needsFreshUrl, setNeedsFreshUrl] = useState(false);
  const refreshed = useVideoPlaybackUrl(video?.id, needsFreshUrl && !!video?.id);

  useEffect(() => {
    setNeedsFreshUrl(false);
  }, [video?.id]);

  const playbackUri = refreshed.data?.url ?? video?.url ?? null;

  if (exercise.isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: true, title: 'Exercise' }} />
        <View style={styles.content}>
          <Skeleton height={200} />
          <Skeleton height={120} />
        </View>
      </View>
    );
  }

  if (exercise.isError || !exercise.data) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: true, title: 'Exercise' }} />
        <ErrorState
          message={getApiErrorMessage(exercise.error, 'This exercise could not be loaded.')}
          onRetry={() => exercise.refetch()}
        />
      </View>
    );
  }

  const {
    name,
    description,
    difficulty,
    category,
    primaryMuscles,
    secondaryMuscles,
    equipment,
    instructions,
    tips,
    commonMistakes,
    defaultSets,
    defaultReps,
    defaultRestSeconds,
  } = exercise.data;

  const prescription = {
    sets: toNumber(sets) ?? defaultSets,
    reps: toNumber(reps) ?? defaultReps,
    rest: toNumber(rest) ?? defaultRestSeconds,
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: name }} />

      <ScrollView contentContainerStyle={[styles.scroll, responsiveContent]}>
        <VideoPlayer
          uri={playbackUri}
          posterUri={video?.thumbnailUrl ?? exercise.data.thumbnailUrl}
          aspectRatio={video?.aspectRatio}
          // A muted demo loop that starts on its own is the point of the screen;
          // it stops the moment the screen is left.
          autoPlay
          isActive={isFocused}
          accessibilityLabel={`Demonstration of ${name}`}
          onExpired={() => setNeedsFreshUrl(true)}
        />

        <View style={styles.content}>
          <Text style={styles.exerciseName}>{name}</Text>

          <View style={styles.tagsContainer}>
            <View style={styles.tag}>
              <Flame size={14} color={theme.colors.primary} />
              <Text style={styles.tagText}>{difficulty}</Text>
            </View>
            {category ? (
              <View style={styles.tagSecondary}>
                <Text style={styles.tagSecondaryText}>{category.name}</Text>
              </View>
            ) : null}
          </View>

          {description ? <Text style={styles.paragraph}>{description}</Text> : null}

          {/* Sets / reps / rest — the prescription for this session. */}
          <View style={styles.prescriptionRow}>
            <Prescription
              icon={<Repeat size={16} color={theme.colors.primary} />}
              label="Sets"
              value={String(prescription.sets)}
            />
            <Prescription
              icon={<Target size={16} color={theme.colors.primary} />}
              label="Reps"
              value={String(prescription.reps)}
            />
            <Prescription
              icon={<Timer size={16} color={theme.colors.primary} />}
              label="Rest"
              value={formatRest(prescription.rest)}
            />
          </View>

          <MuscleSection title="Primary muscles" muscles={primaryMuscles} emphasis />
          <MuscleSection title="Secondary muscles" muscles={secondaryMuscles} />

          {equipment.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Equipment</Text>
              <View style={styles.chipRow}>
                {equipment.map((item) => (
                  <View key={item.id} style={styles.tagSecondary}>
                    <Wrench size={14} color={theme.colors.textSecondary} />
                    <Text style={styles.tagSecondaryText}>
                      {item.name}
                      {item.isRequired ? '' : ' (optional)'}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>How to perform</Text>
          {instructions.length > 0 ? (
            instructions.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepNumberCircle}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.paragraph}>No instructions have been added for this exercise.</Text>
          )}

          {commonMistakes.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Common mistakes</Text>
              {commonMistakes.map((mistake) => (
                <View key={mistake} style={styles.bulletRow}>
                  <AlertTriangle size={16} color={theme.colors.warning} />
                  <Text style={styles.bulletText}>{mistake}</Text>
                </View>
              ))}
            </>
          ) : null}

          {tips.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Tips</Text>
              {tips.map((tip) => (
                <View key={tip} style={styles.bulletRow}>
                  <Lightbulb size={16} color={theme.colors.primary} />
                  <Text style={styles.bulletText}>{tip}</Text>
                </View>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const Prescription: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={styles.prescriptionBox}>
      {icon}
      <Text style={styles.prescriptionValue}>{value}</Text>
      <Text style={styles.prescriptionLabel}>{label}</Text>
    </View>
  );
};

const MuscleSection: React.FC<{ title: string; muscles: MuscleRef[]; emphasis?: boolean }> = ({
  title,
  muscles,
  emphasis = false,
}) => {
  const { styles, theme } = useStyles(stylesheet);
  if (muscles.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.chipRow}>
        {muscles.map((muscle) => (
          <View key={muscle.id} style={emphasis ? styles.tag : styles.tagSecondary}>
            {emphasis ? <Target size={14} color={theme.colors.primary} /> : null}
            <Text style={emphasis ? styles.tagText : styles.tagSecondaryText}>{muscle.name}</Text>
          </View>
        ))}
      </View>
    </>
  );
};

const toNumber = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** 90 → "90s", 120 → "2m". */
const formatRest = (seconds: number): string =>
  seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    paddingBottom: theme.spacing['2xl'],
  },
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  exerciseName: {
    color: theme.colors.text,
    ...theme.typography.headingLg,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  chipRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    marginBottom: theme.spacing.xs,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  tagText: {
    color: theme.colors.primary,
    ...theme.typography.labelSm,
    textTransform: 'capitalize',
  },
  tagSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  tagSecondaryText: {
    color: theme.colors.textSecondary,
    ...theme.typography.labelSm,
  },
  prescriptionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.md,
  },
  prescriptionBox: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
  },
  prescriptionValue: {
    color: theme.colors.text,
    ...theme.typography.headingMd,
  },
  prescriptionLabel: {
    color: theme.colors.textSecondary,
    ...theme.typography.labelSm,
  },
  sectionTitle: {
    color: theme.colors.text,
    ...theme.typography.headingMd,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  paragraph: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodyMd,
    lineHeight: 22,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  stepNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
    marginTop: 2,
  },
  stepNumberText: {
    color: theme.colors.onPrimary,
    ...theme.typography.labelSm,
  },
  stepText: {
    flex: 1,
    color: theme.colors.text,
    ...theme.typography.bodyMd,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  bulletText: {
    flex: 1,
    color: theme.colors.textSecondary,
    ...theme.typography.bodyMd,
    lineHeight: 22,
  },
}));
