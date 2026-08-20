import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { ProgressBar } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import type { ExperienceLevel } from '../../src/features/users/types';

export default function ExperienceLevelScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { data, setField } = useOnboardingStore();

  const handleSelect = (level: ExperienceLevel) => {
    setField('experienceLevel', level);
    router.push('/(onboarding)/training-location');
  };

  const levels: { id: ExperienceLevel; title: string; description: string }[] = [
    { id: 'beginner', title: t('onboarding.experience.beginner'), description: 'I am new to fitness training' },
    { id: 'intermediate', title: t('onboarding.experience.intermediate'), description: 'I have been training regularly for a few months' },
    { id: 'advanced', title: t('onboarding.experience.advanced'), description: 'I am an experienced athlete' },
  ];

  return (
    <ScreenContainer>
      <ProgressBar progress={7 / 13} height={4} color={theme.colors.primary} />
      
      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.experience.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.experience.subtitle')}</Text>
      </View>

      <View style={styles.options}>
        {levels.map((level) => (
          <Pressable
            key={level.id}
            style={[styles.optionCard, data.experienceLevel === level.id && styles.optionCardSelected]}
            onPress={() => handleSelect(level.id)}
            accessibilityRole="radio"
            accessibilityLabel={`${level.title}. ${level.description}`}
            accessibilityState={{ selected: data.experienceLevel === level.id }}
          >
            <Text style={[styles.optionTitle, data.experienceLevel === level.id && styles.optionTitleSelected]}>
              {level.title}
            </Text>
            <Text style={[styles.optionDesc, data.experienceLevel === level.id && styles.optionDescSelected]}>
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
