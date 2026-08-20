import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation, type TranslationKey } from '../../src/i18n';
import { Button, ProgressBar } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';

/**
 * Slugs are what the API stores and what coach/program matching compares
 * against, so they must stay stable; the labels are display-only.
 */
const SPORTS: { slug: string; labelKey: TranslationKey }[] = [
  { slug: 'general-fitness', labelKey: 'onboarding.sport.generalFitness' },
  { slug: 'calisthenics', labelKey: 'onboarding.sport.calisthenics' },
  { slug: 'bodybuilding', labelKey: 'onboarding.sport.bodybuilding' },
  { slug: 'powerlifting', labelKey: 'onboarding.sport.powerlifting' },
  { slug: 'weightlifting', labelKey: 'onboarding.sport.weightlifting' },
  { slug: 'crossfit', labelKey: 'onboarding.sport.crossfit' },
  { slug: 'running', labelKey: 'onboarding.sport.running' },
  { slug: 'cycling', labelKey: 'onboarding.sport.cycling' },
  { slug: 'swimming', labelKey: 'onboarding.sport.swimming' },
  { slug: 'boxing', labelKey: 'onboarding.sport.boxing' },
  { slug: 'martial-arts', labelKey: 'onboarding.sport.martialArts' },
  { slug: 'football', labelKey: 'onboarding.sport.football' },
  { slug: 'basketball', labelKey: 'onboarding.sport.basketball' },
  { slug: 'yoga', labelKey: 'onboarding.sport.yoga' },
];

export default function SportScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { data, setField } = useOnboardingStore();

  const handleContinue = () => {
    router.push('/(onboarding)/experience-level');
  };

  return (
    <ScreenContainer>
      <ProgressBar progress={6 / 13} height={4} color={theme.colors.primary} />

      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.sport.title')}</Text>
        <Text style={styles.subtitle}>
          {t('onboarding.sport.subtitle')}
        </Text>
      </View>

      <View style={styles.chipGrid}>
        {SPORTS.map((sport) => {
          const isSelected = data.sport === sport.slug;
          return (
            <Pressable
              key={sport.slug}
              style={[styles.chip, isSelected && styles.chipSelected]}
              // Tapping the chosen option again clears it, so nobody is locked
              // into an answer they only meant to look at.
              onPress={() => setField('sport', isSelected ? null : sport.slug)}
              accessibilityRole="radio"
              accessibilityLabel={t(sport.labelKey)}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {t(sport.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.spacer} />

      <Button
        title={data.sport ? t('common.continue') : t('onboarding.skipForNow')}
        onPress={handleContinue}
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
    ...theme.typography.displayMd,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...theme.typography.bodyLg,
    color: theme.colors.textSecondary,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  chipText: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
  },
  chipTextSelected: {
    ...theme.typography.bodyMd,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  spacer: {
    flex: 1,
    minHeight: theme.spacing['2xl'],
  },
  button: {
    marginBottom: theme.spacing.xl,
  },
}));
