import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import * as schema from '../../database/schema';
import type { Enrollment } from '../../database/schema';
import { CoachAccessService, LIVE_ENROLLMENT_STATUSES } from '../coaches/coach-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toCoachSummary, toProgramSummary } from '../coaches/coaches.mapper';
import type {
  CreateEnrollmentDto,
  EnrollmentStatusDto,
  ListEnrollmentsDto,
  UpdateEnrollmentDto,
} from './dto/enrollment.dto';

/**
 * Enrollments — the athlete↔coach↔program relationship.
 *
 * This row is the key to the whole permission model: a coach may read an
 * athlete's logs, messages and progress only while a live enrollment joins them.
 * That makes creating one a gate rather than an insert, and every guard below
 * exists to stop a relationship being formed that the coach never agreed to or
 * cannot honour.
 */

/**
 * The legal status graph.
 *
 * `completed` and `canceled` are terminal: they are the historical record of a
 * finished relationship, and re-opening one would rewrite what happened rather
 * than record what is happening. Restarting means a new enrollment.
 */
const TRANSITIONS: Record<EnrollmentStatusDto, readonly EnrollmentStatusDto[]> = {
  pending: ['active', 'canceled'],
  active: ['paused', 'completed', 'canceled'],
  paused: ['active', 'completed', 'canceled'],
  completed: [],
  canceled: [],
};

/** Which side of the relationship the caller is on. */
type Actor = { isAthlete: boolean; isCoach: boolean; coachId: string | null };

/** The user columns a coach is entitled to see for their own client. */
const ATHLETE_COLUMNS = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  sport: true,
  fitnessGoal: true,
  experienceLevel: true,
  trainingLocation: true,
  availableEquipment: true,
} as const;

const COACH_USER_COLUMNS = { id: true, firstName: true, lastName: true, avatarUrl: true } as const;

