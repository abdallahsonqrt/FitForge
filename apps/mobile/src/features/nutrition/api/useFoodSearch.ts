import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import type { FoodCategory, FoodSearchResponse, FoodSuggestion } from '../types';

/**
 * Full food search. The API answers from its own catalogue and only reaches for
 * USDA / Open Food Facts when it has a genuine gap, so most calls are fast and
 * the slow ones make the next search fast.
 *
 * Pass an already-debounced term — this hook does not debounce.
 */
export const useFoodSearch = (query: string, category?: FoodCategory) => {
  const trimmed = query.trim();

  return useQuery({
    queryKey: queryKeys.foodSearch(trimmed.toLowerCase(), category),
    enabled: trimmed.length >= 2,
    // Keeps the previous list on screen while the next term loads, so results
    // don't blank out on every keystroke.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FoodSearchResponse> => {
      const { data } = await api.get<FoodSearchResponse>('/foods/search', {
        params: { query: trimmed, ...(category ? { category } : {}) },
      });
      return data;
    },
  });
};

/**
 * Prefix suggestions for the search box. Separate from `useFoodSearch` because
 * it is deliberately cheaper: local-only, no nutrition, and it fires from the
 * first character rather than the second.
 */
export const useFoodAutocomplete = (query: string) => {
  const trimmed = query.trim();

  return useQuery({
    queryKey: queryKeys.foodAutocomplete(trimmed.toLowerCase()),
    enabled: trimmed.length >= 1,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<FoodSuggestion[]> => {
      const { data } = await api.get<FoodSuggestion[]>('/foods/autocomplete', {
        params: { query: trimmed },
      });
      return data;
    },
  });
};

