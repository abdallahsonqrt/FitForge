import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { useRouter } from 'expo-router';
import { Activity, AlertCircle } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation, type TranslationKey } from '../../src/i18n';
import { Button, ProgressBar } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import { useCompleteOnboarding } from '../../src/features/users/api/useMe';
import { getApiErrorMessage } from '../../src/lib/api';
import type { FitnessGoal } from '../../src/features/users/types';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Guidance shown above the picker, matched to the goal chosen earlier in the flow. */
const RECOMMENDATION: Record<FitnessGoal, { titleKey: TranslationKey; textKey: TranslationKey }> = {
  weight_loss: {
    titleKey: 'onboarding.frequency.recommendedWeightLoss',
    textKey: 'onboarding.frequency.textWeightLoss',
  },
  muscle_gain: {
    titleKey: 'onboarding.frequency.recommendedMuscleGain',
    textKey: 'onboarding.frequency.textMuscleGain',
  },
  maintenance: {
    titleKey: 'onboarding.frequency.recommendedKeepFit',
    textKey: 'onboarding.frequency.textKeepFit',
  },
  endurance: {
    titleKey: 'onboarding.frequency.recommendedEndurance',
    textKey: 'onboarding.frequency.textEndurance',
  },
};

export default function WorkoutFrequencyScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const router = useRouter();

  const { data, setField, toPayload, reset } = useOnboardingStore();
  const completeOnboarding = useCompleteOnboarding();
  const [selectedDays, setSelectedDays] = useState<number | null>(data.workoutFrequency);

  const recommendation = RECOMMENDATION[data.fitnessGoal ?? 'maintenance'];

  const handleComplete = () => {
    if (!selectedDays) return;
    setField('workoutFrequency', selectedDays);

    // Persist the whole profile in one call, then clear the draft.
    completeOnboarding.mutate(
      { ...toPayload(), workoutFrequency: selectedDays },
      {
        onSuccess: () => {
          reset();
          router.replace('/(tabs)/home');
        },
      },
    );
  };

  return (
    <ScreenContainer>
      <ProgressBar progress={1} height={4} color={theme.colors.primary} />

      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.frequency.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.frequency.subtitle')}</Text>
      </View>

      <View style={styles.recommendationCard}>
        <Activity size={24} color={theme.colors.primary} />
        <View style={styles.recommendationTextContainer}>
          <Text style={styles.recommendationTitle}>{t(recommendation.titleKey)}</Text>
          <Text style={styles.recommendationText}>{t(recommendation.textKey)}</Text>
        </View>
      </View>

      <View style={styles.daysContainer}>
        {DAYS.map((day) => (
          <Pressable
            key={day}
            style={[styles.dayCircle, selectedDays === day && styles.dayCircleSelected]}
            onPress={() => setSelectedDays(day)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedDays === day }}
          >
            <Text style={[styles.dayText, selectedDays === day && styles.dayTextSelected]}>{day}</Text>
          </Pressable>
        ))}
      </View>

      {completeOnboarding.isError && (
        <View style={styles.errorBanner}>
          <AlertCircle size={18} color={theme.colors.error} />
          <Text style={styles.errorText}>
            {getApiErrorMessage(completeOnboarding.error, t('onboarding.frequency.saveFailed'))}
          </Text>
        </View>
      )}

      <View style={styles.spacer} />

      <Button
        title={t('onboarding.completeSetup')}
        onPress={handleComplete}
        disabled={!selectedDays}
        loading={completeOnboarding.isPending}
        style={styles.button}
      />
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  header: {
    marginTop: theme.spacing['2xl'],
    marginBottom: theme.spacing.xl,
  },
  title: {
    color: theme.colors.text,
    ...theme.typography.displayMd,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodyLg,
  },
  recommendationCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceElevated,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    marginBottom: theme.spacing['2xl'],
  },
  recommendationTextContainer: {
    marginLeft: theme.spacing.md,
    flex: 1,
  },
  recommendationTitle: {
    color: theme.colors.primary,
    ...theme.typography.labelMd,
    marginBottom: theme.spacing.xs,
  },
  recommendationText: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySm,
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  dayCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircleSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  dayText: {
    color: theme.colors.text,
    ...theme.typography.headingLg,
  },
  dayTextSelected: {
    color: theme.colors.primary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.errorSoft,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  errorText: {
    ...theme.typography.bodySm,
    color: theme.colors.error,
    flex: 1,
  },
  spacer: {
    flex: 1,
    minHeight: theme.spacing['2xl'],
  },
  button: {
    marginBottom: theme.spacing.xl,
  },
}));
