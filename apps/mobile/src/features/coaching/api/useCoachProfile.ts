import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { isCoach } from '../../../lib/routing';
import { useAuthStore } from '../../../store/authStore';
import type { CoachProfile, UpdateCoachProfilePayload } from '../types';

/**
 * The signed-in coach's own profile.
 *
 * `GET /coaches/me` is 403 for anyone who is not a coach, so the query stays
 * disabled until the role is known — `user` lands one request after the tokens
 * do, and firing in that gap would spend a guaranteed 403 on every sign-in.
 */
export const useCoachProfile = () => {
  const enabled = useAuthStore((state) => state.isAuthenticated && isCoach(state.user));

  return useQuery({
    queryKey: queryKeys.coachMe,
    enabled,
    queryFn: async (): Promise<CoachProfile> => {
      const { data } = await api.get<CoachProfile>('/coaches/me');
      return data;
    },
  });
};

/**
 * Patches the profile.
 *
 * The API rejects an empty body ("Provide at least one field to update."), so
 * callers must send a real diff — see `buildProfileDiff` on the profile screen.
 * `verificationStatus` and `ratingAvg` are stripped server-side; they are not on
 * `UpdateCoachProfilePayload` for the same reason.
 */
export const useUpdateCoachProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateCoachProfilePayload): Promise<CoachProfile> => {
      const { data } = await api.patch<CoachProfile>('/coaches/me', payload);
      return data;
    },
    onSuccess: (profile) => {
      // Seed from the response first so the form re-hydrates without a flash of
      // stale values, then invalidate so anything derived from it refetches.
      queryClient.setQueryData(queryKeys.coachMe, profile);
      queryClient.invalidateQueries({ queryKey: queryKeys.coachMe });
      // Capacity and "accepting clients" are part of what the dashboard reports.
      queryClient.invalidateQueries({ queryKey: queryKeys.coachDashboard });
    },
  });
};
