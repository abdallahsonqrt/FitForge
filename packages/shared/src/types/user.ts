// ─── Enums ───────────────────────────────────────────────

import type { SubscriptionInfo } from './subscription';
import type { TrainingLocation } from './coach';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum FitnessGoal {
  LOSE_WEIGHT = 'lose_weight',
  BUILD_MUSCLE = 'build_muscle',
  IMPROVE_ENDURANCE = 'improve_endurance',
  STAY_ACTIVE = 'stay_active',
  GAIN_FLEXIBILITY = 'gain_flexibility',
  GENERAL_FITNESS = 'general_fitness',
}

export enum ExperienceLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export enum ActivityLevel {
  SEDENTARY = 'sedentary',
  LIGHTLY_ACTIVE = 'lightly_active',
  MODERATELY_ACTIVE = 'moderately_active',
  VERY_ACTIVE = 'very_active',
  EXTREMELY_ACTIVE = 'extremely_active',
}

export enum UnitSystem {
  METRIC = 'metric',
  IMPERIAL = 'imperial',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  /** Publishes programs and coaches athletes. Backed by a `coach_profiles` row. */
  COACH = 'coach',
  /** @deprecated Legacy, superseded by `COACH`. Retained for existing accounts. */
  TRAINER = 'trainer',
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  gender?: Gender;
  dateOfBirth?: string;
  heightCm?: number;
  weightKg?: number;
  fitnessGoal?: FitnessGoal;
  experienceLevel?: ExperienceLevel;
  activityLevel?: ActivityLevel;
  dietPreferences?: string;
  workoutFrequency?: number;
  // ─── Coach matching (see AthleteTrainingProfile in ./coach) ───
  sport?: string;
  trainingLocation?: TrainingLocation;
  /** Equipment slugs the athlete has access to. */
  availableEquipment?: string[];
  sessionDurationMinutes?: number;
  /** Injuries and limitations. Health data — visible only to the athlete's own coach. */
  injuriesNotes?: string;
  unitSystem: UnitSystem;
  language: string;
  role: UserRole;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingData {
  gender: Gender;
  dateOfBirth: string;
  heightCm: number;
  weightKg: number;
  fitnessGoal: FitnessGoal;
  experienceLevel: ExperienceLevel;
  activityLevel: ActivityLevel;
  dietPreferences: string;
  workoutFrequency: number;
  // Optional so the existing onboarding flow keeps compiling; the coach-centric
  // flow collects these to produce a first coach/program match.
  sport?: string;
  trainingLocation?: TrainingLocation;
  availableEquipment?: string[];
  sessionDurationMinutes?: number;
  injuriesNotes?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  onboardingComplete: boolean;
  subscription: SubscriptionInfo;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  user: UserProfile;
  tokens: AuthTokens;
}
