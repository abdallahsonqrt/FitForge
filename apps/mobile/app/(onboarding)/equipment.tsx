import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Check } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation, type TranslationKey } from '../../src/i18n';
import { Button, ProgressBar } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import type { EquipmentSlug } from '../../src/features/users/types';

/**
 * "Just my bodyweight" is a real answer, not the absence of one — a beginner
 * training calisthenics at home with a pull-up bar is exactly who this flow is
 * for. It gets its own card above the grid and clears the rest when chosen, so
 * "bodyweight only" is unambiguous to the matching logic.
 */
const BODYWEIGHT: EquipmentSlug = 'bodyweight';

// Slugs mirror `equipment.slug` on the API; the labels are display-only.
const EQUIPMENT: { slug: EquipmentSlug; labelKey: TranslationKey }[] = [
  { slug: 'pull-up-bar', labelKey: 'onboarding.equipment.pullUpBar' },
  { slug: 'parallel-bars', labelKey: 'onboarding.equipment.parallelBars' },
  { slug: 'resistance-bands', labelKey: 'onboarding.equipment.bands' },
  { slug: 'dumbbells', labelKey: 'onboarding.equipment.dumbbells' },
  { slug: 'kettlebell', labelKey: 'onboarding.equipment.kettlebell' },
  { slug: 'barbell', labelKey: 'onboarding.equipment.barbell' },
  { slug: 'bench', labelKey: 'onboarding.equipment.bench' },
  { slug: 'gym-access', labelKey: 'onboarding.equipment.fullGym' },
];

export default function EquipmentScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { data, setField } = useOnboardingStore();

  const selected = data.availableEquipment;
  const bodyweightOnly = selected.length === 1 && selected[0] === BODYWEIGHT;

  const toggleBodyweight = () => {
    setField('availableEquipment', bodyweightOnly ? [] : [BODYWEIGHT]);
  };

  const toggleItem = (slug: EquipmentSlug) => {
    // Any real kit means this is no longer a bodyweight-only setup.
    const withoutBodyweight = selected.filter((item) => item !== BODYWEIGHT);
    setField(
      'availableEquipment',
      withoutBodyweight.includes(slug)
        ? withoutBodyweight.filter((item) => item !== slug)
        : [...withoutBodyweight, slug],
    );
  };

  const handleContinue = () => {
    router.push('/(onboarding)/activity-level');
  };

  return (
    <ScreenContainer>
      <ProgressBar progress={9 / 13} height={4} color={theme.colors.primary} />

      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.equipment.title')}</Text>
        <Text style={styles.subtitle}>
          {t('onboarding.equipment.body')}
        </Text>
      </View>

      <Pressable
        style={[styles.bodyweightCard, bodyweightOnly && styles.bodyweightCardSelected]}
        onPress={toggleBodyweight}
        accessibilityRole="checkbox"
        accessibilityLabel="Just my bodyweight. No equipment needed."
        accessibilityState={{ checked: bodyweightOnly, selected: bodyweightOnly }}
      >
        <View style={styles.bodyweightTextContainer}>
          <Text style={[styles.bodyweightTitle, bodyweightOnly && styles.selectedText]}>
            Just my bodyweight
          </Text>
          <Text style={[styles.bodyweightDesc, bodyweightOnly && styles.selectedText]}>
            No equipment at all. This is a great place to start.
          </Text>
        </View>
        {bodyweightOnly && <Check size={20} color={theme.colors.primary} />}
      </Pressable>

      <Text style={styles.groupLabel}>Or tell us what you have</Text>

      <View style={styles.chipGrid}>
        {EQUIPMENT.map((item) => {
          const isSelected = selected.includes(item.slug);
          return (
            <Pressable
              key={item.slug}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => toggleItem(item.slug)}
              accessibilityRole="checkbox"
              accessibilityLabel={t(item.labelKey)}
              accessibilityState={{ checked: isSelected, selected: isSelected }}
            >
              {isSelected && <Check size={16} color={theme.colors.primary} style={styles.checkIcon} />}
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {t(item.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.spacer} />

      <Button
        title={selected.length > 0 ? t('common.continue') : t('onboarding.skipForNow')}
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
  bodyweightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  bodyweightCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: `${theme.colors.primary}10`,
  },
  bodyweightTextContainer: {
    flex: 1,
  },
  bodyweightTitle: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  bodyweightDesc: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
  },
  selectedText: {
    color: theme.colors.primary,
  },
  groupLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
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
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  checkIcon: {
    marginRight: theme.spacing.xs,
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
