import type { ExerciseVideoResponse, ExerciseImageResponse } from '../exercise-media/exercise-media.types';

/** Wire shapes for the exercise library. */

export interface TaxonomyRef {
  id: string;
  slug: string;
  name: string;
}

export interface MuscleRef extends TaxonomyRef {
  scientificName: string | null;
  region: 'upper' | 'core' | 'lower' | 'full_body';
}

export interface EquipmentRef extends TaxonomyRef {
  isBodyweight: boolean;
  /** False for optional kit — a belt, a bench you could work around. */
  isRequired: boolean;
}

/**
 * The list shape.
 *
 * Carries the poster frame but not a playback URL: a list of fifty exercises has
 * no use for fifty signed video URLs, and the detail screen fetches the one it
 * needs.
 */
export interface ExerciseSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: TaxonomyRef | null;
  primaryMuscles: MuscleRef[];
  equipment: EquipmentRef[];
  thumbnailUrl: string | null;
  hasVideo: boolean;
  defaultSets: number;
  defaultReps: number;
  defaultRestSeconds: number;
  isPublished: boolean;
}

/** Everything the exercise screen renders, in one response. */
export interface ExerciseDetail extends ExerciseSummary {
  secondaryMuscles: MuscleRef[];
  stabilizerMuscles: MuscleRef[];
  instructions: string[];
  tips: string[];
  commonMistakes: string[];
  /** The demo to play: the primary video, ready and resolved to a URL. */
  video: ExerciseVideoResponse | null;
  /** Short muted loop for the header, when one has been uploaded. */
  previewVideo: ExerciseVideoResponse | null;
  /** Every ready video, including alternate angles. */
  videos: ExerciseVideoResponse[];
  images: ExerciseImageResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedExercises {
  items: ExerciseSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ExerciseTaxonomy {
  categories: (TaxonomyRef & { description: string | null; orderIndex: number })[];
  muscles: MuscleRef[];
  equipment: Omit<EquipmentRef, 'isRequired'>[];
}
