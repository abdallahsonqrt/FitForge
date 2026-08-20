import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';
import type {
  CanonicalTier,
  Entitlements,
  MySubscription,
  SubscriptionPlan,
  UserSubscription,
} from '../types';

/** Signed-out default, matching the server's `FREE_ENTITLEMENTS`. */
const FREE_ENTITLEMENTS: Entitlements = {
  tier: 'free',
  canonicalTier: 'free',
  planId: null,
  planName: 'Free',
  priceCents: 0,
  status: 'none',
  coachAccess: 'none',
  formReviews: false,
  scheduledCheckIns: false,
  personalisedPlanUpdates: false,
  coachResponseExpectation: 'Browse coaches and read their programs. Messaging is not included.',
  programAccess: 'preview',
  deviceLimit: 1,
  aiLogLimit: 5,
};

export const useSubscriptionPlans = () =>
  useQuery({
    queryKey: queryKeys.subscriptionPlans,
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data } = await api.get<SubscriptionPlan[]>('/subscriptions/plans');
      return [...data].sort((a, b) => a.priceCents - b.priceCents);
    },
  });

/** `GET /subscriptions/me` — the subscription row (may be `null`) and its entitlements. */
export const useMySubscription = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.mySubscription,
    enabled: isAuthenticated,
    queryFn: async (): Promise<MySubscription> => {
      const { data } = await api.get<MySubscription>('/subscriptions/me');
      return data;
    },
  });
};

/**
 * What this user is allowed to do. Gate UI on this rather than on tier names —
 * the server owns the rules, including the legacy `pro`/`elite` bridge, so a
 * tier change needs no client release.
 */
export const useEntitlements = (): Entitlements => {
  const { data } = useMySubscription();
  return data?.entitlements ?? FREE_ENTITLEMENTS;
};

/**
 * The user's effective tier after the server's legacy bridge — `free` while
 * loading or with no subscription.
 */
export const useSubscriptionTier = (): CanonicalTier => useEntitlements().canonicalTier;

/**
 * Mock purchase. No payment provider is connected: this moves the test
 * subscription record and nothing is charged.
 */
export const useUpgradeSubscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (planId: string): Promise<UserSubscription> => {
      const { data } = await api.post<UserSubscription>('/subscriptions/upgrade', { planId });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mySubscription });
      // Plan visibility is entitlement-gated server-side, so the plan list changes too.
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });
};
