import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Award, Dumbbell, Flame, Scale } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { SectionHeader } from '../../src/components/layout/SectionHeader';
import { WeightChart } from '../../src/components/progress/WeightChart';
import { WorkoutHistory } from '../../src/components/progress/WorkoutHistory';
import { StreakCalendar } from '../../src/components/progress/StreakCalendar';
import { BadgeGrid } from '../../src/components/progress/BadgeGrid';
import { Button, ErrorState, Input, Modal, Skeleton } from '../../src/components/ui';
import { useLogWeight, useWeightLogs } from '../../src/features/progress/api/useWeightLogs';
import { useBadges, useStreak, useWorkoutHistory } from '../../src/features/progress/api/useStreaks';
import { usePlans } from '../../src/features/training/api/usePlans';
import { usePreferencesStore } from '../../src/store/preferencesStore';
import { getApiErrorMessage } from '../../src/lib/api';
import { toDateKey } from '../../src/utils/date';
import { useTranslation } from '../../src/i18n';

const KG_PER_LB = 0.45359237;

export default function ProgressScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const weightLogs = useWeightLogs();
  const workouts = useWorkoutHistory();
  const badges = useBadges();
  const streak = useStreak();
  const plans = usePlans();
  const logWeight = useLogWeight();

  const units = usePreferencesStore((state) => state.units);
  const weightUnit = units === 'imperial' ? 'lbs' : 'kg';

  const [isLogging, setIsLogging] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [inputError, setInputError] = useState<string | undefined>();

  // Stored in kg; convert only at the display and submit boundaries.
  const chartData = useMemo(
    () =>
      (weightLogs.data ?? []).map((log) => ({
        date: log.date,
        weight: weightUnit === 'lbs' ? log.weightKg / KG_PER_LB : log.weightKg,
      })),
    [weightLogs.data, weightUnit],
  );

  const activeDates = useMemo(
    () => [...new Set((workouts.data ?? []).map((log) => toDateKey(new Date(log.completedAt))))],
    [workouts.data],
  );

  const planNames = useMemo(
    () => Object.fromEntries((plans.data ?? []).map((plan) => [plan.id, plan.name])),
    [plans.data],
  );

  const isRefreshing =
    weightLogs.isFetching || workouts.isFetching || badges.isFetching || streak.isFetching;

  const refreshAll = () => {
    weightLogs.refetch();
    workouts.refetch();
    badges.refetch();
    streak.refetch();
  };

  const submitWeight = () => {
    const value = Number(weightInput.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setInputError('Enter a valid weight.');
      return;
    }

    logWeight.mutate(
      { weight: value, unit: weightUnit },
      {
        onSuccess: () => {
          setIsLogging(false);
          setWeightInput('');
          setInputError(undefined);
        },
        onError: (error) => setInputError(getApiErrorMessage(error, 'Could not save your weight.')),
      },
    );
  };

  // A failed load previously rendered as "No badges yet" and an empty chart.
  const loadError = weightLogs.isError ? weightLogs.error : workouts.isError ? workouts.error : null;
  if (loadError) {
    return (
      <ScreenContainer insideTabs onRefresh={refreshAll} refreshing={isRefreshing}>
        <ErrorState
          message={getApiErrorMessage(loadError, t('common.somethingWentWrong'))}
          onRetry={refreshAll}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer insideTabs onRefresh={refreshAll} refreshing={isRefreshing}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('progress.title')}</Text>
          <Text style={styles.subtitle}>{t('progress.tagline')}</Text>
        </View>
        <Button
          title={t('progress.logWeight')}
          size="sm"
          icon={<Scale size={16} color={theme.colors.onPrimary} />}
          onPress={() => setIsLogging(true)}
        />
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryIntro}>
          <View style={styles.summaryIcon}>
            <Flame size={22} color={theme.colors.warning} />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>{t('progress.keepMomentum')}</Text>
            <Text style={styles.summaryText}>
              {streak.data?.currentStreak
                ? `You have trained ${streak.data.currentStreak} day${streak.data.currentStreak === 1 ? '' : 's'} in a row.`
                : 'Complete a workout today to start a streak.'}
            </Text>
          </View>
        </View>
        <View style={styles.summaryStats}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{streak.data?.currentStreak ?? 0}</Text>
            <Text style={styles.summaryLabel}>{t('progress.currentStreak')}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{streak.data?.longestStreak ?? 0}</Text>
            <Text style={styles.summaryLabel}>{t('progress.bestStreak')}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Dumbbell size={18} color={theme.colors.primary} />
            <Text style={styles.summaryValue}>{workouts.data?.length ?? 0}</Text>
            <Text style={styles.summaryLabel}>{t('progress.workouts')}</Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionSpacing} />

      {weightLogs.isLoading ? <Skeleton height={220} /> : <WeightChart data={chartData} unit={weightUnit} />}

      <View style={styles.sectionSpacing} />

      <StreakCalendar activeDates={activeDates} />

      <View style={styles.sectionSpacing} />

      <SectionHeader title={t('progress.achievements')} />
      {badges.isLoading ? (
        <Skeleton height={110} />
      ) : (badges.data ?? []).length === 0 ? (
        <View style={styles.emptyCard}>
          <Award size={28} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>
            No badges yet — finish a workout to earn your first one.
          </Text>
        </View>
      ) : (
        <BadgeGrid badges={badges.data ?? []} />
      )}

      <View style={styles.sectionSpacing} />

      {workouts.isLoading ? (
        <Skeleton height={160} />
      ) : (
        <WorkoutHistory sessions={workouts.data ?? []} planNames={planNames} />
      )}

      <Modal visible={isLogging} onClose={() => setIsLogging(false)}>
        <Text style={styles.modalTitle}>{t('progress.logYourWeight')}</Text>
        <Input
          label={`Weight (${weightUnit})`}
          value={weightInput}
          onChangeText={(value) => {
            setWeightInput(value);
            setInputError(undefined);
          }}
          error={inputError}
          keyboardType="decimal-pad"
          placeholder={weightUnit === 'lbs' ? '165' : '75'}
          autoFocus
          onSubmitEditing={submitWeight}
        />
        <Button title={t('common.save')} onPress={submitWeight} loading={logWeight.isPending} />
      </Modal>
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...theme.typography.displaySm,
    color: theme.colors.text,
  },
  subtitle: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  sectionSpacing: {
    height: theme.spacing.xl,
  },
  summaryCard: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  summaryIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCopy: {
    flex: 1,
  },
  summaryTitle: {
    ...theme.typography.labelLg,
    color: theme.colors.text,
  },
  summaryText: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    ...theme.typography.headingMd,
    color: theme.colors.text,
  },
  summaryLabel: {
    ...theme.typography.bodyXs,
    color: theme.colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 34,
    backgroundColor: theme.colors.border,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  emptyText: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  modalTitle: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
}));
