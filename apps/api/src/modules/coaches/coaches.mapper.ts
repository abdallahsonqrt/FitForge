import type {
  CoachProfile,
  ProgramWeek,
  WorkoutExercise,
  WorkoutPlan,
} from '../../database/schema';

/**
 * Row → response shaping for the coach domain.
 *
 * These live outside the services because more than one module returns a coach:
 * the directory, a recommendation, and an enrollment all render the same card,
 * and the athlete must not be shown a different coach depending on the route.
 *
 * The mappers are also the last line of the privacy boundary. `credentials`
 * carries `documentUrl` — the proof a coach uploaded for verification — so the
 * public shape strips it and only the coach's own `GET /coaches/me` keeps it.
 */

/** A user row as much of it as a coach card needs. */
type CoachUserRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

export type CoachProfileRow = CoachProfile & { user?: CoachUserRow | null };

const list = <T>(value: T[] | null | undefined): T[] => value ?? [];

/** Certification entries with the private proof link removed. */
function publicCredentials(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const { documentUrl: _documentUrl, ...rest } = (entry ?? {}) as Record<string, unknown>;
    return rest;
  });
}

/** The directory / recommendation card. */
export function toCoachSummary(row: CoachProfileRow) {
  return {
    id: row.id,
    userId: row.userId,
    firstName: row.user?.firstName ?? null,
    lastName: row.user?.lastName ?? null,
    avatarUrl: row.user?.avatarUrl ?? null,
    headline: row.headline,
    specialties: list(row.specialties),
    verificationStatus: row.verificationStatus,
    yearsExperience: row.yearsExperience,
    languages: list(row.languages),
    monthlyPriceCents: row.monthlyPriceCents,
    responseTimeHours: row.responseTimeHours,
    acceptingClients: row.acceptingClients,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
  };
}

export type CoachSummaryResponse = ReturnType<typeof toCoachSummary>;

/**
 * The public profile screen.
 *
 * `activeClientCount` is passed in rather than counted here: the caller already
 * knows whether it needs the number, and a mapper that queries would turn a list
 * of coaches into a query per row.
 */
export function toPublicCoachProfile(row: CoachProfileRow, activeClientCount?: number) {
  return {
    ...toCoachSummary(row),
    bio: row.bio,
    supportedGoals: list(row.supportedGoals),
    supportedLevels: list(row.supportedLevels),
    supportedEquipment: list(row.supportedEquipment),
    trainingLocations: list(row.trainingLocations),
    timezone: row.timezone,
    credentials: publicCredentials(row.credentials),
    verifiedAt: row.verifiedAt,
    clientCapacity: row.clientCapacity,
    activeClientCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * The coach's own profile. Keeps `credentials` intact — including the proof
 * documents they uploaded — because this is the only view where the subject is
 * also the viewer.
 */
export function toOwnCoachProfile(row: CoachProfileRow, activeClientCount?: number) {
  return {
    ...toPublicCoachProfile(row, activeClientCount),
    credentials: Array.isArray(row.credentials) ? row.credentials : [],
  };
}

/** The program card shown in discovery and on a coach's profile. */
export function toProgramSummary(row: WorkoutPlan) {
  return {
    id: row.id,
    coachId: row.coachId,
    name: row.name,
    description: row.description,
    difficulty: row.difficulty,
    sport: row.sport,
    durationWeeks: row.durationWeeks,
    visibility: row.visibility,
    priceCents: row.priceCents,
    tier: row.tier,
    targetGoals: list(row.targetGoals),
    targetLevels: list(row.targetLevels),
    requiredEquipment: list(row.requiredEquipment),
    trainingLocations: list(row.trainingLocations),
  };
}

export type ProgramSummaryResponse = ReturnType<typeof toProgramSummary>;

type WeekRow = ProgramWeek & {
  days?: { id: string; planId: string; weekId: string | null; dayName: string; orderIndex: number }[];
};

/**
 * One prescribed exercise inside a session.
 *
 * `exercise` is the library card, attached by the caller — the mapper does not
 * fetch it, so a day of ten exercises stays one media round trip rather than ten.
 * It is optional because the coach's own write responses (create, patch) echo
 * the row back without paying for media the client already has on screen.
 */
export function toDayExercise(row: WorkoutExercise, exercise?: unknown) {
  return {
    id: row.id,
    dayId: row.dayId,
    exerciseId: row.exerciseId,
    sets: row.sets,
    reps: row.reps,
    repsMin: row.repsMin,
    repsMax: row.repsMax,
    durationSeconds: row.durationSeconds,
    restSeconds: row.restSeconds,
    tempo: row.tempo,
    rpe: row.rpe,
    notes: row.notes,
    orderIndex: row.orderIndex,
    ...(exercise === undefined ? {} : { exercise }),
  };
}

export type DayExerciseResponse = ReturnType<typeof toDayExercise>;

export function toProgramWeek(row: WeekRow) {
  return {
    id: row.id,
    planId: row.planId,
    weekNumber: row.weekNumber,
    title: row.title,
    notes: row.notes,
    days: (row.days ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((day) => ({
        id: day.id,
        planId: day.planId,
        weekId: day.weekId,
        dayName: day.dayName,
        orderIndex: day.orderIndex,
      })),
  };
}
