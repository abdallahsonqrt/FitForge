/**
 * Types for the coach workspace.
 *
 * These mirror the API's response mappers rather than its database schema —
 * `apps/api/src/modules/coaches/coaches.mapper.ts` is the source of truth for the
 * profile and program shapes, `enrollments.service.ts` for clients, and
 * `messaging.types.ts` for conversations. Where the API and these types disagree,
 * the API is right and this file is stale.
 */
import type { EquipmentSlug, ExperienceLevel, FitnessGoal, TrainingLocation } from '../../users/types';

export type CoachVerificationStatus = 'pending' | 'verified' | 'rejected';
export type ProgramVisibility = 'draft' | 'published' | 'archived';
export type EnrollmentStatus = 'pending' | 'active' | 'paused' | 'completed' | 'canceled';

/** A credential a coach lists on their profile. `documentUrl` is self-only. */
export interface CoachCredential {
  name: string;
  issuer?: string;
  year?: number;
  documentUrl?: string;
}

/** `GET /coaches/me` — the coach's own profile, including private fields. */
export interface CoachProfile {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  specialties: string[];
  supportedGoals: FitnessGoal[];
  supportedLevels: ExperienceLevel[];
  supportedEquipment: EquipmentSlug[];
  trainingLocations: TrainingLocation[];
  languages: string[];
  timezone: string | null;
  yearsExperience: number | null;
  credentials: CoachCredential[];
  verificationStatus: CoachVerificationStatus;
  verifiedAt: string | null;
  responseTimeHours: number | null;
  monthlyPriceCents: number | null;
  clientCapacity: number | null;
  activeClientCount: number;
  acceptingClients: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Body for `PATCH /coaches/me`. Every field optional; an empty object is rejected. */
export interface UpdateCoachProfilePayload {
  headline?: string;
  bio?: string;
  specialties?: string[];
  supportedGoals?: FitnessGoal[];
  supportedLevels?: ExperienceLevel[];
  supportedEquipment?: EquipmentSlug[];
  trainingLocations?: TrainingLocation[];
  languages?: string[];
  timezone?: string;
  yearsExperience?: number;
  credentials?: CoachCredential[];
  responseTimeHours?: number;
  monthlyPriceCents?: number;
  clientCapacity?: number | null;
  acceptingClients?: boolean;
}

/** `GET /coaches/me/programs` item. */
export interface CoachProgram {
  id: string;
  coachId: string;
  name: string;
  description: string | null;
  difficulty: ExperienceLevel | null;
  sport: string | null;
  durationWeeks: number | null;
  visibility: ProgramVisibility;
  priceCents: number | null;
  tier: string;
  targetGoals: FitnessGoal[];
  targetLevels: ExperienceLevel[];
  requiredEquipment: EquipmentSlug[];
  trainingLocations: TrainingLocation[];
}

/** One prescribed exercise inside a workout day. */
export interface ProgramExercise {
  id: string;
  dayId: string;
  exerciseId: string;
  /** Denormalised for display; the API joins the catalogue row. */
  exerciseName?: string;
  sets: number;
  reps: number | null;
  restSeconds: number;
  orderIndex: number;
  notes?: string | null;
}

/** A workout inside a week. */
export interface ProgramDay {
  id: string;
  planId: string;
  weekId: string | null;
  dayName: string;
  orderIndex: number;
  exercises?: ProgramExercise[];
}

export interface ProgramWeek {
  id: string;
  planId: string;
  weekNumber: number;
  title: string | null;
  notes: string | null;
  days: ProgramDay[];
}

/** `GET /coaches/me/programs/:planId`. */
export interface CoachProgramDetail extends CoachProgram {
  weeks: ProgramWeek[];
}

/** Body for `POST /coaches/me/programs`. Only `name` is required. */
export interface CreateProgramPayload {
  name: string;
  description?: string;
  difficulty?: ExperienceLevel;
  durationWeeks?: number;
  sport?: string;
  targetGoals?: FitnessGoal[];
  targetLevels?: ExperienceLevel[];
  requiredEquipment?: EquipmentSlug[];
  trainingLocations?: TrainingLocation[];
  priceCents?: number | null;
}

/** The athlete fields a coach receives on their roster (`ATHLETE_COLUMNS`). */
export interface ClientAthlete {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  sport: string | null;
  fitnessGoal: FitnessGoal | null;
  experienceLevel: ExperienceLevel | null;
  trainingLocation: TrainingLocation | null;
  availableEquipment: EquipmentSlug[] | null;
}

/** `GET /enrollments/coach` item. */
export interface CoachClient {
  id: string;
  athleteUserId: string;
  coachId: string;
  planId: string | null;
  status: EnrollmentStatus;
  startedAt: string | null;
  endedAt: string | null;
  currentWeek: number | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  athlete: ClientAthlete;
  program?: Pick<CoachProgram, 'id' | 'name'> | null;
}

/** A message in a coach↔athlete thread. */
export interface Message {
  id: string;
  conversationId: string;
  senderUserId: string;
  kind: 'text' | 'form_review_request' | 'form_review_video' | 'system' | 'ai_summary';
  body: string | null;
  attachmentUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ConversationParticipant {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: 'athlete' | 'coach';
}

/** `GET /conversations` item. Note the endpoint returns a bare array, not a page. */
export interface Conversation {
  id: string;
  athleteUserId: string;
  coachUserId: string;
  enrollmentId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  participant: ConversationParticipant;
  lastMessage: Message | null;
  unreadCount: number;
}

/** `GET /conversations/:id/messages` — cursor-paged, newest first. */
export interface MessagePage {
  messages: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** A page wrapper used by several coach list endpoints. */
export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
