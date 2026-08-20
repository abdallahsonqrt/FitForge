import React from 'react';
import { View, Text } from 'react-native';
import { ScreenContainer } from '../src/components/layout/ScreenContainer';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Info, MessageCircle } from 'lucide-react-native';
import { ErrorState, SkeletonList } from '../src/components/ui';
import { PlanCard } from '../src/components/subscription/PlanCard';
import { FeatureComparison } from '../src/components/subscription/FeatureComparison';
import {
  useEntitlements,
  useSubscriptionPlans,
  useUpgradeSubscription,
} from '../src/features/subscription/api/useSubscription';
import {
  MOCK_PRICING_NOTE,
  tierRank,
  type SubscriptionPlan,
} from '../src/features/subscription/types';
import { getApiErrorMessage } from '../src/lib/api';
import { showAlert } from '../src/lib/alert';

/**
 * The paywall.
 *
 * Every decision here — which plan is current, which is a downgrade, which is
 * recommended — reads the entitlements the API resolved rather than comparing
 * tier names, so legacy `pro`/`elite` subscribers land in the right place and a
 * new tier needs no client change.
 */
export default function SubscriptionScreen() {
  const { styles, theme } = useStyles(stylesheet);

  const plans = useSubscriptionPlans();
  const current = useEntitlements();
  const upgrade = useUpgradeSubscription();

  const handleSelect = (plan: SubscriptionPlan) => {
    upgrade.mutate(plan.id, {
      onSuccess: () => {
        showAlert(
          'Plan updated',
          `You are now on ${plan.name}. No payment was taken — this is a test subscription.`,
          [{ text: 'Great', onPress: () => router.back() }],
        );
      },
      onError: (error) => showAlert('Could not change plan', getApiErrorMessage(error)),
    });
  };

  if (plans.isLoading) {
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <SkeletonList count={3} height={320} />
      </ScreenContainer>
    );
  }

  if (plans.isError) {
    return (
      <View style={styles.container}>
        <ErrorState
          message={getApiErrorMessage(plans.error, 'Could not load subscription plans.')}
          onRetry={() => plans.refetch()}
        />
      </View>
    );
  }

  const catalogue = plans.data ?? [];
  // The cheapest tier that includes a human is the one worth recommending.
  const recommendedId = catalogue.find((plan) => plan.entitlements.coachAccess !== 'none')?.id;

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>How much coach do you want?</Text>
        <Text style={styles.subtitle}>
          Every plan includes your program and the AI assistant. What changes is how much of your
          coach’s time comes with it.
        </Text>
      </View>

      <View style={styles.currentBanner}>
        <MessageCircle size={16} color={theme.colors.primary} />
        <View style={styles.currentBannerText}>
          <Text style={styles.currentBannerTitle}>
            You are on {current.planName}
            {current.status === 'canceled' || current.status === 'expired'
              ? ` (${current.status})`
              : ''}
          </Text>
          <Text style={styles.currentBannerCopy}>{current.coachResponseExpectation}</Text>
        </View>
      </View>

      {catalogue.map((plan) => {
        const isCurrent = current.planId === plan.id;
        // The API rejects downgrades and same-tier changes, so only offer what it accepts.
        const isDowngrade =
          tierRank(plan.entitlements.canonicalTier) <= tierRank(current.canonicalTier);

        return (
          <PlanCard
            key={plan.id}
            name={plan.name}
            entitlements={plan.entitlements}
            isCurrent={isCurrent}
            isPopular={plan.id === recommendedId}
            selecting={upgrade.isPending && upgrade.variables === plan.id}
            {...(isCurrent || isDowngrade
              ? { unavailableNote: 'Changing to a lower plan is handled through billing support.' }
              : { onSelect: () => handleSelect(plan) })}
          />
        );
      })}

      <View style={styles.comparisonSection}>
        <Text style={styles.comparisonTitle}>Compare coach services</Text>
        <FeatureComparison plans={catalogue} />
      </View>

      <View style={styles.mockNote}>
        <Info size={14} color={theme.colors.textSecondary} />
        <Text style={styles.mockNoteText}>{MOCK_PRICING_NOTE}</Text>
      </View>
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing['3xl'],
  },
  header: { gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  title: { color: theme.colors.text, ...theme.typography.displaySm },
  subtitle: { color: theme.colors.textSecondary, ...theme.typography.bodyMd, lineHeight: 21 },
  currentBanner: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  currentBannerText: { flex: 1, gap: 2 },
  currentBannerTitle: { color: theme.colors.text, ...theme.typography.labelMd },
  currentBannerCopy: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySm,
    lineHeight: 18,
  },
  comparisonSection: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  comparisonTitle: { color: theme.colors.text, ...theme.typography.headingMd },
  mockNote: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
    marginTop: theme.spacing.lg,
  },
  mockNoteText: {
    flex: 1,
    color: theme.colors.textSecondary,
    ...theme.typography.bodySm,
    lineHeight: 18,
  },
}));
