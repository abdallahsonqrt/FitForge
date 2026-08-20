import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Clock } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { Button, ProgressBar } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';

const DURATIONS = [15, 20, 30, 45, 60, 90];

/**
 * Pre-selected so this step can never block anyone: continuing without touching
 * anything still records a usable answer. Programs longer than the recorded
 * session length are a poor match, so a missing value is worse than a default.
 */
const DEFAULT_MINUTES = 45;

export default function SessionDurationScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { data, setField } = useOnboardingStore();

  const selected = data.sessionDurationMinutes ?? DEFAULT_MINUTES;

  const handleContinue = () => {
    setField('sessionDurationMinutes', selected);
    router.push('/(onboarding)/workout-frequency');
  };

  return (
    <ScreenContainer>
      <ProgressBar progress={12 / 13} height={4} color={theme.colors.primary} />

      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.duration.title')}</Text>
        <Text style={styles.subtitle}>
          {t('onboarding.duration.subtitle')}
        </Text>
      </View>

      <View style={styles.noteCard}>
        <Clock size={24} color={theme.colors.primary} />
        <Text style={styles.noteText}>
          {t('onboarding.duration.note')}
        </Text>
      </View>

      <View style={styles.options}>
        {DURATIONS.map((minutes) => {
          const isSelected = selected === minutes;
          return (
            <Pressable
              key={minutes}
              style={[styles.durationPill, isSelected && styles.durationPillSelected]}
              onPress={() => setField('sessionDurationMinutes', minutes)}
              accessibilityRole="radio"
              accessibilityLabel={`${minutes} minutes per session`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.durationValue, isSelected && styles.durationValueSelected]}>
                {minutes}
              </Text>
              <Text style={[styles.durationUnit, isSelected && styles.durationValueSelected]}>min</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.spacer} />

      <Button title={t('common.continue')} onPress={handleContinue} style={styles.button} />
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
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceElevated,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing['2xl'],
  },
  noteText: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  durationPill: {
    minWidth: 96,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  durationPillSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  durationValue: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
  },
  durationUnit: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
  durationValueSelected: {
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
