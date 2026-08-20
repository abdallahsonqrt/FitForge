export type Gender = 'male' | 'female' | 'other';
export type FitnessGoal = 'weight_loss' | 'muscle_gain' | 'maintenance' | 'endurance';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active';
export type UnitSystem = 'metric' | 'imperial';
export type SubscriptionTier = 'free' | 'pro' | 'elite';

/** Matches the API's `training_location` enum. */
export type TrainingLocation = 'home' | 'gym' | 'outdoors';

/**
 * Equipment slugs the API accepts for `availableEquipment`. They mirror
 * `equipment.slug` on the backend, so a coach or program equipment filter is a
 * straight string comparison.
 */
export type EquipmentSlug =
  | 'bodyweight'
  | 'pull-up-bar'
  | 'parallel-bars'
  | 'dumbbells'
  | 'barbell'
  | 'kettlebell'
  | 'resistance-bands'
  | 'bench'
  | 'gym-access';

/** Mirrors `GET /users/me` — the `users` row with `passwordHash` stripped. */
export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  weightKg: number | null;
  fitnessGoal: FitnessGoal | null;
  experienceLevel: ExperienceLevel | null;
  activityLevel: ActivityLevel | null;
  dietPreferences: string[] | null;
  workoutFrequency: number | null;
  sport: string | null;
  trainingLocation: TrainingLocation | null;
  availableEquipment: EquipmentSlug[] | null;
  sessionDurationMinutes: number | null;
  injuriesNotes: string | null;
  unitSystem: UnitSystem;
  language: string;
  /**
   * Mirrors the API's `role` enum. `trainer` predates the coach-centric model and
   * `coach` supersedes it — both are treated as a coach by `isCoach()` because
   * existing rows may still carry the legacy value.
   */
  role: 'user' | 'admin' | 'trainer' | 'coach';
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Body accepted by `PATCH /users/me`. Every field is optional and patched. */
export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  language?: string;
  sport?: string;
  trainingLocation?: TrainingLocation;
  availableEquipment?: EquipmentSlug[];
  sessionDurationMinutes?: number;
  injuriesNotes?: string;
}

/** Body accepted by `POST /users/me/onboarding`. */
export interface OnboardingPayload {
  isOnboarded: boolean;
  gender?: Gender;
  dateOfBirth?: string;
  heightCm?: number;
  weightKg?: number;
  fitnessGoal?: FitnessGoal;
  experienceLevel?: ExperienceLevel;
  activityLevel?: ActivityLevel;
  dietPreferences?: string[];
  workoutFrequency?: number;
  sport?: string;
  trainingLocation?: TrainingLocation;
  availableEquipment?: EquipmentSlug[];
  sessionDurationMinutes?: number;
  injuriesNotes?: string;
}

export const displayName = (user: Pick<User, 'firstName' | 'lastName' | 'email'> | null | undefined): string => {
  if (!user) return '';
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.email.split('@')[0];
};
