import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Check, Minus } from 'lucide-react-native';
import type { Entitlements } from '../../features/subscription/types';

export interface ComparisonPlan {
  id: string;
  name: string;
  entitlements: Entitlements;
}

interface FeatureComparisonProps {
  plans: ComparisonPlan[];
}

/**
 * What each tier includes, side by side.
 *
 * Rows are read off the entitlements the API resolved, so the table has no
 * knowledge of tier names — adding a tier or changing what one includes needs no
 * change here, and a legacy subscriber sees the tier they were bridged to.
 */
const ROWS: { label: string; included: (entitlements: Entitlements) => boolean }[] = [
  { label: 'Full program access', included: (e) => e.programAccess === 'full' },
  { label: 'AI workout & nutrition support', included: (e) => e.aiLogLimit !== 0 },
  { label: 'Direct coach messaging', included: (e) => e.coachAccess !== 'none' },
  { label: 'Scheduled check-ins', included: (e) => e.scheduledCheckIns },
  { label: 'Personalised plan updates', included: (e) => e.personalisedPlanUpdates },
  { label: 'Priority coach responses', included: (e) => e.coachAccess === 'priority' },
  { label: 'Video form reviews', included: (e) => e.formReviews },
];

export const FeatureComparison: React.FC<FeatureComparisonProps> = ({ plans }) => {
  const { styles, theme } = useStyles(stylesheet);

  const renderIcon = (included: boolean) =>
    included ? (
      <Check size={18} color={theme.colors.success} />
    ) : (
      <Minus size={18} color={theme.colors.border} />
    );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerText, styles.colFeature]}>What you get</Text>
        {plans.map((plan) => (
          <Text key={plan.id} style={[styles.headerText, styles.colTier]} numberOfLines={2}>
            {plan.name}
          </Text>
        ))}
      </View>

      {ROWS.map((row, i) => (
        <View key={row.label} style={[styles.row, i % 2 === 0 && styles.rowAlt]}>
          <Text style={[styles.featureText, styles.colFeature]}>{row.label}</Text>
          {plans.map((plan) => (
            <View key={plan.id} style={styles.colTier}>
              {renderIcon(row.included(plan.entitlements))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerText: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  rowAlt: {
    // A white wash is invisible on the light theme's white surface, so the
    // striping only ever showed in dark mode. The token carries a real value
    // in both themes.
    backgroundColor: theme.colors.surfaceElevated,
  },
  colFeature: {
    flex: 2.4,
    paddingRight: theme.spacing.sm,
  },
  colTier: {
    flex: 1,
    alignItems: 'center',
  },
  featureText: {
    ...theme.typography.bodySm,
    color: theme.colors.text,
  },
}));
