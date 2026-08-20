import { useMutation } from '@tanstack/react-query';
import { api } from '../../../lib/api';

/**
 * `POST /auth/forgot-password`.
 *
 * Always succeeds from the client's point of view, because the API answers 202
 * whether or not the address has an account — telling the caller which is which
 * would turn this screen into an account-existence oracle. The UI therefore
 * shows the same "check your email" message either way, and a rejection here
 * means the request itself failed (offline, rate-limited), not "no such user".
 */
export const useForgotPassword = () =>
  useMutation({
    mutationFn: async (email: string): Promise<void> => {
      await api.post('/auth/forgot-password', { email });
    },
  });

/**
 * `POST /auth/reset-password`.
 *
 * On success the API has destroyed every session for the account, including any
 * this device was holding, so the caller must send the user back to sign-in
 * rather than assume its stored tokens still work.
 */
export const useResetPassword = () =>
  useMutation({
    mutationFn: async (payload: { token: string; password: string }): Promise<void> => {
      await api.post('/auth/reset-password', payload);
    },
  });
