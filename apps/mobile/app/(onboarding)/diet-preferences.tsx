import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useResponsiveContent } from '../../src/components/layout/useResponsiveContent';
import { useTranslation, type TranslationKey } from '../../src/i18n';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ProgressBar } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';

const DIET_OPTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'Omnivore', labelKey: 'onboarding.diet.omnivore' },
  { value: 'Vegetarian', labelKey: 'onboarding.diet.vegetarian' },
  { value: 'Vegan', labelKey: 'onboarding.diet.vegan' },
  { value: 'Pescatarian', labelKey: 'onboarding.diet.pescatarian' },
  { value: 'Keto', labelKey: 'onboarding.diet.keto' },
  { value: 'Paleo', labelKey: 'onboarding.diet.paleo' },
  { value: 'Mediterranean', labelKey: 'onboarding.diet.mediterranean' },
  { value: 'Gluten-Free', labelKey: 'onboarding.diet.glutenFree' },
  { value: 'Dairy-Free', labelKey: 'onboarding.diet.dairyFree' },
  { value: 'No Preference', labelKey: 'onboarding.diet.noPreference' },
];

export default function DietPreferencesScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const responsiveContent = useResponsiveContent({ withPadding: false });
  const router = useRouter();
  const { data, setField } = useOnboardingStore();
  const [selected, setSelected] = useState<string[]>(data.dietPreferences);

  const toggleSelection = (option: string) => {
    if (option === 'No Preference') {
      setSelected(['No Preference']);
      return;
    }
    setSelected(prev => {
      const newSel = prev.filter(p => p !== 'No Preference');
      if (newSel.includes(option)) {
        return newSel.filter(item => item !== option);
      } else {
        return [...newSel, option];
      }
    });
  };

  const handleContinue = () => {
    setField('dietPreferences', selected);
    router.push('/(onboarding)/session-duration');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.container, responsiveContent]}>
        <ProgressBar progress={11 / 13} height={4} color={theme.colors.primary} />

        <View style={styles.header}>
          <Text style={styles.title}>{t('onboarding.diet.title')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.diet.subtitle')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.chipGrid}>
            {DIET_OPTIONS.map(option => {
              const isSelected = selected.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => toggleSelection(option.value)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityLabel={t(option.labelKey)}
                  accessibilityState={{ checked: isSelected, selected: isSelected }}
                >
                  {isSelected && <Check size={16} color={theme.colors.primary} style={styles.checkIcon} />}
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                    {t(option.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.button, selected.length === 0 && styles.buttonDisabled]} 
            onPress={handleContinue}
            disabled={selected.length === 0}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    padding: theme.spacing.md,
  },
  header: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing['2xl'],
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
  scrollContent: {
    paddingBottom: theme.spacing['2xl'],
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryGlow,
  },
  checkIcon: {
    marginRight: theme.spacing.xs,
  },
  chipText: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodyMd,
  },
  chipTextSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  footer: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: theme.colors.background,
    ...theme.typography.headingMd,
  },
}));
