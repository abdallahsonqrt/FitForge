import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useResponsiveContent } from '../../../src/components/layout/useResponsiveContent';
import { goBack } from '../../../src/lib/navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Info, SkipForward, X } from 'lucide-react-native';
import { Button, ErrorState, ProgressBar, SkeletonList } from '../../../src/components/ui';
import { ExerciseSetRow } from '../../../src/components/training/ExerciseSetRow';
import { usePlan } from '../../../src/features/training/api/usePlans';
import { muscleNames } from '../../../src/features/training/types';
import {
  useLogWorkout,
  type LoggedSet,
} from '../../../src/features/progress/api/useLogWorkout';
import { getApiErrorMessage } from '../../../src/lib/api';
import { showAlert } from '../../../src/lib/alert';
import { formatDuration } from '../../../src/utils/formatters';

/**
 * A set row's inputs are free text. Anything that is not a positive, finite
 * number is treated as "not recorded" so it can be omitted from the payload.
 */
const toPositiveNumber = (raw: string): number | undefined => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

/** `sessionId` is the workout-day id; `planId` comes along so the day can be resolved. */
export default function ActiveWorkoutScreen() {
  const { sessionId: dayId, planId } = useLocalSearchParams<{ sessionId: string; planId: string }>();
  const router = useRouter();
  const { styles, theme } = useStyles(stylesheet);
  const responsiveContent = useResponsiveContent({ withPadding: false });

  const plan = usePlan(planId);
  const logWorkout = useLogWorkout();

  const day = useMemo(
    () => plan.data?.days.find((candidate) => candidate.id === dayId),
    [plan.data, dayId],
  );

  const [exerciseIndex, setExerciseIndex] = useState(0);
  /**
   * Every set the user has ticked off, keyed `${exerciseId}:${setNumber}`.
   *
   * A Map rather than a Set because the reps and load typed into the row are
   * part of the record — they used to be handed to `toggleSet` and dropped, so
   * finishing a workout saved only its duration.
   */
  const [completedSets, setCompletedSets] = useState<Map<string, LoggedSet>>(new Map());
  const [restRemaining, setRestRemaining] = useState(0);
  const startedAt = useRef(Date.now());

  const currentExercise = day?.exercises[exerciseIndex];
  const totalSets = day?.exercises.reduce((total, item) => total + item.sets, 0) ?? 0;

  // Rest countdown between sets.
  useEffect(() => {
    if (restRemaining <= 0) return;
    const timeout = setTimeout(() => setRestRemaining((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timeout);
  }, [restRemaining]);

  const toggleSet = (setNumber: number, weight: string, reps: string) => {
    if (!currentExercise) return;
    const key = `${currentExercise.id}:${setNumber}`;

    setCompletedSets((previous) => {
      const next = new Map(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, {
          exerciseId: currentExercise.id,
          setNumber,
          // Blank or non-numeric input is left off entirely rather than sent as
          // 0, which would read as "lifted nothing" instead of "not recorded".
          ...(toPositiveNumber(reps) !== undefined ? { reps: toPositiveNumber(reps) } : {}),
          ...(toPositiveNumber(weight) !== undefined
            ? { weightKg: toPositiveNumber(weight) }
            : {}),
        });
        setRestRemaining(currentExercise.restSeconds);
      }
      return next;
    });
  };

  const goToNextExercise = () => {
    setRestRemaining(0);
    setExerciseIndex((index) => Math.min(index + 1, (day?.exercises.length ?? 1) - 1));
  };

  const finishWorkout = () => {
    logWorkout.mutate(
      {
        planId: planId || undefined,
        durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
        sets: Array.from(completedSets.values()).sort(
          (a, b) => a.setNumber - b.setNumber,
        ),
      },
      {
        onSuccess: () => router.replace('/(tabs)/progress'),
        onError: (error) =>
          showAlert('Could not save workout', getApiErrorMessage(error), [
            { text: 'Discard', style: 'destructive', onPress: () => router.replace('/(tabs)/home') },
            { text: 'Retry', onPress: finishWorkout },
          ]),
      },
    );
  };

  const confirmExit = () => {
    showAlert('Leave workout?', 'Your progress in this session will not be saved.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => goBack(planId ? `/workout/${planId}` : '/(tabs)/training'),
      },
    ]);
  };

  if (plan.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <SkeletonList count={4} height={64} />
        </View>
      </SafeAreaView>
    );
  }

  if (plan.isError || !day || !currentExercise) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState
          title="Workout unavailable"
          message={getApiErrorMessage(plan.error, 'This workout day could not be loaded.')}
          onRetry={() => plan.refetch()}
        />
        <Button title="Go back" variant="ghost" onPress={() => goBack('/(tabs)/training')} />
      </SafeAreaView>
    );
  }

  const isLastExercise = exerciseIndex === day.exercises.length - 1;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{day.dayName}</Text>
          <Text style={styles.headerSubtitle}>
            Exercise {exerciseIndex + 1} of {day.exercises.length}
          </Text>
        </View>
        <Pressable
          style={styles.closeButton}
          onPress={confirmExit}
          accessibilityRole="button"
          accessibilityLabel="Leave workout"
          hitSlop={8}
        >
          <X size={24} color={theme.colors.text} />
        </Pressable>
      </View>

      <ProgressBar
        progress={totalSets === 0 ? 0 : completedSets.size / totalSets}
        height={4}
        style={styles.progress}
      />

      <ScrollView contentContainerStyle={[styles.container, responsiveContent]}>
        <View style={styles.exerciseCard}>
          <View style={styles.exerciseHeader}>
            <Text style={styles.exerciseName}>{currentExercise.exercise?.name ?? 'Exercise'}</Text>
            <Pressable
              onPress={() =>
                router.push(
                  `/workout/exercise/${currentExercise.exerciseId}?sets=${currentExercise.sets}&reps=${currentExercise.reps}&rest=${currentExercise.restSeconds}`,
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Exercise details"
              hitSlop={8}
            >
              <Info size={24} color={theme.colors.primary} />
            </Pressable>
          </View>
          {muscleNames(currentExercise.exercise?.primaryMuscles) ? (
            <Text style={styles.muscleGroup}>
              {muscleNames(currentExercise.exercise.primaryMuscles)}
            </Text>
          ) : null}

          <View style={styles.targetRow}>
            <View style={styles.targetBox}>
              <Text style={styles.targetLabel}>Sets</Text>
              <Text style={styles.targetValue}>{currentExercise.sets}</Text>
            </View>
            <View style={styles.targetBox}>
              <Text style={styles.targetLabel}>Reps</Text>
              <Text style={styles.targetValue}>{currentExercise.reps}</Text>
            </View>
            <View style={styles.targetBox}>
              <Text style={styles.targetLabel}>Rest</Text>
              <Text style={styles.targetValue}>{currentExercise.restSeconds}s</Text>
            </View>
          </View>
        </View>

        <View style={styles.setsContainer}>
          {Array.from({ length: currentExercise.sets }).map((_, index) => {
            const setNumber = index + 1;
            return (
              <ExerciseSetRow
                key={`${currentExercise.id}-${setNumber}`}
                setNumber={setNumber}
                initialReps={String(currentExercise.reps)}
                isCompleted={completedSets.has(`${currentExercise.id}:${setNumber}`)}
                onComplete={(weight, reps) => toggleSet(setNumber, weight, reps)}
              />
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.bottomControls}>
        <View style={styles.timerContainer}>
          <Text style={styles.timerLabel}>Rest timer</Text>
          <Text style={[styles.timerValue, restRemaining > 0 && styles.timerValueActive]}>
            {restRemaining > 0 ? formatDuration(restRemaining) : '--'}
          </Text>
        </View>
        <View style={styles.actionButtons}>
          <Button
            title={isLastExercise ? 'Last one' : 'Next'}
            variant="outline"
            size="sm"
            icon={<SkipForward size={18} color={theme.colors.primary} />}
            onPress={goToNextExercise}
            disabled={isLastExercise}
            style={styles.skipButton}
          />
          <Button
            title="Finish Workout"
            onPress={finishWorkout}
            loading={logWorkout.isPending}
            style={styles.finishButton}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: theme.colors.text,
    ...theme.typography.headingMd,
  },
  headerSubtitle: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySm,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  progress: {
    borderRadius: 0,
  },
  container: {
    padding: theme.spacing.lg,
    paddingBottom: 180,
  },
  exerciseCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  exerciseName: {
    color: theme.colors.text,
    ...theme.typography.headingLg,
    flex: 1,
  },
  muscleGroup: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySm,
    textTransform: 'capitalize',
    marginTop: theme.spacing.xs,
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  targetBox: {
    alignItems: 'center',
    flex: 1,
  },
  targetLabel: {
    color: theme.colors.textSecondary,
    ...theme.typography.labelSm,
    marginBottom: theme.spacing.xs,
  },
  targetValue: {
    color: theme.colors.text,
    ...theme.typography.headingMd,
  },
  setsContainer: {
    gap: theme.spacing.xs,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surfaceElevated,
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
  },
  timerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  timerLabel: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodyMd,
  },
  timerValue: {
    color: theme.colors.textSecondary,
    ...theme.typography.headingLg,
  },
  timerValueActive: {
    color: theme.colors.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  skipButton: {
    flex: 1,
  },
  finishButton: {
    flex: 2,
  },
}));
