import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Dumbbell } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { WorkoutPlanCard } from '../../src/components/training/WorkoutPlanCard';
import { Chip, EmptyState, ErrorState, SkeletonList } from '../../src/components/ui';
import { usePlans } from '../../src/features/training/api/usePlans';
import { useSubscriptionTier } from '../../src/features/subscription/api/useSubscription';
import { getApiErrorMessage } from '../../src/lib/api';
import {
  toCanonicalTier,
  type CanonicalTier,
} from '../../src/features/subscription/types';
import { useTranslation } from '../../src/i18n';

/**
 * The tiers the product actually sells. The previous list was ['all','free',
 * 'pro','elite'] — `pro`/`elite` are legacy stored values, so those two chips
 * matched no plan at all, and no chip could select a `starter`/`coach`/
 * `pro_coaching` plan (which is every seeded one).
 */
const FILTERS = ['all', 'free', 'starter', 'coach', 'pro_coaching'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  free: 'Free',
  starter: 'Starter',
  coach: 'Coach',
  pro_coaching: 'Pro Coaching',
};

export default function TrainingScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<Filter>('all');

  const plans = usePlans();
  const tier = useSubscriptionTier();

  const filteredPlans = useMemo(
    () =>
      (plans.data ?? []).filter(
        // A plan's stored tier may be legacy, so both sides are canonicalised.
        (plan) => activeFilter === 'all' || toCanonicalTier(plan.tier) === activeFilter,
      ),
    [plans.data, activeFilter],
  );

  const renderBody = () => {
    if (plans.isLoading) return <SkeletonList count={4} height={120} />;

    if (plans.isError) {
      return (
        <ErrorState
          message={getApiErrorMessage(plans.error, 'Could not load workout plans.')}
          onRetry={() => plans.refetch()}
        />
      );
    }

    if (filteredPlans.length === 0) {
      return (
        <EmptyState
          icon={<Dumbbell size={32} color={theme.colors.primary} />}
          title={activeFilter === 'all' ? 'No plans available' : `No ${FILTER_LABEL[activeFilter]} plans`}
          description={
            activeFilter === 'all'
              ? 'Workout plans will appear here once they are published.'
              : 'Try a different filter, or upgrade to unlock more programmes.'
          }
          {...(activeFilter !== 'all' && activeFilter !== tier
            ? { actionLabel: 'See plans', onAction: () => router.push('/subscription') }
            : {})}
        />
      );
    }

    return filteredPlans.map((plan) => (
      <WorkoutPlanCard key={plan.id} plan={plan} onPress={() => router.push(`/workout/${plan.id}`)} />
    ));
  };

  return (
    <ScreenContainer insideTabs onRefresh={() => plans.refetch()} refreshing={plans.isFetching}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('training.title')}</Text>
        <Text style={styles.subtitle}>
          {tierBlurb(tier)}
        </Text>
      </View>

      <View style={styles.tabsContainer}>
        {FILTERS.map((filter) => (
          <Chip
            key={filter}
            label={FILTER_LABEL[filter]}
            selected={activeFilter === filter}
            onPress={() => setActiveFilter(filter)}
          />
        ))}
      </View>

      {renderBody()}
    </ScreenContainer>
  );
}

const TIER_BLURB: Record<CanonicalTier, string> = {
  free: 'Showing the plans you can preview for free.',
  starter: 'Showing the plans included with your Starter plan.',
  coach: 'Showing the plans included with your Coach plan.',
  pro_coaching: 'Every plan is unlocked on Pro Coaching.',
};

const tierBlurb = (tier: CanonicalTier) => TIER_BLURB[tier];

const stylesheet = createStyleSheet((theme) => ({
  header: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    ...theme.typography.displaySm,
    color: theme.colors.text,
  },
  subtitle: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
}));
