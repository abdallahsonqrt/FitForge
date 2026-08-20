import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import type { Conversation, Message, MessagePage } from '../types';

/** One screenful and then some, so the first page rarely needs an immediate second. */
const MESSAGE_PAGE_SIZE = 30;

/**
 * `GET /conversations` returns a bare array, not a `Paged<T>` — the endpoint has no
 * paging at all. Sorted newest-activity-first here rather than trusting the server
 * order, and a thread that has never been used falls back to its creation time so
 * it does not sink below everything with a `lastMessageAt`.
 */
export const useConversations = () =>
  useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async (): Promise<Conversation[]> => {
      const { data } = await api.get<Conversation[]>('/conversations');
      return [...data].sort(
        (a, b) =>
          new Date(b.lastMessageAt ?? b.createdAt).getTime() -
          new Date(a.lastMessageAt ?? a.createdAt).getTime(),
      );
    },
  });

/** The unread badge. Cheap enough to keep its own key so marking a thread read can clear it alone. */
export const useUnreadCount = () =>
  useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: async (): Promise<number> => {
      const { data } = await api.get<{ unreadCount: number }>('/conversations/unread-count');
      return data.unreadCount;
    },
  });

/**
 * Cursor-paged history for one thread.
 *
 * The API returns newest-first and pages *backwards* in time, so every page is
 * older than the last. That is the right shape for a chat: page 0 is what you want
 * on screen, and "load older" appends. The screen flattens and reverses.
 */
export const useConversationMessages = (conversationId: string | undefined) =>
  useInfiniteQuery({
    queryKey: queryKeys.conversationMessages(conversationId ?? ''),
    enabled: !!conversationId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<MessagePage> => {
      const { data } = await api.get<MessagePage>(`/conversations/${conversationId}/messages`, {
        params: { limit: MESSAGE_PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
      });
      return data;
    },
    // `hasMore` is the server's word on it; `nextCursor` alone would keep asking
    // for a page that does not exist.
    getNextPageParam: (lastPage) => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
  });

/**
 * `POST /conversations/:id/messages`. Only `text` is sendable — `system` and
 * `ai_summary` are 403 for every caller, and the attachment kinds need an upload
 * this screen does not do.
 */
export const useSendMessage = (conversationId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: string): Promise<Message> => {
      const { data } = await api.post<Message>(`/conversations/${conversationId}/messages`, {
        kind: 'text',
        body,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversationMessages(conversationId ?? ''),
      });
      // The inbox shows the last message and its timestamp, so it is stale now too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
};

/**
 * `POST /conversations/:id/read`.
 *
 * Fired when a thread opens. The inbox row's `unreadCount` and the global badge
 * both derive from what this clears, so both are invalidated — otherwise the badge
 * keeps claiming unread messages the coach is currently looking at.
 */
export const useMarkConversationRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string): Promise<number> => {
      const { data } = await api.post<{ readCount: number }>(
        `/conversations/${conversationId}/read`,
      );
      return data.readCount;
    },
    onSuccess: (readCount, conversationId) => {
      // Nothing changed server-side, so spare the two refetches.
      if (readCount === 0) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversationMessages(conversationId),
      });
    },
  });
};
