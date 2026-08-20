import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';
import { dateKeyToIso, todayKey } from '../../../utils/date';

/** `GET /steps/:date` returns the day's total step count. */
export const useStepsTotal = (date: string = todayKey()) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.steps(date),
    enabled: isAuthenticated,
    queryFn: async (): Promise<number> => {
      const { data } = await api.get<{ count: number }>(`/steps/${date}`);
      return data?.count ?? 0;
    },
  });
};

/** Appends to the day's total — the API sums every row for the date. */
export const useLogSteps = (date: string = todayKey()) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (count: number) => {
      await api.post('/steps', { count, date: dateKeyToIso(date) });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.steps(date) }),
  });
};
