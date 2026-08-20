import { create } from 'zustand';
import type {
  ActivityLevel,
  EquipmentSlug,
  ExperienceLevel,
  FitnessGoal,
  Gender,
  OnboardingPayload,
  TrainingLocation,
} from '../features/users/types';

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;

export interface OnboardingData {
  gender: Gender | null;
  age: number | null;
  height: { value: number; unit: 'cm' | 'ft' } | null;
  weight: { value: number; unit: 'kg' | 'lbs' } | null;
  fitnessGoal: FitnessGoal | null;
  experienceLevel: ExperienceLevel | null;
  activityLevel: ActivityLevel | null;
  dietPreferences: string[];
  workoutFrequency: number | null;

  // ─── What coach and program matching compares against ───
  /** Sport or interest slug, e.g. `calisthenics`. */
  sport: string | null;
  trainingLocation: TrainingLocation | null;
  /** Equipment slugs; an empty list means the step was skipped, not "no kit". */
  availableEquipment: EquipmentSlug[];
  sessionDurationMinutes: number | null;
}

interface OnboardingState {
  data: OnboardingData;
  setField: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void;
  reset: () => void;
  /** Body for `POST /users/me/onboarding`, with units normalised to metric. */
  toPayload: () => OnboardingPayload;
}

const initialState: OnboardingData = {
  gender: null,
  age: null,
  height: null,
  weight: null,
  fitnessGoal: null,
  experienceLevel: null,
  activityLevel: null,
  dietPreferences: [],
  workoutFrequency: null,
  sport: null,
  trainingLocation: null,
  availableEquipment: [],
  sessionDurationMinutes: null,
};

/**
 * The flow asks for an age, but the API stores a birth date. Subtracting the age
 * from today round-trips back to the same age for the rest of the year.
 */
const ageToDateOfBirth = (age: number): string => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - age);
  return date.toISOString().slice(0, 10);
};

const toCm = (height: NonNullable<OnboardingData['height']>) =>
  height.unit === 'cm' ? height.value : height.value * 12 * CM_PER_INCH;

const toKg = (weight: NonNullable<OnboardingData['weight']>) =>
  weight.unit === 'kg' ? weight.value : weight.value * KG_PER_LB;

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  data: initialState,
  setField: (field, value) => set((state) => ({ data: { ...state.data, [field]: value } })),
  reset: () => set({ data: initialState }),
  toPayload: () => {
    const {
      gender,
      age,
      height,
      weight,
      fitnessGoal,
      experienceLevel,
      activityLevel,
      dietPreferences,
      workoutFrequency,
      sport,
      trainingLocation,
      availableEquipment,
      sessionDurationMinutes,
    } = get().data;

    return {
      isOnboarded: true,
      ...(gender ? { gender } : {}),
      ...(age ? { dateOfBirth: ageToDateOfBirth(age) } : {}),
      ...(height ? { heightCm: Math.round(toCm(height) * 10) / 10 } : {}),
      ...(weight ? { weightKg: Math.round(toKg(weight) * 10) / 10 } : {}),
      ...(fitnessGoal ? { fitnessGoal } : {}),
      ...(experienceLevel ? { experienceLevel } : {}),
      ...(activityLevel ? { activityLevel } : {}),
      ...(dietPreferences.length > 0 ? { dietPreferences } : {}),
      ...(workoutFrequency ? { workoutFrequency } : {}),
      ...(sport ? { sport } : {}),
      ...(trainingLocation ? { trainingLocation } : {}),
      ...(availableEquipment.length > 0 ? { availableEquipment } : {}),
      ...(sessionDurationMinutes ? { sessionDurationMinutes } : {}),
    };
  },
}));
