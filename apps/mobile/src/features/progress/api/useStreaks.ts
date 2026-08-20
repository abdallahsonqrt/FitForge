import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';
import type { Streak, UserBadge, WorkoutLog } from '../types';

const EMPTY_STREAK: Streak = { currentStreak: 0, longestStreak: 0, lastActivityDate: null };

export const useStreak = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.streak,
    enabled: isAuthenticated,
    queryFn: async (): Promise<Streak> => {
      const { data } = await api.get<Streak>('/streaks');
      return data ?? EMPTY_STREAK;
    },
  });
};

export const useBadges = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.badges,
    enabled: isAuthenticated,
    queryFn: async (): Promise<UserBadge[]> => {
      const { data } = await api.get<UserBadge[]>('/progress/badges');
      return [...data].sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
    },
  });
};

/** Completed sessions, most recent first. */
export const useWorkoutHistory = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.workoutHistory,
    enabled: isAuthenticated,
    queryFn: async (): Promise<WorkoutLog[]> => {
      const { data } = await api.get<WorkoutLog[]>('/progress/workouts');
      return data;
    },
  });
};
