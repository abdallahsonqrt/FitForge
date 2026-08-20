import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { ProgressBar } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import type { FitnessGoal } from '../../src/features/users/types';

export default function FitnessGoalScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { data, setField } = useOnboardingStore();

  const handleSelect = (goal: FitnessGoal) => {
    setField('fitnessGoal', goal);
    router.push('/(onboarding)/sport');
  };

  // Ids match the API's `fitness_goal` enum — they drive the calorie target.
  const goals: { id: FitnessGoal; title: string; description: string }[] = [
    { id: 'weight_loss', title: t('onboarding.goal.loseWeight'), description: t('onboarding.goal.loseWeightHint') },
    { id: 'muscle_gain', title: t('onboarding.goal.buildMuscle'), description: t('onboarding.goal.buildMuscleHint') },
    { id: 'maintenance', title: t('onboarding.goal.keepFit'), description: t('onboarding.goal.keepFitHint') },
    { id: 'endurance', title: t('onboarding.goal.endurance'), description: t('onboarding.goal.enduranceHint') },
  ];

  return (
    <ScreenContainer>
      <ProgressBar progress={5 / 13} height={4} color={theme.colors.primary} />
      
      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.goal.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.goal.subtitle')}</Text>
      </View>

      <View style={styles.options}>
        {goals.map((goal) => (
          <Pressable
            key={goal.id}
            style={[styles.optionCard, data.fitnessGoal === goal.id && styles.optionCardSelected]}
            onPress={() => handleSelect(goal.id)}
            accessibilityRole="radio"
            accessibilityLabel={`${goal.title}. ${goal.description}`}
            accessibilityState={{ selected: data.fitnessGoal === goal.id }}
          >
            <Text style={[styles.optionTitle, data.fitnessGoal === goal.id && styles.optionTitleSelected]}>
              {goal.title}
            </Text>
            <Text style={[styles.optionDesc, data.fitnessGoal === goal.id && styles.optionDescSelected]}>
              {goal.description}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  header: {
    marginTop: theme.spacing['2xl'],
    marginBottom: theme.spacing['3xl'],
  },
  title: {
    ...theme.typography.displayMd,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...theme.typography.bodyLg,
    color: theme.colors.textSecondary,
  },
  options: {
    gap: theme.spacing.md,
  },
  optionCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  optionCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: `${theme.colors.primary}10`,
  },
  optionTitle: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  optionTitleSelected: {
    color: theme.colors.primary,
  },
  optionDesc: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
  },
  optionDescSelected: {
    color: theme.colors.primary, // Could be adjusted based on design
  },
}));
