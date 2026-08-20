import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';
import type { CoachProfile } from '../types';

/** Body for `POST /coaches/apply`. `headline` is the only required field. */
export interface ApplyAsCoachPayload {
  headline: string;
  bio?: string;
  yearsExperience?: number;
}

/**
 * `GET /coaches/application` — the caller's own application, or `null`.
 *
 * Deliberately a different endpoint from `/coaches/me`: an applicant still holds
 * the `user` role until an admin approves them, so the coach-gated route 403s
 * them and cannot report the status of the thing they just submitted.
 */
export const useCoachApplication = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.coachApplication,
    enabled: isAuthenticated,
    queryFn: async (): Promise<CoachProfile | null> => {
      const { data } = await api.get<CoachProfile | null>('/coaches/application');
      return data ?? null;
    },
  });
};

/**
 * `POST /coaches/apply`.
 *
 * Creates a `pending` profile and grants nothing — the role arrives only when an
 * admin approves, which is why this does not touch the auth store. The applicant
 * keeps the athlete app until then.
 */
export const useApplyAsCoach = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ApplyAsCoachPayload): Promise<CoachProfile> => {
      const { data } = await api.post<CoachProfile>('/coaches/apply', payload);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.coachApplication }),
  });
};
