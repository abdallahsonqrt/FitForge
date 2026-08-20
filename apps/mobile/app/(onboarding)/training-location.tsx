import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation, type TranslationKey } from '../../src/i18n';
import { Button, ProgressBar } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import type { TrainingLocation } from '../../src/features/users/types';

// Ids match the API's `training_location` enum; a coach or program records the
// set of locations it supports, so this is a direct comparison.
const LOCATIONS: { id: TrainingLocation; titleKey: TranslationKey; descriptionKey: TranslationKey }[] = [
  { id: 'home', titleKey: 'onboarding.location.home', descriptionKey: 'onboarding.location.homeHint' },
  { id: 'gym', titleKey: 'onboarding.location.gym', descriptionKey: 'onboarding.location.gymHint' },
  { id: 'outdoors', titleKey: 'onboarding.location.outdoors', descriptionKey: 'onboarding.location.outdoorsHint' },
];

export default function TrainingLocationScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { data, setField } = useOnboardingStore();

  const handleContinue = () => {
    router.push('/(onboarding)/equipment');
  };

  return (
    <ScreenContainer>
      <ProgressBar progress={8 / 13} height={4} color={theme.colors.primary} />

      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.location.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.location.subtitle')}</Text>
      </View>

      <View style={styles.options}>
        {LOCATIONS.map((location) => {
          const isSelected = data.trainingLocation === location.id;
          return (
            <Pressable
              key={location.id}
              style={[styles.optionCard, isSelected && styles.optionCardSelected]}
              onPress={() => setField('trainingLocation', isSelected ? null : location.id)}
              accessibilityRole="radio"
              accessibilityLabel={`${t(location.titleKey)}. ${t(location.descriptionKey)}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.optionTitle, isSelected && styles.optionTitleSelected]}>
                {t(location.titleKey)}
              </Text>
              <Text style={[styles.optionDesc, isSelected && styles.optionDescSelected]}>
                {t(location.descriptionKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.spacer} />

      <Button
        title={data.trainingLocation ? t('common.continue') : t('onboarding.skipForNow')}
        onPress={handleContinue}
        style={styles.button}
      />
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
  spacer: {
    flex: 1,
    minHeight: theme.spacing['2xl'],
  },
  button: {
    marginBottom: theme.spacing.xl,
  },
}));
