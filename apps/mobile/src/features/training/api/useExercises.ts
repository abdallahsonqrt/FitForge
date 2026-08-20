import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import type {
  ExerciseDetail,
  ExerciseTaxonomy,
  PaginatedExercises,
  PlaybackUrl,
} from '../types';

/** Index signature included so the filter set can double as the query key. */
export interface ExerciseFilters {
  search?: string;
  category?: string;
  muscle?: string;
  equipment?: string;
  difficulty?: string;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

/** `GET /exercises` — paginated and filterable; the library is meant to grow. */
export const useExercises = (filters: ExerciseFilters = {}) =>
  useQuery({
    queryKey: queryKeys.exercises(filters),
    queryFn: async (): Promise<PaginatedExercises> => {
      const { data } = await api.get<PaginatedExercises>('/exercises', { params: filters });
      return data;
    },
  });

/** `GET /exercises/:idOrSlug` — the exercise screen's single request. */
export const useExercise = (exerciseId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.exercise(exerciseId ?? ''),
    enabled: !!exerciseId,
    queryFn: async (): Promise<ExerciseDetail> => {
      const { data } = await api.get<ExerciseDetail>(`/exercises/${exerciseId}`);
      return data;
    },
  });

/** Categories, muscles and equipment — stable enough to cache for the session. */
export const useExerciseTaxonomy = () =>
  useQuery({
    queryKey: queryKeys.exerciseTaxonomy,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<ExerciseTaxonomy> => {
      const { data } = await api.get<ExerciseTaxonomy>('/exercises/taxonomy');
      return data;
    },
  });

/**
 * A fresh playback URL for a video.
 *
 * Only needed when the exercise's own URL has expired — private media is served
 * through signed URLs, and one fetched with the exercise goes stale if the screen
 * is left open. `enabled` keeps this from firing for public media, which never
 * expires.
 */
export const useVideoPlaybackUrl = (videoId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: queryKeys.videoPlayback(videoId ?? ''),
    enabled: !!videoId && enabled,
    // Refetched by the player when the current URL is close to expiring.
    staleTime: 0,
    queryFn: async (): Promise<PlaybackUrl> => {
      const { data } = await api.get<PlaybackUrl>(`/exercise-videos/${videoId}/playback-url`);
      return data;
    },
  });
