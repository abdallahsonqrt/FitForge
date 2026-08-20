import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';
import type {
  FoodItem,
  FoodSearchResponse,
  FoodSuggestionFeed,
  MealType,
} from '../types';

/**
 * The pre-search screen: what the user eats at this time of day, their
 * favourites, and their recents. A user with no history gets popular staples
 * rather than three empty lists.
 */
export const useFoodSuggestions = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.foodSuggestions,
    enabled: isAuthenticated,
    // Short: the meal slot changes with the clock, so a long cache would keep
    // showing breakfast foods at dinner.
    staleTime: 60 * 1000,
    queryFn: async (): Promise<FoodSuggestionFeed> => {
      const { data } = await api.get<FoodSuggestionFeed>('/foods/suggestions');
      return data;
    },
  });
};



/**
 * Star or unstar a food.
 *
 * Optimistic, because the star is tapped straight from a result row and a
 * round-trip delay there reads as an unresponsive button. Every cached list
 * holding this food is patched in place, then reconciled on settle.
 */
export const useToggleFavorite = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ foodId, isFavorite }: { foodId: string; isFavorite: boolean }) => {
      // `isFavorite` is the *current* state, so the call flips it.
      if (isFavorite) {
        await api.delete(`/foods/${foodId}/favorite`);
      } else {
        await api.post(`/foods/${foodId}/favorite`);
      }
      return { foodId, isFavorite: !isFavorite };
    },

    onMutate: async ({ foodId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.foods });

      const previous = queryClient.getQueriesData({ queryKey: queryKeys.foods });

      const patch = (food: FoodItem): FoodItem =>
        food.id === foodId ? { ...food, isFavorite: !isFavorite } : food;

      const patchAll = (foods: FoodItem[] | undefined): FoodItem[] => (foods ?? []).map(patch);

      // The food endpoints do *not* all return the same shape, so each one has
      // to be recognised. Search in particular returns an object whose foods sit
      // in three places — including nested inside every group — and missing any
      // of them leaves a star that does not fill until the refetch lands.
      queryClient.setQueriesData({ queryKey: queryKeys.foods }, (data: unknown) => {
        if (Array.isArray(data)) {
          // Recents, favourites, category listings — and autocomplete, whose
          // rows are suggestions with no `isFavorite`; `patch` leaves those
          // alone because their ids still match nothing it would change.
          return (data as FoodItem[]).map((item) =>
            item && typeof item === 'object' && 'isFavorite' in item ? patch(item) : item,
          );
        }

        if (!data || typeof data !== 'object') return data;

        const record = data as Partial<FoodSearchResponse> &
          Partial<FoodSuggestionFeed> &
          Partial<FoodItem>;

        // `GET /foods/search` — flat list, groups, and the ungrouped remainder.
        if (Array.isArray(record.results) || Array.isArray(record.groups)) {
          return {
            ...record,
            results: patchAll(record.results),
            ungrouped: patchAll(record.ungrouped),
            groups: (record.groups ?? []).map((group) => ({
              ...group,
              items: patchAll(group.items),
            })),
          };
        }

        // `GET /foods/suggestions` — the pre-search feed.
        if (Array.isArray(record.recent) || Array.isArray(record.favorites)) {
          return {
            ...record,
            forThisMeal: patchAll(record.forThisMeal),
            favorites: patchAll(record.favorites),
            recent: patchAll(record.recent),
          };
        }

        // A single food from `useFood`.
        if (typeof record.id === 'string') return patch(data as FoodItem);

        return data;
      });

      return { previous };
    },

    onError: (_error, _variables, context) => {
      // Put every cache entry back exactly as it was.
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.foods });
    },
  });
};

/**
 * Tell the API a food was actually eaten. Feeds recents, the meal-time
 * suggestions and the global popularity used in search ranking.
 *
 * Fire-and-forget by design: this is a side effect of logging a meal, and a
 * failure here must never make a successfully logged meal look like it failed.
 */
export const useRecordFoodUsage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ foodId, mealType }: { foodId: string; mealType?: MealType }) => {
      await api.post(`/foods/${foodId}/usage`, mealType ? { mealType } : {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.foodRecent });
      queryClient.invalidateQueries({ queryKey: queryKeys.foodSuggestions });
    },
  });
};
