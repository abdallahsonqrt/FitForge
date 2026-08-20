import type { ActivityLevel, FitnessGoal, Gender, User } from '../features/users/types';

/**
 * Daily targets used across the dashboard, nutrition and progress screens.
 *
 * The API has no goals endpoint, so these are derived from the profile captured
 * during onboarding rather than hardcoded per screen. When a field is missing the
 * corresponding fallback below is used, so a half-finished profile still renders.
 */
export interface DailyGoals {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  waterMl: number;
  steps: number;
  /** True when the numbers are generic defaults because the profile is incomplete. */
  isEstimated: boolean;
}

/** How much one tap of the water "+" logs. Displayed in the user's preferred unit. */
export const WATER_INCREMENT_ML = 250;

/** Used when the profile has nothing to compute from — a moderately active adult. */
const FALLBACK_GOALS: Omit<DailyGoals, 'isEstimated'> = {
  calories: 2000,
  proteinGrams: 120,
  carbsGrams: 225,
  fatGrams: 67,
  waterMl: 2500,
  steps: 8000,
};

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

const STEP_GOAL: Record<ActivityLevel, number> = {
  sedentary: 6000,
  lightly_active: 8000,
  moderately_active: 10000,
  very_active: 12000,
  extra_active: 14000,
};

/** Calorie delta applied to maintenance, as a fraction. */
const GOAL_CALORIE_ADJUSTMENT: Record<FitnessGoal, number> = {
  weight_loss: -0.2,
  muscle_gain: 0.15,
  maintenance: 0,
  endurance: 0.1,
};

/** Protein target in grams per kg of bodyweight. */
const GOAL_PROTEIN_PER_KG: Record<FitnessGoal, number> = {
  weight_loss: 2.0,
  muscle_gain: 1.8,
  maintenance: 1.6,
  endurance: 1.6,
};

/** Mifflin-St Jeor sex constant; `other` sits midway between the two. */
const BMR_SEX_OFFSET: Record<Gender, number> = { male: 5, female: -161, other: -78 };

export function calculateAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age > 0 && age < 120 ? age : null;
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Mifflin-St Jeor BMR × activity multiplier, adjusted for the user's stated goal.
 * Macros split protein by bodyweight, fat at 25% of calories, carbs as the remainder.
 */
export function deriveDailyGoals(user: User | null | undefined): DailyGoals {
  const age = calculateAge(user?.dateOfBirth);
  const heightCm = user?.heightCm ?? null;
  const weightKg = user?.weightKg ?? null;
  const activityLevel = user?.activityLevel ?? 'moderately_active';
  const fitnessGoal = user?.fitnessGoal ?? 'maintenance';

  if (!age || !heightCm || !weightKg) {
    return { ...FALLBACK_GOALS, steps: STEP_GOAL[activityLevel], isEstimated: true };
  }

  const bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + BMR_SEX_OFFSET[user?.gender ?? 'other'];
  const maintenance = bmr * ACTIVITY_MULTIPLIER[activityLevel];
  const calories = clamp(
    roundTo(maintenance * (1 + GOAL_CALORIE_ADJUSTMENT[fitnessGoal]), 10),
    1200,
    5000,
  );

  const proteinGrams = Math.round(weightKg * GOAL_PROTEIN_PER_KG[fitnessGoal]);
  const fatGrams = Math.round((calories * 0.25) / 9);
  const carbsGrams = Math.max(
    0,
    Math.round((calories - proteinGrams * 4 - fatGrams * 9) / 4),
  );

  // ~35 ml per kg of bodyweight, rounded to a whole increment.
  const waterMl = clamp(roundTo(weightKg * 35, WATER_INCREMENT_ML), 1500, 4000);

  return {
    calories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    waterMl,
    steps: STEP_GOAL[activityLevel],
    isEstimated: false,
  };
}
