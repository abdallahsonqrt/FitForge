import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, count, eq, inArray } from 'drizzle-orm';
import * as schema from '../../database/schema';
import type { CoachProfile, ProgramWeek, WorkoutDay, WorkoutPlan } from '../../database/schema';

/**
 * The coach-domain permission boundary, in one place.
 *
 * The product rule is "coaches can access only their enrolled/assigned athletes
 * and their own content". Written inline, that rule becomes a `WHERE` clause
 * repeated across a few dozen queries, and the one place it is forgotten is a
 * coach reading another coach's clients. So every check lives here and every
 * service method starts by calling one.
 *
 * The methods throw rather than return false. A caller that forgets to branch on
 * a boolean silently grants access; a caller that forgets to await a throwing
 * check does not compile into a working request.
 *
 * Not-found and not-yours both surface as 404. Returning 403 for someone else's
 * program would confirm that the id exists, which is itself a leak from a
 * marketplace where drafts are private.
 */

/**
 * Enrollment statuses that mean the coaching relationship is live and therefore
 * still authorises access. `completed` and `canceled` deliberately do not: the
 * row stays for history, but it stops being a key.
 */
export const LIVE_ENROLLMENT_STATUSES = ['pending', 'active', 'paused'] as const;

/** Statuses that consume a slot against `coach_profiles.client_capacity`. */
export const CAPACITY_ENROLLMENT_STATUSES = ['active', 'paused'] as const;

@Injectable()
export class CoachAccessService {
  constructor(@Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>) {}

  // ─── Who is the caller ────────────────────────────────────

  /** The caller's coach profile, or null if they have never applied. */
  async findProfileByUserId(userId: string): Promise<CoachProfile | null> {
    const profile = await this.db.query.coachProfiles.findFirst({
      where: eq(schema.coachProfiles.userId, userId),
    });
    return profile ?? null;
  }

  /**
   * The caller's coach profile, required.
   *
   * The `coach` role alone is not enough to act as a coach: the role is on the
   * account, the storefront is the profile, and every ownership check below is
   * keyed on the profile id. A `coach` without a profile row is an inconsistent
   * account, not an authorised one.
   */
  async requireProfileByUserId(userId: string): Promise<CoachProfile> {
    const profile = await this.findProfileByUserId(userId);
    if (!profile) {
      throw new ForbiddenException('You do not have a coach profile yet. Apply at POST /coaches/apply.');
    }
    return profile;
  }

  /** A coach profile by id, only if it is discoverable — verified. */
  async requireVerifiedCoach(coachId: string): Promise<CoachProfile> {
    const coach = await this.db.query.coachProfiles.findFirst({
      where: eq(schema.coachProfiles.id, coachId),
    });
    if (!coach || coach.verificationStatus !== 'verified') {
      throw new NotFoundException('Coach not found.');
    }
    return coach;
  }

  // ─── Own content ──────────────────────────────────────────

  /**
   * A program, only if this coach authored it.
   *
   * Every read and every write in the program builder goes through here — not
   * just creation — because ownership is checked against the row as it is now,
   * and a program can change hands (`coach_id` is `set null` when a coach leaves).
   */
  async requireOwnedProgram(coachId: string, planId: string): Promise<WorkoutPlan> {
    const plan = await this.db.query.workoutPlans.findFirst({
      where: and(eq(schema.workoutPlans.id, planId), eq(schema.workoutPlans.coachId, coachId)),
    });
    if (!plan) throw new NotFoundException('Program not found.');
    return plan;
  }

  /** A week, only if it belongs to a program this coach authored. */
  async requireOwnedWeek(coachId: string, planId: string, weekId: string): Promise<ProgramWeek> {
    await this.requireOwnedProgram(coachId, planId);
    const week = await this.db.query.programWeeks.findFirst({
      where: and(eq(schema.programWeeks.id, weekId), eq(schema.programWeeks.planId, planId)),
    });
    if (!week) throw new NotFoundException('Program week not found.');
    return week;
  }

  /**
   * A session, only if it belongs to a program this coach authored.
   *
   * Scoped by `plan_id` rather than by week, because `workout_days.week_id` is
   * nullable by design — a program can be drafted as a flat list of sessions and
   * organised into weeks later, and those loose days still need an owner. The
   * plan is the thing that carries `coach_id`, so it is the only trustworthy
   * anchor.
   */
  async requireOwnedDay(coachId: string, planId: string, dayId: string): Promise<WorkoutDay> {
    await this.requireOwnedProgram(coachId, planId);
    const day = await this.db.query.workoutDays.findFirst({
      where: and(eq(schema.workoutDays.id, dayId), eq(schema.workoutDays.planId, planId)),
    });
    if (!day) throw new NotFoundException('Program day not found.');
    return day;
  }

  // ─── Enrolled athletes ────────────────────────────────────

  /**
   * Whether a live enrollment joins this coach to this athlete.
   *
   * This is the check behind every "may the coach see the athlete's logs,
   * messages, progress photos" question. It is exported as a boolean as well as
   * a throwing variant because a response can legitimately *include* the answer
   * (a client list showing which athletes have gone quiet), not only gate on it.
   */
  async isCoachOfAthlete(coachId: string, athleteUserId: string): Promise<boolean> {
    const enrollment = await this.db.query.enrollments.findFirst({
      where: and(
        eq(schema.enrollments.coachId, coachId),
        eq(schema.enrollments.athleteUserId, athleteUserId),
        inArray(schema.enrollments.status, [...LIVE_ENROLLMENT_STATUSES]),
      ),
      columns: { id: true },
    });
    return Boolean(enrollment);
  }

  async requireCoachOfAthlete(coachId: string, athleteUserId: string): Promise<void> {
    if (!(await this.isCoachOfAthlete(coachId, athleteUserId))) {
      throw new ForbiddenException('You are not this athlete’s coach.');
    }
  }

  /**
   * Same question, starting from a user id — for callers holding the account
   * rather than the profile. Returns false for an athlete account rather than
   * throwing, so "is the viewer this athlete's coach?" is answerable for anyone.
   */
  async isCoachUserOfAthlete(coachUserId: string, athleteUserId: string): Promise<boolean> {
    const profile = await this.findProfileByUserId(coachUserId);
    if (!profile) return false;
    return this.isCoachOfAthlete(profile.id, athleteUserId);
  }

  /** Enrollments occupying a capacity slot right now. */
  async activeClientCount(coachId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.enrollments)
      .where(
        and(
          eq(schema.enrollments.coachId, coachId),
          inArray(schema.enrollments.status, [...CAPACITY_ENROLLMENT_STATUSES]),
        ),
      );
    return row?.value ?? 0;
  }

  /** True when the coach has room for one more client. Uncapped when capacity is null. */
  async hasCapacity(coach: CoachProfile): Promise<boolean> {
    if (coach.clientCapacity === null || coach.clientCapacity === undefined) return true;
    return (await this.activeClientCount(coach.id)) < coach.clientCapacity;
  }
}
