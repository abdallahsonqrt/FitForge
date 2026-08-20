import { Injectable, Inject, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, count, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';

/**
 * The facts every badge rule is decided from. Gathered once per evaluation so a
 * dozen rules cost a handful of aggregates rather than a query each.
 */
export interface BadgeFacts {
  workoutCount: number;
  earlyWorkoutCount: number;
  lateWorkoutCount: number;
  mealCount: number;
  longestStreak: number;
  /** Kilograms lost from the earliest recorded weight to the most recent. */
  weightLostKg: number;
}

/**
 * The badge catalogue is seeded by name (`database/seed.ts`), so the rules key
 * off the same names. A badge in the database with no rule here is simply never
 * awarded — which is the correct behaviour for the two below that nothing can
 * yet decide.
 *
 * ─── Deliberately unimplemented ──────────────────────────────────────
 *
 * **Perfect Week** ("Hit every planned workout in a week") needs to know which
 * sessions were *planned* for a given week and which of those were completed.
 * `workout_logs` records a `plan_id` but not which day of which week it
 * satisfied, and catalogue plans carry no per-user schedule at all, so there is
 * no honest way to compute "every planned workout". Awarding it on a guess
 * would be worse than not awarding it.
 *
 * **Hydration Hero** ("Hit your water goal 30 days in a row") needs a per-user
 * water goal. The goal is derived on the client (`mobile/src/utils/goals.ts`)
 * from height, weight and activity level, and is never sent to or stored by the
 * API. Deciding it here would mean a second, independent implementation of the
 * goal formula that could silently disagree with the one the user sees.
 *
 * Both become straightforward once the missing data exists: a completed-session
 * link for the first, a stored `daily_water_goal_ml` for the second.
 */
export const BADGE_RULES: Record<string, (facts: BadgeFacts) => boolean> = {
  'First Steps': (f) => f.workoutCount >= 1,
  'Half Century': (f) => f.workoutCount >= 50,
  Centurion: (f) => f.workoutCount >= 100,

  // Streak badges read `longestStreak`: "reach a 7-day streak" is something you
  // did, not something you have to still be doing when the badge is checked.
  'Week Warrior': (f) => f.longestStreak >= 7,
  'Monthly Master': (f) => f.longestStreak >= 30,
  'Century Club': (f) => f.longestStreak >= 100,

  'Early Bird': (f) => f.earlyWorkoutCount >= 10,
  'Night Owl': (f) => f.lateWorkoutCount >= 10,

  Transformation: (f) => f.weightLostKg >= 5,
  'Meal Master': (f) => f.mealCount >= 100,
};

/** Local hours that count as "before 7 AM" and "after 9 PM". */
const EARLY_BEFORE_HOUR = 7;
const LATE_FROM_HOUR = 21;

@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(@Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>) {}

  /**
   * Award whatever this user has newly earned.
   *
   * Safe to call after any logged activity: it is idempotent, because
   * `user_badges` carries a unique index on `(user_id, badge_id)` and the insert
   * takes `onConflictDoNothing`. A user who already holds a badge keeps their
   * original `earned_at` rather than having it refreshed.
   *
   * Returns the badges awarded *by this call*, so a caller can tell the user
   * what they just unlocked.
   */
  async evaluate(userId: string): Promise<{ id: string; name: string }[]> {
    const facts = await this.gatherFacts(userId);

    const earnedNames = Object.entries(BADGE_RULES)
      .filter(([, rule]) => rule(facts))
      .map(([name]) => name);

    if (earnedNames.length === 0) return [];

    // Resolve names to ids, and skip anything the user already holds.
    const catalogue = await this.db
      .select({ id: schema.badges.id, name: schema.badges.name })
      .from(schema.badges)
      .where(inArray(schema.badges.name, earnedNames));

    if (catalogue.length === 0) return [];

    const held = await this.db
      .select({ badgeId: schema.userBadges.badgeId })
      .from(schema.userBadges)
      .where(
        and(
          eq(schema.userBadges.userId, userId),
          inArray(
            schema.userBadges.badgeId,
            catalogue.map((badge) => badge.id),
          ),
        ),
      );

    const heldIds = new Set(held.map((row) => row.badgeId));
    const toAward = catalogue.filter((badge) => !heldIds.has(badge.id));

    if (toAward.length === 0) return [];

    await this.db
      .insert(schema.userBadges)
      .values(toAward.map((badge) => ({ userId, badgeId: badge.id })))
      // Another request evaluating the same user concurrently may have just
      // awarded these; the unique index makes that a no-op rather than a crash.
      .onConflictDoNothing();

    this.logger.log(`Awarded ${toAward.length} badge(s) to ${userId}: ${toAward.map((b) => b.name).join(', ')}`);
    return toAward;
  }

  /**
   * Never throws. Badge evaluation is a reward for having done something else —
   * logging a workout or a meal — and must not be able to fail the thing it is
   * rewarding.
   */
  async evaluateQuietly(userId: string): Promise<void> {
    try {
      await this.evaluate(userId);
    } catch (error) {
      this.logger.error(
        `Badge evaluation failed for ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async gatherFacts(userId: string): Promise<BadgeFacts> {
    const hour = sql<number>`extract(hour from ${schema.workoutLogs.completedAt})`;

    const [workouts, meals, streak, weights] = await Promise.all([
      this.db
        .select({
          total: count(),
          early: sql<number>`count(*) filter (where ${hour} < ${EARLY_BEFORE_HOUR})`,
          late: sql<number>`count(*) filter (where ${hour} >= ${LATE_FROM_HOUR})`,
        })
        .from(schema.workoutLogs)
        .where(eq(schema.workoutLogs.userId, userId)),

      this.db
        .select({ total: count() })
        .from(schema.meals)
        .where(eq(schema.meals.userId, userId)),

      this.db
        .select({ longest: schema.streaks.longestStreak })
        .from(schema.streaks)
        .where(eq(schema.streaks.userId, userId)),

      // Earliest and latest weights in one round trip.
      this.db
        .select({
          first: sql<number | null>`(array_agg(${schema.weightLogs.weightKg} order by ${schema.weightLogs.date} asc))[1]`,
          latest: sql<number | null>`(array_agg(${schema.weightLogs.weightKg} order by ${schema.weightLogs.date} desc))[1]`,
        })
        .from(schema.weightLogs)
        .where(eq(schema.weightLogs.userId, userId)),
    ]);

    const first = weights[0]?.first ?? null;
    const latest = weights[0]?.latest ?? null;

    return {
      workoutCount: Number(workouts[0]?.total ?? 0),
      earlyWorkoutCount: Number(workouts[0]?.early ?? 0),
      lateWorkoutCount: Number(workouts[0]?.late ?? 0),
      mealCount: Number(meals[0]?.total ?? 0),
      longestStreak: Number(streak[0]?.longest ?? 0),
      // Only a loss counts; gaining weight is not negative progress here.
      weightLostKg: first != null && latest != null ? Math.max(0, first - latest) : 0,
    };
  }
}
