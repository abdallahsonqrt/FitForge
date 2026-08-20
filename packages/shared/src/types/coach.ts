// ─── Coach Types ─────────────────────────────────────────
//
// The coach-centric domain: a coach's public profile, the programs they publish,
// and the enrollment that ties an athlete to both.
//
// The union types below mirror the Postgres enums exactly, so a value read from
// the API is usable as-is. They are deliberately separate from the legacy
// `FitnessGoal` / `ExperienceLevel` enums in `user.ts`, whose members predate the
// database and do not match it.

/** Mirrors the `fitness_goal` Postgres enum. */
export type TrainingGoal = 'weight_loss' | 'muscle_gain' | 'maintenance' | 'endurance';

/** Mirrors the `experience_level` Postgres enum. */
export type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';

/** Mirrors the `training_location` Postgres enum. */
export type TrainingLocation = 'home' | 'gym' | 'outdoors';

/** Mirrors the `coach_verification_status` Postgres enum. */
export type CoachVerificationStatus = 'pending' | 'verified' | 'rejected';

/** Mirrors the `program_visibility` Postgres enum. */
export type ProgramVisibility = 'draft' | 'published' | 'archived';

/** Mirrors the `enrollment_status` Postgres enum. */
export type EnrollmentStatus = 'pending' | 'active' | 'paused' | 'completed' | 'canceled';

/** Mirrors the `coach_access_level` Postgres enum — what a subscription tier buys. */
export type CoachAccessLevel = 'none' | 'messaging' | 'priority';

/**
 * The athlete side of matching, collected during onboarding. Every field here has
 * a counterpart on a coach profile and on a program's eligibility.
 */
export interface AthleteTrainingProfile {
  /** calisthenics, bodybuilding, powerlifting, running, boxing, football… */
  sport: string | null;
  goal: TrainingGoal | null;
  level: TrainingLevel | null;
  trainingLocation: TrainingLocation | null;
  /** Equipment slugs the athlete has access to. */
  availableEquipment: string[];
  sessionDurationMinutes: number | null;
  /** Injuries and limitations. Health data — shown only to the athlete's own coach. */
  injuriesNotes: string | null;
}

export interface CoachCredential {
  name: string;
  issuer?: string;
  year?: number;
  /** Proof supplied for verification; not shown publicly. */
  documentUrl?: string;
}

/** What the coach supports — compared against `AthleteTrainingProfile` to rank matches. */
export interface CoachEligibility {
  specialties: string[];
  supportedGoals: TrainingGoal[];
  supportedLevels: TrainingLevel[];
  /** Equipment slugs the coach can program around. */
  supportedEquipment: string[];
  trainingLocations: TrainingLocation[];
}

/** Card shown in the coach directory and in recommendation lists. */
export interface CoachSummary {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  headline: string | null;
  specialties: string[];
  /** Only `verified` may be labelled as verified in the UI. */
  verificationStatus: CoachVerificationStatus;
  yearsExperience: number | null;
  languages: string[];
  monthlyPriceCents: number | null;
  responseTimeHours: number | null;
  acceptingClients: boolean;
  ratingAvg: number | null;
  ratingCount: number;
}

export interface CoachProfile extends CoachSummary, CoachEligibility {
  bio: string | null;
  /** IANA zone, e.g. "Africa/Cairo". */
  timezone: string | null;
  credentials: CoachCredential[];
  verifiedAt: string | null;
  /** Maximum concurrent active clients; null means uncapped. */
  clientCapacity: number | null;
  activeClientCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** What a coach must supply to create or update their profile. */
export interface CoachProfileInput extends Partial<CoachEligibility> {
  headline?: string;
  bio?: string;
  languages?: string[];
  timezone?: string;
  yearsExperience?: number;
  credentials?: CoachCredential[];
  responseTimeHours?: number;
  monthlyPriceCents?: number;
  clientCapacity?: number;
  acceptingClients?: boolean;
}

/** Who a program is written for — the mirror image of `CoachEligibility`. */
export interface ProgramEligibility {
  targetGoals: TrainingGoal[];
  targetLevels: TrainingLevel[];
  /** Equipment slugs the athlete must have to follow the program. */
  requiredEquipment: string[];
  trainingLocations: TrainingLocation[];
}

/** Card shown in program discovery. */
export interface ProgramSummary {
  id: string;
  coachId: string | null;
  name: string;
  description: string | null;
  difficulty: TrainingLevel | null;
  sport: string | null;
  durationWeeks: number | null;
  visibility: ProgramVisibility;
  priceCents: number | null;
  coverImageUrl?: string | null;
}

export interface CoachProgram extends ProgramSummary, ProgramEligibility {
  coach: CoachSummary | null;
  weeks: ProgramWeek[];
  createdAt: string;
  updatedAt: string;
}

/**
 * One week of a program. `days` is optional so a program outline can be fetched
 * without every session's exercises.
 */
export interface ProgramWeek {
  id: string;
  planId: string;
  weekNumber: number;
  title: string | null;
  notes: string | null;
  days?: ProgramDaySummary[];
}

export interface ProgramDaySummary {
  id: string;
  planId: string;
  weekId: string | null;
  dayName: string;
  orderIndex: number;
  exerciseCount?: number;
}

/**
 * The athlete↔coach↔program relationship. Its existence and status are what
 * authorise a coach to see an athlete's data.
 */
export interface Enrollment {
  id: string;
  athleteUserId: string;
  coachId: string;
  /** Null between programs — the coaching relationship outlives any one program. */
  planId: string | null;
  status: EnrollmentStatus;
  startedAt: string | null;
  endedAt: string | null;
  /** 1-based pointer into the program's weeks. */
  currentWeek: number;
  /** How the athlete arrived: 'onboarding', 'directory', 'invite', 'admin'. */
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Enrollment with the sides resolved — the athlete's "my coach" and the coach's client list. */
export interface EnrollmentDetail extends Enrollment {
  coach: CoachSummary | null;
  program: ProgramSummary | null;
  athlete?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
}

/** A ranked recommendation produced from an `AthleteTrainingProfile`. */
export interface CoachMatch {
  coach: CoachSummary;
  /** 0–1. Fraction of the athlete's criteria the coach satisfies. */
  score: number;
  /** Human-readable reasons, e.g. "Trains calisthenics at home". */
  reasons: string[];
  programs: ProgramSummary[];
}
