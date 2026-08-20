import type { SubscriptionTier } from '../../users/types';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

// ─── Exercise media ─────────────────────────────────────────

export type MediaOrientation = 'portrait' | 'landscape' | 'square';

/** Mirrors `ExerciseVideoResponse` from the API. */
export interface ExerciseVideo {
  id: string;
  exerciseId: string;
  kind: 'primary' | 'preview' | 'alternate_angle';
  label: string | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  visibility: 'public' | 'private';
  /** Progressive-streaming URL. Signed URLs carry `urlExpiresAt`. */
  url: string | null;
  urlExpiresAt: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  orientation: MediaOrientation | null;
  mimeType: string | null;
  fileSize: number | null;
  orderIndex: number;
  uploadedAt: string | null;
}

export interface ExerciseImage {
  id: string;
  exerciseId: string;
  kind: 'thumbnail' | 'poster' | 'preview_gif' | 'illustration';
  url: string | null;
  urlExpiresAt: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
}

/** `GET /exercise-videos/:id/playback-url` — a fresh URL for an expiring link. */
export interface PlaybackUrl {
  videoId: string;
  url: string;
  expiresAt: string | null;
  mimeType: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  orientation: MediaOrientation | null;
  thumbnailUrl: string | null;
  streaming: 'progressive';
}

// ─── Exercises ──────────────────────────────────────────────

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
  isRequired: boolean;
}

/** `GET /exercises` — the list shape: poster frame, no playback URL. */
export interface Exercise {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  difficulty: Difficulty;
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

/** `GET /exercises/:idOrSlug` — everything the exercise screen renders. */
export interface ExerciseDetail extends Exercise {
  secondaryMuscles: MuscleRef[];
  stabilizerMuscles: MuscleRef[];
  instructions: string[];
  tips: string[];
  commonMistakes: string[];
  video: ExerciseVideo | null;
  previewVideo: ExerciseVideo | null;
  videos: ExerciseVideo[];
  images: ExerciseImage[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedExercises {
  items: Exercise[];
  total: number;
  limit: number;
  offset: number;
}

export interface ExerciseTaxonomy {
  categories: (TaxonomyRef & { description: string | null; orderIndex: number })[];
  muscles: MuscleRef[];
  equipment: Omit<EquipmentRef, 'isRequired'>[];
}

// ─── Plans ──────────────────────────────────────────────────

/** The compact exercise a plan day carries — see `PlansService.findOne`. */
export interface PlanExercise {
  id: string;
  slug: string;
  name: string;
  difficulty: Difficulty;
  primaryMuscles: { slug: string; name: string }[];
  thumbnailUrl: string | null;
  hasVideo: boolean;
}

export interface WorkoutExercise {
  id: string;
  dayId: string;
  exerciseId: string;
  sets: number;
  reps: number;
  restSeconds: number;
  orderIndex: number;
  exercise: PlanExercise;
}

export interface WorkoutDay {
  id: string;
  planId: string;
  dayName: string;
  orderIndex: number;
  createdAt: string;
  exercises: WorkoutExercise[];
}

/** `GET /plans` — the list form has no `days`; `GET /plans/:id` includes them. */
export interface WorkoutPlan {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  difficulty: Difficulty | null;
  tier: SubscriptionTier;
  createdAt: string;
}

export interface WorkoutPlanDetail extends WorkoutPlan {
  days: WorkoutDay[];
}

/** Rough duration estimate: working time plus rest, since the API stores neither. */
export const estimateDayMinutes = (day: WorkoutDay): number => {
  const seconds = day.exercises.reduce(
    (total, item) => total + item.sets * (item.reps * 3 + item.restSeconds),
    0,
  );
  return Math.max(5, Math.round(seconds / 60));
};

/** Distinct primary muscles trained on a day, for the day's subtitle. */
export const muscleGroupsForDay = (day: WorkoutDay): string[] => [
  ...new Set(
    day.exercises.flatMap((item) => item.exercise?.primaryMuscles?.map((muscle) => muscle.name) ?? []),
  ),
];

/** "Chest, Triceps" — the muscle line under an exercise name. */
export const muscleNames = (muscles: { name: string }[] | undefined): string =>
  (muscles ?? []).map((muscle) => muscle.name).join(', ');
