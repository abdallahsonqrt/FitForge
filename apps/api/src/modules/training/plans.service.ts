import { ForbiddenException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { ExerciseCardService } from '../exercise-media/exercise-card.service';
import { CoachAccessService, LIVE_ENROLLMENT_STATUSES } from '../coaches/coach-access.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { canAccessPlanTier, type Entitlements } from '../subscriptions/entitlements';
import { resolvePlanAccess, type PlanViewer } from './plan-access';

@Injectable()
export class PlansService {
  constructor(
    @Inject('DB_CONNECTION') private db: NodePgDatabase<typeof schema>,
    private readonly cards: ExerciseCardService,
    private readonly coachAccess: CoachAccessService,
  ) {}

  /**
   * The catalogue this caller may browse.
   *
   * Two filters, and both used to be missing one half. Tier comparison lives in
   * the entitlements model, so a legacy `elite` subscriber and a `coach`
   * subscriber see the same catalogue without this service knowing either name.
   * Visibility is filtered in SQL: an unpublished program is a coach's private
   * workspace, and listing it here put every draft in the athlete-facing
   * catalogue.
   *
   * A signed-in caller additionally sees their own personal plans whatever state
   * they are in — those are theirs, not merchandise.
   */
  async findAll(entitlements: Entitlements, userId: string | null) {
    const published = eq(schema.workoutPlans.visibility, 'published');
    const rows = await this.db.query.workoutPlans.findMany({
      where: userId ? or(published, eq(schema.workoutPlans.userId, userId)) : published,
    });

    return rows.filter(
      (plan) =>
        (plan.userId !== null && plan.userId === userId) ||
        canAccessPlanTier(entitlements, plan.tier),
    );
  }

  /**
   * A plan with its days, exercises and each exercise's poster frame.
   *
   * The access decision is made from a cheap ownership read *before* the heavy
   * relational fetch, so a caller who may not see the plan never causes it to be
   * assembled. `resolvePlanAccess` holds the rule itself.
   *
   * Media is fetched once for the whole plan rather than per exercise — a
   * four-day plan references the same lifts repeatedly, and the alternative is
   * dozens of round trips to render one screen.
   */
  async findOne(id: string, viewer: Omit<PlanViewer, 'isEnrolled' | 'coachProfileId'>) {
    const ownership = await this.db.query.workoutPlans.findFirst({
      where: eq(schema.workoutPlans.id, id),
      columns: { userId: true, coachId: true, visibility: true, tier: true },
    });
    if (!ownership) throw new NotFoundException('Plan not found.');

    const access = resolvePlanAccess(
      ownership,
      {
        ...viewer,
        coachProfileId: viewer.userId
          ? ((await this.coachAccess.findProfileByUserId(viewer.userId))?.id ?? null)
          : null,
        isEnrolled: await this.isEnrolledOnPlan(viewer.userId, id),
      },
      canAccessPlanTier,
    );

    // 404, not 403: a draft the caller may not see must be indistinguishable
    // from a plan id that was never issued.
    if (!access.visible) throw new NotFoundException('Plan not found.');
    if (!access.entitled) {
      throw new ForbiddenException(
        `This program is included with the ${ownership.tier} plan. Upgrade to open it.`,
      );
    }

    const plan = await this.db.query.workoutPlans.findFirst({
      where: eq(schema.workoutPlans.id, id),
      with: {
        days: {
          orderBy: [asc(schema.workoutDays.orderIndex)],
          with: {
            exercises: {
              orderBy: [asc(schema.workoutExercises.orderIndex)],
              with: {
                exercise: {
                  with: { muscles: { with: { muscle: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!plan) throw new NotFoundException('Plan not found.');

    const cards = await this.cards.cardsFor(
      plan.days.flatMap((day) => day.exercises.map((item) => item.exercise)),
    );

    return {
      ...plan,
      days: plan.days.map((day) => ({
        ...day,
        exercises: day.exercises.map((item) => ({
          ...item,
          exercise: cards.get(item.exerciseId) ?? null,
        })),
      })),
    };
  }

  /**
   * Create a platform catalogue plan. Admin-only at the controller.
   *
   * `userId` and `coachId` are pinned to null rather than accepted: this route
   * authors the platform's own catalogue, and a coach's programs are authored
   * through `/coaches/me/programs`, where ownership comes from the token.
   */
  async create(data: CreatePlanDto) {
    const [plan] = await this.db
      .insert(schema.workoutPlans)
      .values({ ...data, userId: null, coachId: null })
      .returning();
    return plan;
  }

  // ─── Internals ────────────────────────────────────────────

  /**
   * Whether a live enrollment puts this caller on this plan.
   *
   * Checked against `enrollments.plan_id` rather than against the coach, because
   * the question is "am I training on this?", not "do I know this coach?" — a
   * client of the coach is not thereby entitled to every other program they sell.
   */
  private async isEnrolledOnPlan(userId: string | null, planId: string): Promise<boolean> {
    if (!userId) return false;

    const enrollment = await this.db.query.enrollments.findFirst({
      where: and(
        eq(schema.enrollments.athleteUserId, userId),
        eq(schema.enrollments.planId, planId),
        inArray(schema.enrollments.status, [...LIVE_ENROLLMENT_STATUSES]),
      ),
      columns: { id: true },
    });
    return Boolean(enrollment);
  }
}
