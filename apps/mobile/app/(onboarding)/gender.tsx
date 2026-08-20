import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation, type TranslationKey } from '../../src/i18n';
import { ProgressBar } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import type { Gender } from '../../src/features/users/types';

// Values match the API's `gender` enum; labels are display-only.
const OPTIONS: { value: Gender; labelKey: TranslationKey }[] = [
  { value: 'male', labelKey: 'onboarding.gender.male' },
  { value: 'female', labelKey: 'onboarding.gender.female' },
  { value: 'other', labelKey: 'onboarding.gender.other' },
];

export default function GenderScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { data, setField } = useOnboardingStore();

  const handleSelect = (gender: Gender) => {
    setField('gender', gender);
    router.push('/(onboarding)/age');
  };

  return (
    <ScreenContainer>
      <ProgressBar progress={1 / 13} height={4} color={theme.colors.primary} />
      
      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.gender.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.gender.subtitle')}</Text>
      </View>

      <View style={styles.options}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.optionCard, data.gender === option.value && styles.optionCardSelected]}
            onPress={() => handleSelect(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: data.gender === option.value }}
          >
            <Text style={[styles.optionText, data.gender === option.value && styles.optionTextSelected]}>
              {t(option.labelKey)}
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
    gap: theme.spacing.lg,
  },
  optionCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  optionCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: `${theme.colors.primary}10`,
  },
  optionText: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
  },
  optionTextSelected: {
    color: theme.colors.primary,
  },
}));
