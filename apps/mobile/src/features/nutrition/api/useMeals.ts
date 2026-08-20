import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';
import { todayKey } from '../../../utils/date';
import { EMPTY_MACROS, type LogMealPayload, type MacroTotals, type Meal } from '../types';

/**
 * `GET /meals` is not date-scoped, so filter client-side. The user's own meals are
 * the only ones the list is useful for.
 */
export const useMeals = (date: string = todayKey()) => {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: [...queryKeys.meals, date, userId ?? ''],
    enabled: !!userId,
    queryFn: async (): Promise<Meal[]> => {
      const { data } = await api.get<Meal[]>('/meals');
      return data
        .filter((meal) => meal.userId === userId && meal.date.slice(0, 10) === date)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  });
};

/** The most recently logged meals, used for quick re-entry from food search. */
export const useRecentMeals = (limit = 5) => {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: [...queryKeys.meals, 'recent', userId ?? '', limit],
    enabled: !!userId,
    queryFn: async (): Promise<Meal[]> => {
      const { data } = await api.get<Meal[]>('/meals');
      return data
        .filter((meal) => meal.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    },
  });
};

export const useMealSummary = (date: string = todayKey()) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.mealSummary(date),
    enabled: isAuthenticated,
    queryFn: async (): Promise<MacroTotals> => {
      const { data } = await api.get<MacroTotals>(`/meals/summary/${date}`);
      return data ?? EMPTY_MACROS;
    },
  });
};

export const useLogMeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: LogMealPayload): Promise<Meal> => {
      const { data } = await api.post<Meal>('/meals', payload);
      return data;
    },
    onSuccess: (meal) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meals });
      queryClient.invalidateQueries({ queryKey: queryKeys.mealSummary(meal.date.slice(0, 10)) });
    },
  });
};
