import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';
import { athleteProfileFields } from './athlete-profile.schema';

/**
 * The onboarding flow captures the profile the app needs to derive calorie,
 * macro, water and step targets, plus the athlete profile coach and program
 * matching compares against. Every field beyond `isOnboarded` is optional so a
 * partially completed flow can still be submitted.
 */
const OnboardingSchema = z.object({
  isOnboarded: z.boolean(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dateOfBirth: z.string().optional(),
  heightCm: z.number().positive().max(300).optional(),
  weightKg: z.number().positive().max(600).optional(),
  fitnessGoal: z.enum(['weight_loss', 'muscle_gain', 'maintenance', 'endurance']).optional(),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  activityLevel: z
    .enum(['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'])
    .optional(),
  dietPreferences: z.array(z.string()).optional(),
  workoutFrequency: z.number().int().min(0).max(14).optional(),
  ...athleteProfileFields,
});

export class OnboardingDto extends createZodDto(OnboardingSchema) {}
