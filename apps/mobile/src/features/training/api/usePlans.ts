import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useSubscriptionTier } from '../../subscription/api/useSubscription';
import type { WorkoutPlan, WorkoutPlanDetail } from '../types';

/**
 * `GET /plans` returns exactly the plans the caller's entitlements cover — the
 * server resolves that from the subscription, so nothing is sent. The tier stays
 * in the cache key so the list refetches when the subscription changes.
 */
export const usePlans = () => {
  const tier = useSubscriptionTier();

  return useQuery({
    queryKey: queryKeys.plans(tier),
    queryFn: async (): Promise<WorkoutPlan[]> => {
      const { data } = await api.get<WorkoutPlan[]>('/plans');
      return data;
    },
  });
};

export const usePlan = (planId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.plan(planId ?? ''),
    enabled: !!planId,
    queryFn: async (): Promise<WorkoutPlanDetail> => {
      const { data } = await api.get<WorkoutPlanDetail>(`/plans/${planId}`);
      // Drizzle returns relations unordered; the UI relies on `orderIndex`.
      return {
        ...data,
        days: [...(data.days ?? [])]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((day) => ({
            ...day,
            exercises: [...(day.exercises ?? [])].sort((a, b) => a.orderIndex - b.orderIndex),
          })),
      };
    },
  });
