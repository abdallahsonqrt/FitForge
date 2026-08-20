import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { MessagingService } from '../messaging/messaging.service';
import {
  CAPACITY_ENROLLMENT_STATUSES,
  CoachAccessService,
  LIVE_ENROLLMENT_STATUSES,
} from './coach-access.service';
import { toProgramSummary } from './coaches.mapper';
import type { ClientDetailDto, DashboardDto } from './dto/coach-clients.dto';

/**
 * What a coach can see about their own clients — `/coaches/me/clients/:id` and
 * `/coaches/me/dashboard`.
 *
 * Everything an athlete logs is scoped to `req.user.id` everywhere else in the
 * product: `/progress/*` reads the caller's own weight, measurements and
 * workouts and takes no athlete parameter at all. That is the right default, and
 * it is also why a coach could not see a single number about the person they are
 * being paid to coach. This service is the deliberate exception, and it is
 * narrow on purpose:
 *
 *   - one athlete at a time, named in the path, never a bulk export;
 *   - gated on `requireCoachOfAthlete`, which demands a *live* enrollment —
 *     a finished or cancelled relationship stops being a key the moment it ends;
 *   - read-only. A coach reads their client's history; they do not write it.
 *
 * `requireCoachOfAthlete` answers 403 for "not your client" and 403 for "no such
 * user", which is the same answer either way — so the route is not an oracle for
 * which user ids exist, even though it does not use the 404 convention the
 * program routes do.
 */

/**
 * The athlete columns a coach may see on the *detail* screen.
 *
 * Wider than `ATHLETE_COLUMNS` in the enrollments service by exactly one field:
 * `injuriesNotes`. The product documents it as "shown only to the athlete's own
 * coach" (`packages/shared/src/types/coach.ts`), and until now it reached
 * nobody, so a coach was programming around injuries they could not read.
 *
 * It stays out of the *list* deliberately. A roster renders cards, and a card
 * has no room for — and no need of — someone's health history; loading it into
 * every list response would put health data in a payload that gets cached,
 * logged and rendered in a dozen places for no gain.
 */
const CLIENT_DETAIL_COLUMNS = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  sport: true,
  fitnessGoal: true,
  experienceLevel: true,
  trainingLocation: true,
  availableEquipment: true,
  sessionDurationMinutes: true,
  /** Health data. See the note above — detail view only. */
  injuriesNotes: true,
} as const;

/** Just enough of a user to label an activity row. */
const ACTIVITY_USER_COLUMNS = { id: true, firstName: true, lastName: true, avatarUrl: true } as const;

