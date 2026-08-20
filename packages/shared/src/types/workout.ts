// ─── Workout Types ───────────────────────────────────────

export enum Difficulty {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export enum MuscleGroup {
  CHEST = 'chest',
  BACK = 'back',
  SHOULDERS = 'shoulders',
  BICEPS = 'biceps',
  TRICEPS = 'triceps',
  FOREARMS = 'forearms',
  CORE = 'core',
  QUADS = 'quads',
  HAMSTRINGS = 'hamstrings',
  GLUTES = 'glutes',
  CALVES = 'calves',
  FULL_BODY = 'full_body',
  CARDIO = 'cardio',
}

export interface WorkoutPlan {
  id: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  difficulty: Difficulty;
  tierRequired: SubscriptionTier;
  durationWeeks: number;
  targetMuscles: string[];
  isActive: boolean;
  days: WorkoutDay[];
  createdAt: string;
}

export interface WorkoutDay {
  id: string;
  planId: string;
  dayNumber: number;
  name: string;
  focusArea: string;
  estimatedMinutes: number;
  exercises: WorkoutExercise[];
}

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
 * A stored exercise video.
 *
 * `url` is what the player opens: a stable CDN URL for public media, or a signed
 * URL that expires at `urlExpiresAt` for private media. The bytes live in object
 * storage; this is metadata only.
 */
export interface ExerciseVideo {
  id: string;
  exerciseId: string;
  kind: 'primary' | 'preview' | 'alternate_angle';
  label: string | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  visibility: 'public' | 'private';
  url: string | null;
  urlExpiresAt: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  orientation: 'portrait' | 'landscape' | 'square' | null;
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
  /** Prescription used when the exercise is viewed outside a plan. */
  defaultSets: number;
  defaultReps: number;
  defaultRestSeconds: number;
  isPublished: boolean;
}

export interface ExerciseDetail extends Exercise {
  secondaryMuscles: MuscleRef[];
  stabilizerMuscles: MuscleRef[];
  /** Ordered "how to perform" steps. */
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

export interface WorkoutExercise {
  id: string;
  workoutDayId: string;
  exercise: Exercise;
  orderIndex: number;
  sets: number;
  reps: number;
  restSeconds: number;
  notes?: string;
}

export interface WorkoutSession {
  id: string;
  planId: string;
  dayId: string;
  userId: string;
  startedAt: string;
  completedAt?: string;
  exercises: WorkoutExerciseStatus[];
}

export interface WorkoutExerciseStatus {
  exerciseId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  setsCompleted: number;
}

// Import SubscriptionTier from subscription types
import type { SubscriptionTier } from './subscription';