@Injectable()
export class EnrollmentsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>,
    private readonly access: CoachAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * `POST /enrollments` — an athlete enrols with a coach.
   *
   * Every rejection here protects a promise the product makes before purchase:
   * that the coach is vetted, that they said they had room, and that the program
   * on offer is one they actually finished writing.
   */
  async create(userId: string, dto: CreateEnrollmentDto) {
    // 404 rather than 403 for an unverified coach: a pending or rejected
    // application is not public information.
    const coach = await this.access.requireVerifiedCoach(dto.coachId);

    if (coach.userId === userId) {
      throw new BadRequestException('You cannot enrol with yourself.');
    }
    if (!coach.acceptingClients) {
      throw new ConflictException('This coach is not accepting new clients right now.');
    }
    if (!(await this.access.hasCapacity(coach))) {
      throw new ConflictException('This coach is at their client capacity right now.');
    }

    // One live relationship per coach. A second would double-bill the athlete and
    // give the coach two client rows for one person.
    const duplicate = await this.db.query.enrollments.findFirst({
      where: and(
        eq(schema.enrollments.athleteUserId, userId),
        eq(schema.enrollments.coachId, coach.id),
        inArray(schema.enrollments.status, [...LIVE_ENROLLMENT_STATUSES]),
      ),
      columns: { id: true, status: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `You already have a ${duplicate.status} enrollment with this coach.`,
      );
    }

    if (dto.planId) await this.requireEnrollableProgram(coach.id, dto.planId);

    const [created] = await this.db
      .insert(schema.enrollments)
      .values({
        athleteUserId: userId,
        coachId: coach.id,
        planId: dto.planId ?? null,
        // The coach accepts; `startedAt` is set then, not now.
        status: 'pending',
        source: dto.source ?? 'directory',
      })
      .returning();

    // The coach's roster shows this as pending; without a notification they have
    // no reason to go and look.
    // The enrollment row exists; a failed notification must not undo it.
    await this.notifications
      .notify({
        userId: coach.userId,
        title: 'New client request',
        message: 'An athlete has asked to train with you.',
        type: 'enrollment',
      })
      .catch(() => undefined);

    return this.findByIdForParty(created.id, { isAthlete: true, isCoach: false, coachId: null });
  }

  /** `GET /enrollments/me` — the athlete's own enrollments, coach and program joined. */
  async listMine(userId: string, dto: ListEnrollmentsDto) {
    const where = dto.status
      ? and(
          eq(schema.enrollments.athleteUserId, userId),
          eq(schema.enrollments.status, dto.status),
        )
      : eq(schema.enrollments.athleteUserId, userId);

    const [rows, [totals]] = await Promise.all([
      this.db.query.enrollments.findMany({
        where,
        with: { coach: { with: { user: { columns: COACH_USER_COLUMNS } } }, plan: true },
        orderBy: [desc(schema.enrollments.createdAt)],
        limit: dto.limit,
        offset: dto.offset,
      }),
      this.db.select({ value: count() }).from(schema.enrollments).where(where),
    ]);

    return {
      items: rows.map((row) => this.toAthleteView(row)),
      total: totals?.value ?? 0,
      limit: dto.limit,
      offset: dto.offset,
    };
  }

  /**
   * `GET /enrollments/coach` — the coach's client list.
   *
   * Scoped to the caller's own coach profile id, resolved from their token. There
   * is no parameter for whose clients to list, so the route has no shape that
   * could address another coach's roster.
   */
  async listForCoach(userId: string, dto: ListEnrollmentsDto) {
    const coach = await this.access.requireProfileByUserId(userId);

    const where = dto.status
      ? and(eq(schema.enrollments.coachId, coach.id), eq(schema.enrollments.status, dto.status))
      : eq(schema.enrollments.coachId, coach.id);

    const [rows, [totals]] = await Promise.all([
      this.db.query.enrollments.findMany({
        where,
        with: { athlete: { columns: ATHLETE_COLUMNS }, plan: true },
        orderBy: [desc(schema.enrollments.createdAt)],
        limit: dto.limit,
        offset: dto.offset,
      }),
      this.db.select({ value: count() }).from(schema.enrollments).where(where),
    ]);

    return {
      items: rows.map((row) => ({
        ...this.toBase(row),
        athlete: row.athlete ?? null,
        program: row.plan ? toProgramSummary(row.plan) : null,
      })),
      total: totals?.value ?? 0,
      limit: dto.limit,
      offset: dto.offset,
    };
  }

  /**
   * `PATCH /enrollments/:id` — status transitions and program reassignment.
   *
   * Both sides may act, but not on the same things. Accepting a request is the
   * coach's decision (it is what commits their capacity and starts the clock),
   * and choosing which program a client follows is coaching. An athlete can
   * always leave: pausing and cancelling stay open to them.
   */
  async update(userId: string, enrollmentId: string, dto: UpdateEnrollmentDto) {
    const enrollment = await this.db.query.enrollments.findFirst({
      where: eq(schema.enrollments.id, enrollmentId),
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found.');

    const actor = await this.resolveActor(userId, enrollment);
    // 404, not 403: confirming that someone else's enrollment exists is itself a
    // disclosure about who is coaching whom.
    if (!actor.isAthlete && !actor.isCoach) throw new NotFoundException('Enrollment not found.');

    const patch: Partial<typeof schema.enrollments.$inferInsert> = { updatedAt: new Date() };

    if (dto.planId !== undefined) {
      if (!actor.isCoach) {
        throw new BadRequestException('Only your coach can change which program you are on.');
      }
      if (dto.planId) await this.requireEnrollableProgram(enrollment.coachId, dto.planId);
      patch.planId = dto.planId;
      // A new program restarts the week pointer; week 4 of the old plan means
      // nothing in the new one.
      patch.currentWeek = 1;
    }

    if (dto.status !== undefined && dto.status !== enrollment.status) {
      await this.applyStatusChange(enrollment, dto.status, actor, patch);
    }

    const [updated] = await this.db
      .update(schema.enrollments)
      .set(patch)
      .where(eq(schema.enrollments.id, enrollment.id))
      .returning();

    if (patch.status && patch.status !== enrollment.status) {
      await this.notifyStatusChange(enrollment, patch.status, actor);
    }

    return this.findByIdForParty(updated.id, actor);
  }

  /**
   * Tell whoever did *not* make the change that it happened.
   *
   * The actor already knows — they just tapped the button — so notifying them
   * would be noise. Which side that is depends on who acted: a coach accepting
   * notifies the athlete, an athlete cancelling notifies the coach.
   */
  private async notifyStatusChange(
    enrollment: Enrollment,
    next: EnrollmentStatusDto,
    actor: Actor,
  ): Promise<void> {
    const copy: Partial<Record<EnrollmentStatusDto, { title: string; message: string }>> = {
      active: {
        title: 'Enrollment active',
        message: 'Your coaching has started. Your program is ready.',
      },
      paused: { title: 'Enrollment paused', message: 'This coaching has been paused.' },
      completed: { title: 'Enrollment complete', message: 'This coaching has finished.' },
      canceled: { title: 'Enrollment canceled', message: 'This coaching has been canceled.' },
    };

    const body = copy[next];
    if (!body) return;

    // The coach row holds a profile id; the notification needs the account.
    const recipientId = actor.isCoach
      ? enrollment.athleteUserId
      : await this.coachUserIdFor(enrollment.coachId);

    if (!recipientId) return;

    await this.notifications
      .notify({
        userId: recipientId,
        title: body.title,
        message: body.message,
        type: 'enrollment',
      })
      .catch(() => undefined);
  }

  /** `coach_profiles.id` → the coach's `users.id`. */
  private async coachUserIdFor(coachId: string): Promise<string | null> {
    const profile = await this.db.query.coachProfiles.findFirst({
      where: eq(schema.coachProfiles.id, coachId),
      columns: { userId: true },
    });
    return profile?.userId ?? null;
  }

  // ─── Internals ────────────────────────────────────────────

  private async applyStatusChange(
    enrollment: Enrollment,
    next: EnrollmentStatusDto,
    actor: Actor,
    patch: Partial<typeof schema.enrollments.$inferInsert>,
  ) {
    const allowed = TRANSITIONS[enrollment.status];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        allowed.length === 0
          ? `A ${enrollment.status} enrollment cannot change status. Create a new enrollment instead.`
          : `Cannot go from ${enrollment.status} to ${next}. Allowed: ${allowed.join(', ')}.`,
      );
    }

    if (next === 'active') {
      if (enrollment.status === 'pending' && !actor.isCoach) {
        throw new BadRequestException('Your coach accepts the request before training starts.');
      }
      // Re-checked on every activation, not only at request time: the coach may
      // have filled the last slot while this request sat pending.
      const coach = await this.access.requireVerifiedCoach(enrollment.coachId);
      if (!(await this.access.hasCapacity(coach))) {
        throw new ConflictException('This coach is at their client capacity right now.');
      }
      // Preserved across a pause so "coaching since" stays the real start date.
      patch.startedAt = enrollment.startedAt ?? new Date();
      patch.endedAt = null;
    }

    if (next === 'completed' || next === 'canceled') {
      patch.endedAt = new Date();
    }

    patch.status = next;
  }

  /** The program must be this coach's own and published before anyone can be put on it. */
  private async requireEnrollableProgram(coachId: string, planId: string) {
    const plan = await this.db.query.workoutPlans.findFirst({
      where: and(eq(schema.workoutPlans.id, planId), eq(schema.workoutPlans.coachId, coachId)),
    });
    if (!plan) throw new NotFoundException('Program not found for this coach.');
    if (plan.visibility !== 'published') {
      throw new ConflictException('That program is not published yet.');
    }
    return plan;
  }

  private async resolveActor(userId: string, enrollment: Enrollment): Promise<Actor> {
    const profile = await this.access.findProfileByUserId(userId);
    return {
      isAthlete: enrollment.athleteUserId === userId,
      isCoach: Boolean(profile) && profile!.id === enrollment.coachId,
      coachId: profile?.id ?? null,
    };
  }

  /**
   * Re-read after a write, shaped for whoever asked. The coach sees the athlete,
   * the athlete sees the coach — neither response is a superset of the other.
   */
  private async findByIdForParty(enrollmentId: string, actor: Actor) {
    const row = await this.db.query.enrollments.findFirst({
      where: eq(schema.enrollments.id, enrollmentId),
      with: {
        coach: { with: { user: { columns: COACH_USER_COLUMNS } } },
        plan: true,
        athlete: { columns: ATHLETE_COLUMNS },
      },
    });
    if (!row) throw new NotFoundException('Enrollment not found.');

    return {
      ...this.toBase(row),
      coach: row.coach ? toCoachSummary(row.coach) : null,
      program: row.plan ? toProgramSummary(row.plan) : null,
      athlete: actor.isCoach ? (row.athlete ?? null) : undefined,
    };
  }

  private toAthleteView(row: Enrollment & { coach?: any; plan?: any }) {
    return {
      ...this.toBase(row),
      coach: row.coach ? toCoachSummary(row.coach) : null,
      program: row.plan ? toProgramSummary(row.plan) : null,
    };
  }

  private toBase(row: Enrollment) {
    return {
      id: row.id,
      athleteUserId: row.athleteUserId,
      coachId: row.coachId,
      planId: row.planId,
      status: row.status,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      currentWeek: row.currentWeek,
      source: row.source,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
