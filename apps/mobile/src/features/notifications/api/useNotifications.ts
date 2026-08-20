import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';

/** Mirrors the `notifications` table returned by `GET /notifications`. */
export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string | null;
  isRead: boolean;
  createdAt: string;
}

export const useNotifications = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.notifications,
    enabled: isAuthenticated,
    queryFn: async (): Promise<Notification[]> => {
      const { data } = await api.get<Notification[]>('/notifications');
      return data;
    },
  });
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/notifications/${id}/read`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
};
