import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useAuthStore, type LogoutReason } from '../../../store/authStore';

/**
 * Revokes the refresh token server-side, then clears local state. A failed
 * revoke still logs out locally — the user asked to leave.
 *
 * The optional `LogoutReason` travels through to the store, where it decides
 * where the app goes next: `mutate()` on its own ends the session normally,
 * while `mutate({ kind: 'switching', intended })` says this is an account
 * switch that should return to sign-in still carrying that page.
 */
export const useLogout = () => {
  const queryClient = useQueryClient();

  /**
   * The variable is `LogoutReason | void` so the plain sign-out buttons can keep
   * calling `mutate()` with no argument, while the account switch passes its
   * reason. Making it a required parameter would force every ordinary sign-out
   * to spell out `undefined`.
   */
  return useMutation<void, unknown, LogoutReason | void>({
    mutationFn: async () => {
      const { refreshToken } = useAuthStore.getState();
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
      }
    },
    onSettled: (_data, _error, reason) => {
      useAuthStore.getState().logout(reason || undefined);
      queryClient.clear();
    },
  });
};
