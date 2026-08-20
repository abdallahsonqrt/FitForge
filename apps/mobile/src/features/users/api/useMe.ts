import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';
import type { OnboardingPayload, UpdateProfilePayload, User } from '../types';

/**
 * The authenticated profile. Mirrors into the auth store so screens that read
 * `user` synchronously (and the persisted session) stay current.
 */
export const useMe = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setUser = useAuthStore((state) => state.setUser);

  return useQuery({
    queryKey: queryKeys.me,
    enabled: isAuthenticated,
    queryFn: async (): Promise<User> => {
      const { data } = await api.get<User>('/users/me');
      setUser(data);
      return data;
    },
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: async (payload: UpdateProfilePayload): Promise<User> => {
      const { data } = await api.patch<User>('/users/me', payload);
      return data;
    },
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(queryKeys.me, user);
    },
  });
};

export const useCompleteOnboarding = () => {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: async (payload: OnboardingPayload): Promise<User> => {
      const { data } = await api.post<User>('/users/me/onboarding', payload);
      return data;
    },
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(queryKeys.me, user);
    },
  });
};
