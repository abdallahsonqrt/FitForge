import React, { useMemo } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Dumbbell } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { getApiErrorMessage } from '../../src/lib/api';
import { SectionHeader } from '../../src/components/layout/SectionHeader';
import { WorkoutCard } from '../../src/components/dashboard/WorkoutCard';
import { CalorieRing } from '../../src/components/dashboard/CalorieRing';
import { StepCounter } from '../../src/components/dashboard/StepCounter';
import { WaterTracker } from '../../src/components/dashboard/WaterTracker';
import { StreakBadge } from '../../src/components/dashboard/StreakBadge';
import { QuickActions } from '../../src/components/dashboard/QuickActions';
import { EmptyState, ErrorState, Skeleton } from '../../src/components/ui';
import { useMe } from '../../src/features/users/api/useMe';
import { useStreak } from '../../src/features/progress/api/useStreaks';
import { useMealSummary } from '../../src/features/nutrition/api/useMeals';
import { useLogWater, useWaterTotal } from '../../src/features/nutrition/api/useWater';
import { useStepsTotal } from '../../src/features/nutrition/api/useSteps';
import { usePlan, usePlans } from '../../src/features/training/api/usePlans';
import { estimateDayMinutes } from '../../src/features/training/types';
import { deriveDailyGoals, WATER_INCREMENT_ML } from '../../src/utils/goals';
import { displayName } from '../../src/features/users/types';
import { usePreferencesStore } from '../../src/store/preferencesStore';
import { useTranslation } from '../../src/i18n';

export default function DashboardScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  const me = useMe();
  const streak = useStreak();
  const summary = useMealSummary();
  const water = useWaterTotal();
  const steps = useStepsTotal();
  const plans = usePlans();

  // The API has no "active plan" concept, so surface the first plan the user's
  // tier unlocks and label it as a suggestion rather than a scheduled session.
  const suggestedPlanId = plans.data?.[0]?.id;
  const suggestedPlan = usePlan(suggestedPlanId);
  const firstDay = suggestedPlan.data?.days?.[0];

  const goals = useMemo(() => deriveDailyGoals(me.data), [me.data]);
  const logWater = useLogWater();
  const units = usePreferencesStore((state) => state.units);

  const isRefreshing =
    me.isFetching || summary.isFetching || water.isFetching || steps.isFetching || streak.isFetching;

  const refreshAll = () => {
    me.refetch();
    streak.refetch();
    summary.refetch();
    water.refetch();
    steps.refetch();
    plans.refetch();
  };

  /**
   * A failed load is not an empty one. Without this the dashboard rendered
   * "0 calories", "0 steps" and "No plans yet" when the request had simply
   * failed, which reads as real data and offers no way to retry.
   */
  if (me.isError) {
    return (
      <ScreenContainer insideTabs onRefresh={refreshAll} refreshing={isRefreshing}>
        <ErrorState
          message={getApiErrorMessage(me.error, t('common.somethingWentWrong'))}
          onRetry={refreshAll}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer insideTabs onRefresh={refreshAll} refreshing={isRefreshing}>
      <View style={styles.header}>
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting} numberOfLines={1}>
            Hello, {displayName(me.data) || 'Athlete'}
          </Text>
          <Text style={styles.date}>
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
        {streak.data && (
          <StreakBadge streak={streak.data.currentStreak} active={streak.data.currentStreak > 0} />
        )}
      </View>

      {suggestedPlan.isLoading || plans.isLoading ? (
        <Skeleton height={200} style={styles.workoutSkeleton} />
      ) : firstDay && suggestedPlan.data ? (
        <WorkoutCard
          label={t('home.recommended')}
          planName={`${suggestedPlan.data.name} — ${firstDay.dayName}`}
          exerciseCount={firstDay.exercises.length}
          estimatedMinutes={estimateDayMinutes(firstDay)}
          onStart={() => router.push(`/workout/${suggestedPlan.data!.id}`)}
        />
      ) : (
        <EmptyState
          icon={<Dumbbell size={32} color={theme.colors.primary} />}
          title={t('home.noPlans')}
          description="Browse the training library to find a plan that fits your goal."
          actionLabel="Browse plans"
          onAction={() => router.push('/(tabs)/training')}
          style={styles.emptyWorkout}
        />
      )}

      <SectionHeader title={t('home.dailyOverview')} />

      <View style={[styles.gridRow, isCompact && styles.gridColumn]}>
        <View style={styles.calorieContainer}>
          <CalorieRing consumed={summary.data?.calories ?? 0} target={goals.calories} />
        </View>
        <View style={[styles.smallStatsContainer, isCompact && styles.smallStatsStacked]}>
          <StepCounter steps={steps.data ?? 0} goal={goals.steps} />
          <View style={{ height: theme.spacing.md }} />
          <WaterTracker
            amountMl={water.data ?? 0}
            goalMl={goals.waterMl}
            units={units}
            incrementMl={WATER_INCREMENT_ML}
            onAdd={() => logWater.mutate(WATER_INCREMENT_ML)}
          />
        </View>
      </View>

      {goals.isEstimated && (
        <Text style={styles.goalNote}>
          Targets are generic estimates — complete your profile for numbers based on your body and
          goal.
        </Text>
      )}

      <View style={styles.sectionSpacing} />

      <SectionHeader title={t('home.quickActions')} />
      <QuickActions
        onLogMeal={() => router.push('/meal/log')}
        onLogWater={() => logWater.mutate(WATER_INCREMENT_ML)}
        onStartWorkout={() => router.push('/(tabs)/training')}
        onLogWeight={() => router.push('/(tabs)/progress')}
      />
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  greetingBlock: {
    flex: 1,
  },
  greeting: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
  },
  date: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  workoutSkeleton: {
    marginBottom: theme.spacing.xl,
  },
  emptyWorkout: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.xl,
  },
  gridRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'stretch',
  },
  gridColumn: {
    flexDirection: 'column',
  },
  calorieContainer: {
    flex: 1,
  },
  smallStatsContainer: {
    flex: 1,
    gap: theme.spacing.md,
  },
  smallStatsStacked: {
    flexDirection: 'row',
  },
  goalNote: {
    ...theme.typography.bodyXs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  sectionSpacing: {
    height: theme.spacing.xl,
  },
}));
