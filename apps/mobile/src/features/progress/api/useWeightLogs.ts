import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';
import { todayIso } from '../../../utils/date';
import type { WeightLog } from '../types';

/** Weight history, oldest first — the order the chart plots. */
export const useWeightLogs = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.weightLogs,
    enabled: isAuthenticated,
    queryFn: async (): Promise<WeightLog[]> => {
      const { data } = await api.get<WeightLog[]>('/progress/weight');
      return [...data].sort((a, b) => a.date.localeCompare(b.date));
    },
  });
};

export const useLogWeight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { weight: number; unit: 'kg' | 'lbs' }): Promise<WeightLog> => {
      const { data } = await api.post<WeightLog>('/progress/weight', {
        ...payload,
        date: todayIso(),
      });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.weightLogs }),
  });
};
