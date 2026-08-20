import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import type { AiMealResponse } from '../types';

interface AiMealRequest {
  text: string;
  /** Present when answering the assistant's follow-up question. */
  conversationId?: string;
}

/**
 * Conversational meal logging. The API either logs the meal outright or comes
 * back with a clarifying question carrying a `conversationId` to continue with.
 */
export const useAiMealLog = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ text, conversationId }: AiMealRequest): Promise<AiMealResponse> => {
      const endpoint = conversationId ? '/ai/meals/conversation' : '/ai/meals/extract';
      const { data } = await api.post<AiMealResponse>(endpoint, { text, conversationId });
      return data;
    },
    onSuccess: (result) => {
      if (result.status === 'logged') {
        queryClient.invalidateQueries({ queryKey: queryKeys.meals });
        queryClient.invalidateQueries({ queryKey: ['meals', 'summary'] });
      }
    },
  });
};
