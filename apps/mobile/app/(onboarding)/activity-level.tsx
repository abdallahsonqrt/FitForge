import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { ProgressBar } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import type { ActivityLevel } from '../../src/features/users/types';

export default function ActivityLevelScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { data, setField } = useOnboardingStore();

  const handleSelect = (level: ActivityLevel) => {
    setField('activityLevel', level);
    router.push('/(onboarding)/diet-preferences');
  };

  // Ids match the API's `activity_level` enum — they scale the calorie target.
  const levels: { id: ActivityLevel; title: string; description: string }[] = [
    { id: 'sedentary', title: t('onboarding.activity.sedentary'), description: t('onboarding.activity.sedentaryHint') },
    { id: 'lightly_active', title: t('onboarding.activity.light'), description: t('onboarding.activity.lightHint') },
    { id: 'moderately_active', title: t('onboarding.activity.moderate'), description: t('onboarding.activity.moderateHint') },
    { id: 'very_active', title: t('onboarding.activity.very'), description: t('onboarding.activity.veryHint') },
    { id: 'extra_active', title: t('onboarding.activity.extreme'), description: t('onboarding.activity.extremeHint') },
  ];

  return (
    <ScreenContainer>
      <ProgressBar progress={10 / 13} height={4} color={theme.colors.primary} />
      
      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.activity.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.activity.subtitle')}</Text>
      </View>

      <View style={styles.options}>
        {levels.map((level) => (
          <Pressable
            key={level.id}
            style={[styles.optionCard, data.activityLevel === level.id && styles.optionCardSelected]}
            onPress={() => handleSelect(level.id)}
            accessibilityRole="radio"
            accessibilityLabel={`${level.title}. ${level.description}`}
            accessibilityState={{ selected: data.activityLevel === level.id }}
          >
            <Text style={[styles.optionTitle, data.activityLevel === level.id && styles.optionTitleSelected]}>
              {level.title}
            </Text>
            <Text style={[styles.optionDesc, data.activityLevel === level.id && styles.optionDescSelected]}>
              {level.description}
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
    color: theme.colors.primary,
  },
}));
