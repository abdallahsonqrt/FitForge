import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { getDeviceInfo } from '../../../lib/deviceId';
import { useAuthStore } from '../../../store/authStore';
import type { User } from '../../users/types';
import type { AuthTokens, RegisterRequest } from '../types';

/** `POST /auth/register` signs the new account straight in, same shape as login. */
export const useRegister = () => {
  const signIn = useAuthStore((state) => state.signIn);
  const setTokens = useAuthStore((state) => state.setTokens);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RegisterRequest): Promise<User> => {
      // Same device fields as login: registering opens a real session, and it
      // should be this device's session rather than an anonymous extra row.
      const { data: tokens } = await api.post<AuthTokens>('/auth/register', {
        ...payload,
        ...getDeviceInfo(),
      });
      setTokens(tokens.accessToken, tokens.refreshToken);

      const { data: user } = await api.get<User>('/users/me');
      signIn(tokens, user);
      return user;
    },
    onSuccess: () => queryClient.clear(),
  });
};
