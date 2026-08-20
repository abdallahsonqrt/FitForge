import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';
import { dateKeyToIso, todayKey } from '../../../utils/date';

/** `GET /water/:date` returns the day's total in millilitres. */
export const useWaterTotal = (date: string = todayKey()) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.water(date),
    enabled: isAuthenticated,
    queryFn: async (): Promise<number> => {
      const { data } = await api.get<{ amountMl: number }>(`/water/${date}`);
      return data?.amountMl ?? 0;
    },
  });
};

/**
 * Logs a delta (one glass, typically). Optimistically bumps the day's total so
 * tapping the widget feels instant, and rolls back if the request fails.
 */
export const useLogWater = (date: string = todayKey()) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (amountMl: number) => {
      await api.post('/water', { amountMl, date: dateKeyToIso(date) });
    },
    onMutate: async (amountMl) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.water(date) });
      const previous = queryClient.getQueryData<number>(queryKeys.water(date)) ?? 0;
      queryClient.setQueryData<number>(queryKeys.water(date), previous + amountMl);
      return { previous };
    },
    onError: (_error, _amount, context) => {
      if (context) queryClient.setQueryData(queryKeys.water(date), context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.water(date) }),
  });
};
