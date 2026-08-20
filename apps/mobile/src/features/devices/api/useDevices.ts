import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';

/** Mirrors the `devices` table returned by `GET /devices` (refresh tokens stripped by the API). */
export interface Device {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  platform: string | null;
  userAgent: string | null;
  lastActive: string;
  createdAt: string;
}

export const useDevices = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.devices,
    enabled: isAuthenticated,
    queryFn: async (): Promise<Device[]> => {
      const { data } = await api.get<Device[]>('/devices');
      return [...data].sort((a, b) => b.lastActive.localeCompare(a.lastActive));
    },
  });
};

export const useRemoveDevice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deviceId: string) => {
      await api.delete(`/devices/${deviceId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.devices }),
  });
};
