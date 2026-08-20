import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, count, eq, inArray, max } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { ExerciseCardService } from '../exercise-media/exercise-card.service';
import { CoachAccessService, LIVE_ENROLLMENT_STATUSES } from './coach-access.service';
import { toDayExercise, toProgramSummary, toProgramWeek } from './coaches.mapper';
import type {
  AttachWeekDaysDto,
  CreateDayExerciseDto,
  CreateProgramDto,
  CreateWeekDayDto,
  CreateWeekDto,
  ListOwnProgramsDto,
  ReorderDayExercisesDto,
  ReorderWeeksDto,
  UpdateDayExerciseDto,
  UpdateProgramDto,
  UpdateWeekDayDto,
  UpdateWeekDto,
} from './dto/program.dto';

/**
 * The coach's program builder — `/coaches/me/programs`.
 *
 * Programs, weeks and the days inside them all live in tables shared with the
 * athlete-facing catalogue, so ownership cannot be inferred from the route. Every
 * method below therefore begins by resolving the caller's coach profile and then
 * re-checking the row against it via `CoachAccessService`, including on plain
 * reads. Checking only on create would leave `GET /coaches/me/programs/:id` a
 * working read of any coach's unpublished draft.
 */
@Injectable()
export class CoachProgramsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>,
    private readonly access: CoachAccessService,
    private readonly cards: ExerciseCardService,
  ) {}

  // ─── Programs ─────────────────────────────────────────────

  async list(userId: string, dto: ListOwnProgramsDto) {
    const coach = await this.access.requireProfileByUserId(userId);

    // The coach id is a conjunct of both queries — the listing can never widen
    // past the caller, whatever the visibility filter says.
    const where = dto.visibility
      ? and(
          eq(schema.workoutPlans.coachId, coach.id),
          eq(schema.workoutPlans.visibility, dto.visibility),
        )
      : eq(schema.workoutPlans.coachId, coach.id);

    const [rows, [totals]] = await Promise.all([
      this.db.query.workoutPlans.findMany({
        where,
        orderBy: [asc(schema.workoutPlans.name)],
        limit: dto.limit,
        offset: dto.offset,
      }),
      this.db.select({ value: count() }).from(schema.workoutPlans).where(where),
    ]);

    return {
      items: rows.map(toProgramSummary),
      total: totals?.value ?? 0,
      limit: dto.limit,
      offset: dto.offset,
    };
  }

  /** One of the coach's own programs, with its full week-by-week outline. */
  async findOne(userId: string, planId: string) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedProgram(coach.id, planId);

    const plan = await this.db.query.workoutPlans.findFirst({
      // Re-scoped rather than trusting the id checked a line above: the guard and
      // the fetch are one statement apart, and only one of them returns the data.
      where: and(eq(schema.workoutPlans.id, planId), eq(schema.workoutPlans.coachId, coach.id)),
      with: {
        weeks: { with: { days: true }, orderBy: [asc(schema.programWeeks.weekNumber)] },
      },
    });
    if (!plan) throw new NotFoundException('Program not found.');

    return { ...toProgramSummary(plan), weeks: plan.weeks.map(toProgramWeek) };
  }

  async create(userId: string, dto: CreateProgramDto) {
    const coach = await this.access.requireProfileByUserId(userId);

    const [plan] = await this.db
      .insert(schema.workoutPlans)
      .values({
        ...dto,
        coachId: coach.id,
        // A coach program has no owning user; `userId` marks a personal plan.
        userId: null,
      })
      .returning();

    return toProgramSummary(plan);
  }

  async update(userId: string, planId: string, dto: UpdateProgramDto) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedProgram(coach.id, planId);

    if (dto.visibility === 'published') await this.assertPublishable(planId);

    const [plan] = await this.db
      .update(schema.workoutPlans)
      .set({ ...dto, updatedAt: new Date() })
      .where(and(eq(schema.workoutPlans.id, planId), eq(schema.workoutPlans.coachId, coach.id)))
      .returning();

    return toProgramSummary(plan);
  }

  /**
   * Publish or archive.
   *
   * Archiving rather than deleting is the intended way to retire a program:
   * `workout_plans` is referenced by live enrollments, and archived keeps every
   * athlete mid-program working while closing it to new ones.
   */
  async setVisibility(userId: string, planId: string, visibility: 'published' | 'archived' | 'draft') {
    return this.update(userId, planId, { visibility });
  }

  /**
   * Delete a program.
   *
   * Refused while any live enrollment points at it. `enrollments.plan_id` is
   * `set null` on delete, so the delete would succeed and quietly leave those
   * athletes with a coach and no plan — a silent data loss the coach never sees.
   */
  async remove(userId: string, planId: string) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedProgram(coach.id, planId);

    const [enrolled] = await this.db
      .select({ value: count() })
      .from(schema.enrollments)
      .where(
        and(
          eq(schema.enrollments.planId, planId),
          inArray(schema.enrollments.status, [...LIVE_ENROLLMENT_STATUSES]),
        ),
      );

    if ((enrolled?.value ?? 0) > 0) {
      throw new ConflictException(
        'Athletes are still enrolled on this program. Archive it instead of deleting it.',
      );
    }

    await this.db
      .delete(schema.workoutPlans)
      .where(and(eq(schema.workoutPlans.id, planId), eq(schema.workoutPlans.coachId, coach.id)));

    return { id: planId, deleted: true };
  }

  // ─── Weeks ────────────────────────────────────────────────

  async listWeeks(userId: string, planId: string) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedProgram(coach.id, planId);

    const weeks = await this.db.query.programWeeks.findMany({
      where: eq(schema.programWeeks.planId, planId),
      with: { days: true },
      orderBy: [asc(schema.programWeeks.weekNumber)],
    });
    return weeks.map(toProgramWeek);
  }

  /** Appends to the end of the program unless an explicit `weekNumber` is given. */
  async createWeek(userId: string, planId: string, dto: CreateWeekDto) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedProgram(coach.id, planId);

    const weekNumber = dto.weekNumber ?? (await this.nextWeekNumber(planId));

    const [week] = await this.db
      .insert(schema.programWeeks)
      .values({ planId, weekNumber, title: dto.title, notes: dto.notes })
      .returning();

    return toProgramWeek(week);
  }

  async updateWeek(userId: string, planId: string, weekId: string, dto: UpdateWeekDto) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedWeek(coach.id, planId, weekId);

    const [week] = await this.db
      .update(schema.programWeeks)
      .set(dto)
      .where(and(eq(schema.programWeeks.id, weekId), eq(schema.programWeeks.planId, planId)))
      .returning();

    return toProgramWeek(week);
  }

  async removeWeek(userId: string, planId: string, weekId: string) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedWeek(coach.id, planId, weekId);

    await this.db
      .delete(schema.programWeeks)
      .where(and(eq(schema.programWeeks.id, weekId), eq(schema.programWeeks.planId, planId)));

    return { id: weekId, deleted: true };
  }

  /**
   * Reorder by submitting every week id in its new order.
   *
   * The payload must name the whole program, not a moved pair — a partial
   * reorder has no single correct interpretation once two clients send one each,
   * and the mismatch check below turns a stale client into a 400 rather than a
   * scrambled program.
   */
  async reorderWeeks(userId: string, planId: string, dto: ReorderWeeksDto) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedProgram(coach.id, planId);

    const existing = await this.db.query.programWeeks.findMany({
      where: eq(schema.programWeeks.planId, planId),
      columns: { id: true },
    });

    const known = new Set(existing.map((week) => week.id));
    const submitted = new Set(dto.weekIds);
    if (submitted.size !== dto.weekIds.length) {
      throw new BadRequestException('The same week appears more than once.');
    }
    if (submitted.size !== known.size || dto.weekIds.some((id) => !known.has(id))) {
      throw new BadRequestException(
        'Send every week in this program exactly once, in the order you want them.',
      );
    }

    await this.db.transaction(async (tx) => {
      for (const [index, weekId] of dto.weekIds.entries()) {
        await tx
          .update(schema.programWeeks)
          .set({ weekNumber: index + 1 })
          .where(and(eq(schema.programWeeks.id, weekId), eq(schema.programWeeks.planId, planId)));
      }
    });

    return this.listWeeks(userId, planId);
  }

  // ─── Days within a week ───────────────────────────────────

  /** Creates a session inside a week. Appends unless `orderIndex` is given. */
  async createWeekDay(userId: string, planId: string, weekId: string, dto: CreateWeekDayDto) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedWeek(coach.id, planId, weekId);

    const orderIndex = dto.orderIndex ?? (await this.nextDayIndex(weekId));

    const [day] = await this.db
      .insert(schema.workoutDays)
      .values({ planId, weekId, dayName: dto.dayName, orderIndex })
      .returning();

    return day;
  }

  /**
   * Attach existing days of this program to a week, in the given order.
   *
   * `workout_days.week_id` is nullable, so a program can be built as a flat list
   * of sessions first and organised into weeks afterwards. The days must already
   * belong to this plan: moving a day across programs would let a coach graft one
   * program's sessions onto another's.
   */
  async attachWeekDays(userId: string, planId: string, weekId: string, dto: AttachWeekDaysDto) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedWeek(coach.id, planId, weekId);

    const days = await this.db.query.workoutDays.findMany({
      where: and(
        eq(schema.workoutDays.planId, planId),
        inArray(schema.workoutDays.id, dto.dayIds),
      ),
      columns: { id: true },
    });

    if (days.length !== new Set(dto.dayIds).size) {
      throw new BadRequestException('Every day must already belong to this program.');
    }

    await this.db.transaction(async (tx) => {
      for (const [index, dayId] of dto.dayIds.entries()) {
        await tx
          .update(schema.workoutDays)
          .set({ weekId, orderIndex: index })
          .where(and(eq(schema.workoutDays.id, dayId), eq(schema.workoutDays.planId, planId)));
      }
    });

    return this.db.query.workoutDays.findMany({
      where: eq(schema.workoutDays.weekId, weekId),
      orderBy: [asc(schema.workoutDays.orderIndex)],
    });
  }

  /**
   * Rename a session, or move it within its week.
   *
   * Scoped through `requireOwnedDay`, which anchors on `plan_id` rather than on
   * the `weekId` in the path. The week is part of the URL because that is where
   * the UI navigates from, but it is not what proves ownership — `week_id` is
   * nullable, so trusting it would leave detached days unreachable and would
   * also accept any week id at all as long as the day existed.
   */
  async updateWeekDay(
    userId: string,
    planId: string,
    weekId: string,
    dayId: string,
    dto: UpdateWeekDayDto,
  ) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedWeek(coach.id, planId, weekId);

    const [day] = await this.db
      .update(schema.workoutDays)
      .set(dto)
      .where(
        and(
          eq(schema.workoutDays.id, dayId),
          eq(schema.workoutDays.planId, planId),
          eq(schema.workoutDays.weekId, weekId),
        ),
      )
      .returning();

    if (!day) throw new NotFoundException('Program day not found.');
    return day;
  }

  /**
   * Delete a session. Its exercises go with it — `workout_exercises.day_id`
   * cascades — which is the intent: the prescription has no meaning without the
   * session it was written for.
   */
  async removeWeekDay(userId: string, planId: string, weekId: string, dayId: string) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedWeek(coach.id, planId, weekId);

    const [deleted] = await this.db
      .delete(schema.workoutDays)
      .where(
        and(
          eq(schema.workoutDays.id, dayId),
          eq(schema.workoutDays.planId, planId),
          eq(schema.workoutDays.weekId, weekId),
        ),
      )
      .returning({ id: schema.workoutDays.id });

    if (!deleted) throw new NotFoundException('Program day not found.');
    return { id: dayId, deleted: true };
  }

  // ─── Exercises within a day ───────────────────────────────

  /**
   * The prescription for one session, in order, with each exercise's library
   * card attached.
   *
   * Addressed as `programs/:planId/days/:dayId/exercises` with no week segment:
   * `workout_days.week_id` is nullable by design, so a route that required a
   * week could not reach a session that has not been filed into one yet.
   */
  async listDayExercises(userId: string, planId: string, dayId: string) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedDay(coach.id, planId, dayId);

    const rows = await this.db.query.workoutExercises.findMany({
      where: eq(schema.workoutExercises.dayId, dayId),
      orderBy: [asc(schema.workoutExercises.orderIndex)],
      with: { exercise: { with: { muscles: { with: { muscle: true } } } } },
    });

    const cards = await this.cards.cardsFor(rows.map((row) => row.exercise));
    return rows.map((row) => toDayExercise(row, cards.get(row.exerciseId) ?? null));
  }

  /** Appends to the end of the session unless an explicit `orderIndex` is given. */
  async createDayExercise(
    userId: string,
    planId: string,
    dayId: string,
    dto: CreateDayExerciseDto,
  ) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedDay(coach.id, planId, dayId);
    await this.requireLibraryExercise(dto.exerciseId);

    const { orderIndex, ...prescription } = dto;

    const [row] = await this.db
      .insert(schema.workoutExercises)
      .values({
        ...prescription,
        dayId,
        orderIndex: orderIndex ?? (await this.nextExerciseIndex(dayId)),
      })
      .returning();

    return toDayExercise(row);
  }

  /**
   * Edit one prescription.
   *
   * The update is re-scoped by `day_id` as well as by row id. Ownership was
   * proven for the day; proving it for the row means constraining the write to
   * that day, otherwise a valid day of the coach's own would authorise editing
   * any `workout_exercises` row in the database by id.
   */
  async updateDayExercise(
    userId: string,
    planId: string,
    dayId: string,
    id: string,
    dto: UpdateDayExerciseDto,
  ) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedDay(coach.id, planId, dayId);

    const [row] = await this.db
      .update(schema.workoutExercises)
      .set(dto)
      .where(and(eq(schema.workoutExercises.id, id), eq(schema.workoutExercises.dayId, dayId)))
      .returning();

    if (!row) throw new NotFoundException('Exercise not found in this session.');
    return toDayExercise(row);
  }

  async removeDayExercise(userId: string, planId: string, dayId: string, id: string) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedDay(coach.id, planId, dayId);

    const [deleted] = await this.db
      .delete(schema.workoutExercises)
      .where(and(eq(schema.workoutExercises.id, id), eq(schema.workoutExercises.dayId, dayId)))
      .returning({ id: schema.workoutExercises.id });

    if (!deleted) throw new NotFoundException('Exercise not found in this session.');
    return { id, deleted: true };
  }

  /**
   * Reorder a session by submitting every exercise id in its new order — the
   * same contract as `reorderWeeks`, and for the same reason. Two coaches (or
   * two tabs) each sending a moved pair produce a scrambled session; each
   * sending a whole list produces whichever one landed last, intact.
   */
  async reorderDayExercises(
    userId: string,
    planId: string,
    dayId: string,
    dto: ReorderDayExercisesDto,
  ) {
    const coach = await this.access.requireProfileByUserId(userId);
    await this.access.requireOwnedDay(coach.id, planId, dayId);

    const existing = await this.db.query.workoutExercises.findMany({
      where: eq(schema.workoutExercises.dayId, dayId),
      columns: { id: true },
    });

    const known = new Set(existing.map((row) => row.id));
    const submitted = new Set(dto.exerciseIds);
    if (submitted.size !== dto.exerciseIds.length) {
      throw new BadRequestException('The same exercise appears more than once.');
    }
    if (submitted.size !== known.size || dto.exerciseIds.some((id) => !known.has(id))) {
      throw new BadRequestException(
        'Send every exercise in this session exactly once, in the order you want them.',
      );
    }

    await this.db.transaction(async (tx) => {
      for (const [index, id] of dto.exerciseIds.entries()) {
        await tx
          .update(schema.workoutExercises)
          .set({ orderIndex: index })
          .where(and(eq(schema.workoutExercises.id, id), eq(schema.workoutExercises.dayId, dayId)));
      }
    });

    return this.listDayExercises(userId, planId, dayId);
  }

  // ─── Internals ────────────────────────────────────────────

  /**
   * The referenced exercise must exist and be published.
   *
   * Not an ownership check — the library is shared and referencing a public
   * exercise is not a privilege. It is a "your program will not be broken"
   * check: an unpublished exercise is hidden from the athlete app, so a program
   * built on one would render a session with a hole in it.
   */
  private async requireLibraryExercise(exerciseId: string) {
    const exercise = await this.db.query.exercises.findFirst({
      where: and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.isPublished, true)),
      columns: { id: true },
    });
    if (!exercise) throw new NotFoundException('Exercise not found in the library.');
    return exercise;
  }

  private async nextExerciseIndex(dayId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: max(schema.workoutExercises.orderIndex) })
      .from(schema.workoutExercises)
      .where(eq(schema.workoutExercises.dayId, dayId));
    return row?.value === null || row?.value === undefined ? 0 : row.value + 1;
  }

  /**
   * A program with no weeks is an empty purchase. Publishing is the moment it
   * becomes enrollable, so it is the right place to insist there is something
   * inside it.
   */
  private async assertPublishable(planId: string) {
    const [weeks] = await this.db
      .select({ value: count() })
      .from(schema.programWeeks)
      .where(eq(schema.programWeeks.planId, planId));

    if ((weeks?.value ?? 0) === 0) {
      throw new BadRequestException('Add at least one week before publishing this program.');
    }
  }

  private async nextWeekNumber(planId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: max(schema.programWeeks.weekNumber) })
      .from(schema.programWeeks)
      .where(eq(schema.programWeeks.planId, planId));
    return (row?.value ?? 0) + 1;
  }

  private async nextDayIndex(weekId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: max(schema.workoutDays.orderIndex) })
      .from(schema.workoutDays)
      .where(eq(schema.workoutDays.weekId, weekId));
    return row?.value === null || row?.value === undefined ? 0 : row.value + 1;
  }
}