@Injectable()
export class CoachClientsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>,
    private readonly access: CoachAccessService,
    private readonly messaging: MessagingService,
  ) {}

  /**
   * `GET /coaches/me/clients/:athleteUserId` — one client, in full.
   *
   * The four series are fetched concurrently rather than sequentially: they are
   * independent, and this screen is the one a coach opens most.
   */
  async findClient(userId: string, athleteUserId: string, dto: ClientDetailDto) {
    const coach = await this.access.requireProfileByUserId(userId);
    // The gate. Everything below reads another person's health and training
    // history, so nothing below runs until a live enrollment says it may.
    await this.access.requireCoachOfAthlete(coach.id, athleteUserId);

    const [athlete, enrollments, weightLogs, measurements, workoutLogs] = await Promise.all([
      this.db.query.users.findFirst({
        where: eq(schema.users.id, athleteUserId),
        columns: CLIENT_DETAIL_COLUMNS,
      }),
      // Re-scoped to this coach: the athlete may train with more than one, and
      // the others' enrollments are none of this coach's business.
      this.db.query.enrollments.findMany({
        where: and(
          eq(schema.enrollments.athleteUserId, athleteUserId),
          eq(schema.enrollments.coachId, coach.id),
        ),
        with: { plan: true },
        orderBy: [desc(schema.enrollments.createdAt)],
      }),
      this.db.query.weightLogs.findMany({
        where: eq(schema.weightLogs.userId, athleteUserId),
        orderBy: [desc(schema.weightLogs.date)],
        limit: dto.limit,
      }),
      this.db.query.measurements.findMany({
        where: eq(schema.measurements.userId, athleteUserId),
        orderBy: [desc(schema.measurements.date)],
        limit: dto.limit,
      }),
      this.db.query.workoutLogs.findMany({
        where: eq(schema.workoutLogs.userId, athleteUserId),
        orderBy: [desc(schema.workoutLogs.completedAt)],
        limit: dto.limit,
      }),
    ]);

    if (!athlete) throw new NotFoundException('Athlete not found.');

    const live = enrollments.find((row) =>
      (LIVE_ENROLLMENT_STATUSES as readonly string[]).includes(row.status),
    );

    return {
      athlete,
      /** The relationship as it stands: what to show at the top of the screen. */
      enrollment: live
        ? {
            id: live.id,
            status: live.status,
            currentWeek: live.currentWeek,
            startedAt: live.startedAt,
            source: live.source,
            program: live.plan ? toProgramSummary(live.plan) : null,
          }
        : null,
      /** Every enrollment this pair has ever had, so history is visible too. */
      history: enrollments.map((row) => ({
        id: row.id,
        status: row.status,
        planId: row.planId,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
      })),
      weightLogs,
      measurements,
      workoutLogs,
      /**
       * Derived so the client card can say "quiet for 9 days" without the UI
       * re-deriving the same number from three arrays and getting it wrong.
       */
      activity: {
        lastWorkoutAt: workoutLogs[0]?.completedAt ?? null,
        lastWeightLogAt: weightLogs[0]?.date ?? null,
        latestWeightKg: weightLogs[0]?.weightKg ?? null,
        workoutsLogged: workoutLogs.length,
      },
    };
  }

  /**
   * `GET /coaches/me/dashboard` — the home screen in one request.
   *
   * These counts were reachable before, but only as four separate calls
   * (`/enrollments/coach?status=active`, `/coaches/me/programs`,
   * `/conversations/unread-count`, `/coaches/me`), and "recent activity" had no
   * source at all. Four round trips on app open, on mobile, is the difference
   * between a dashboard that feels instant and one that pops in four times.
   */
  async dashboard(userId: string, dto: DashboardDto) {
    const coach = await this.access.requireProfileByUserId(userId);

    const [
      activeClients,
      pendingRequests,
      programCounts,
      unread,
      recentRequests,
      recentActivity,
    ] = await Promise.all([
      this.access.activeClientCount(coach.id),
      this.countEnrollments(coach.id, ['pending']),
      this.countProgramsByVisibility(coach.id),
      this.messaging.unreadCount(userId),
      this.recentRequests(coach.id, dto.limit),
      this.recentClientActivity(coach.id, dto.limit),
    ]);

    return {
      coachId: coach.id,
      counts: {
        activeClients,
        pendingRequests,
        publishedPrograms: programCounts.published,
        draftPrograms: programCounts.draft,
        archivedPrograms: programCounts.archived,
        unreadMessages: unread.unreadCount,
        /** Null when uncapped, mirroring `coach_profiles.client_capacity`. */
        clientCapacity: coach.clientCapacity,
      },
      recentRequests,
      recentActivity,
    };
  }

  // ─── Internals ────────────────────────────────────────────

  private async countEnrollments(coachId: string, statuses: readonly string[]): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.enrollments)
      .where(
        and(
          eq(schema.enrollments.coachId, coachId),
          inArray(schema.enrollments.status, statuses as never),
        ),
      );
    return row?.value ?? 0;
  }

  /** One grouped query rather than three counts, since the dashboard wants all of them. */
  private async countProgramsByVisibility(coachId: string) {
    const rows = await this.db
      .select({ visibility: schema.workoutPlans.visibility, value: count() })
      .from(schema.workoutPlans)
      .where(eq(schema.workoutPlans.coachId, coachId))
      .groupBy(schema.workoutPlans.visibility);

    const byVisibility = new Map(rows.map((row) => [row.visibility, row.value]));
    return {
      draft: byVisibility.get('draft') ?? 0,
      published: byVisibility.get('published') ?? 0,
      archived: byVisibility.get('archived') ?? 0,
    };
  }

  /** Enrolment requests waiting on the coach — the one thing that needs answering. */
  private async recentRequests(coachId: string, limit: number) {
    const rows = await this.db.query.enrollments.findMany({
      where: and(
        eq(schema.enrollments.coachId, coachId),
        eq(schema.enrollments.status, 'pending'),
      ),
      with: { athlete: { columns: ACTIVITY_USER_COLUMNS }, plan: true },
      orderBy: [desc(schema.enrollments.createdAt)],
      limit,
    });

    return rows.map((row) => ({
      enrollmentId: row.id,
      requestedAt: row.createdAt,
      source: row.source,
      athlete: row.athlete ?? null,
      program: row.plan ? toProgramSummary(row.plan) : null,
    }));
  }

  /**
   * Recent workouts across this coach's live clients.
   *
   * The join to `enrollments` *is* the access control — a log can only be
   * selected through a row that names this coach — which is why the athlete ids
   * are never listed out in application code and then trusted.
   *
   * Narrower than `findClient` above on purpose. That endpoint accepts any live
   * enrollment, `pending` included, because a coach has to be able to look at
   * the request they are being asked to accept. This is an ambient feed that
   * runs whether or not the coach asked about anyone, and someone who has merely
   * requested a coach has not agreed to be watched — so it is restricted to the
   * statuses where the relationship has actually been accepted.
   */
  private async recentClientActivity(coachId: string, limit: number) {
    const rows = await this.db
      .select({
        logId: schema.workoutLogs.id,
        completedAt: schema.workoutLogs.completedAt,
        durationSeconds: schema.workoutLogs.durationSeconds,
        planId: schema.workoutLogs.planId,
        athleteUserId: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.workoutLogs)
      .innerJoin(
        schema.enrollments,
        eq(schema.enrollments.athleteUserId, schema.workoutLogs.userId),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.workoutLogs.userId))
      .where(
        and(
          eq(schema.enrollments.coachId, coachId),
          inArray(schema.enrollments.status, [...CAPACITY_ENROLLMENT_STATUSES]),
        ),
      )
      .orderBy(desc(schema.workoutLogs.completedAt))
      .limit(limit);

    return rows.map((row) => ({
      kind: 'workout' as const,
      logId: row.logId,
      at: row.completedAt,
      durationSeconds: row.durationSeconds,
      planId: row.planId,
      athlete: {
        id: row.athleteUserId,
        firstName: row.firstName,
        lastName: row.lastName,
        avatarUrl: row.avatarUrl,
      },
    }));
  }
}
