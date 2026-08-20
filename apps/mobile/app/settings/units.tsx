import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Scale, Ruler } from 'lucide-react-native';
import { usePreferencesStore, type UnitPreference } from '../../src/store/preferencesStore';
import { useMe } from '../../src/features/users/api/useMe';

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;

const formatHeight = (heightCm: number, units: UnitPreference) => {
  if (units === 'metric') return `${Math.round(heightCm)} cm`;
  const totalInches = heightCm / CM_PER_INCH;
  return `${Math.floor(totalInches / 12)}'${Math.round(totalInches % 12)}"`;
};

const formatWeight = (weightKg: number, units: UnitPreference) =>
  units === 'metric' ? `${weightKg.toFixed(1)} kg` : `${(weightKg / KG_PER_LB).toFixed(1)} lbs`;

export default function UnitsScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const units = usePreferencesStore((state) => state.units);
  const setUnits = usePreferencesStore((state) => state.setUnits);
  const me = useMe();

  // Preview the user's own numbers rather than invented sample values.
  const weightKg = me.data?.weightKg ?? null;
  const heightCm = me.data?.heightCm ?? null;

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.toggleContainer}>
        {(['metric', 'imperial'] as const).map((option) => (
          <Pressable
            key={option}
            style={[styles.toggleBtn, units === option && styles.toggleBtnActive]}
            onPress={() => setUnits(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected: units === option }}
          >
            <Text style={[styles.toggleText, units === option && styles.toggleTextActive]}>
              {option === 'metric' ? t('settings.units.metric') : t('settings.units.imperial')}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.previewHeader}>Your measurements</Text>

      <View style={styles.previewCard}>
        <View style={styles.previewRow}>
          <View style={styles.previewIconWrap}>
            <Scale size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewLabel}>Weight</Text>
            <Text style={styles.previewValue}>
              {weightKg !== null ? formatWeight(weightKg, units) : 'Not set'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.previewRow}>
          <View style={styles.previewIconWrap}>
            <Ruler size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewLabel}>Height</Text>
            <Text style={styles.previewValue}>
              {heightCm !== null ? formatHeight(heightCm, units) : 'Not set'}
            </Text>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  content: {},
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xs,
    marginBottom: theme.spacing['2xl'],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.borderRadius.md,
  },
  toggleBtnActive: { backgroundColor: theme.colors.primary },
  toggleText: { color: theme.colors.textSecondary, ...theme.typography.labelMd },
  toggleTextActive: { color: theme.colors.onPrimary },
  previewHeader: {
    color: theme.colors.text,
    ...theme.typography.headingMd,
    marginBottom: theme.spacing.md,
  },
  previewCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.sm },
  previewIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  previewInfo: { flex: 1 },
  previewLabel: { color: theme.colors.textSecondary, ...theme.typography.bodySm },
  previewValue: {
    color: theme.colors.text,
    ...theme.typography.headingMd,
    marginTop: theme.spacing.xs,
  },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.sm },
}));
