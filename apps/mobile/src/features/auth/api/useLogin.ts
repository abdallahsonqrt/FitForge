import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { getDeviceInfo } from '../../../lib/deviceId';
import { useAuthStore } from '../../../store/authStore';
import type { User } from '../../users/types';
import type { AuthTokens, LoginRequest } from '../types';

/**
 * `POST /auth/login` returns tokens only, so the profile is fetched immediately
 * after and both are committed to the store in one step.
 */
export const useLogin = () => {
  const signIn = useAuthStore((state) => state.signIn);
  const setTokens = useAuthStore((state) => state.setTokens);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: LoginRequest): Promise<User> => {
      // The device fields tell the API which session row to re-use, so signing
      // in again on this phone replaces its own session instead of adding one
      // and evicting another device.
      const { data: tokens } = await api.post<AuthTokens>('/auth/login', {
        ...payload,
        ...getDeviceInfo(),
      });
      // Set tokens first so the request interceptor can authenticate `/users/me`.
      setTokens(tokens.accessToken, tokens.refreshToken);

      const { data: user } = await api.get<User>('/users/me');
      signIn(tokens, user);
      return user;
    },
    onSuccess: () => queryClient.clear(),
  });
};
