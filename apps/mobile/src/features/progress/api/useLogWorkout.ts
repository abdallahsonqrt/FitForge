import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import type { WorkoutLog } from '../types';

/** One completed set, as recorded on the active-workout screen. */
export interface LoggedSet {
  exerciseId: string;
  setNumber: number;
  reps?: number;
  weightKg?: number;
}

interface LogWorkoutPayload {
  planId?: string;
  durationSeconds?: number;
  /**
   * What was actually lifted. Previously the screen collected reps and weight
   * per set and dropped them here, so only the fact that a session happened was
   * ever saved.
   */
  sets?: LoggedSet[];
}

/** Records a finished session, which is what feeds history, streaks and badges. */
export const useLogWorkout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: LogWorkoutPayload): Promise<WorkoutLog> => {
      const { data } = await api.post<WorkoutLog>('/progress/workouts', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutHistory });
      queryClient.invalidateQueries({ queryKey: queryKeys.streak });
      queryClient.invalidateQueries({ queryKey: queryKeys.badges });
    },
  });
};
