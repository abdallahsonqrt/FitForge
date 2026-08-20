import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, lt, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';

/**
 * How many whole days may pass with no activity before a streak breaks.
 *
 * `1` means: log something today or tomorrow and the streak survives; go quiet
 * for two full days and it resets. The product brief asks for progress and
 * streaks "without making the app feel punitive", and a zero-grace streak that
 * dies the first time someone is ill is exactly the punitive version.
 *
 * Both halves of the feature read this constant. They used to disagree — the
 * nightly job forgave a two-day gap while nothing at all advanced the counter —
 * and a streak whose "still alive" rule differs from its "counts as continuing"
 * rule is one that silently resets people who were never told they had lapsed.
 */
export const STREAK_GRACE_DAYS = 1;

/** A day is `YYYY-MM-DD`, matching the `date` columns this reads and writes. */
export type DayKey = string;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Server-local calendar day. See the timezone note on `recordActivity`. */
export const todayKey = (now: Date = new Date()): DayKey => now.toISOString().slice(0, 10);

/** Whole days from `from` to `to`; negative when `to` is the earlier of the two. */
const daysBetween = (from: DayKey, to: DayKey): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);

/** The streak state a decision operates on and produces. */
export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: DayKey | null;
}

/**
 * Where a streak lands when `day` is marked active — the whole rule, as a pure
 * function so its edges can be tested without a database.
 *
 * Returns `null` when nothing changes: the day is already counted, or the entry
 * is older than what is recorded and so is backfill rather than news.
 */
export const nextStreak = (previous: StreakState | null, day: DayKey): StreakState | null => {
  if (!previous || !previous.lastActivityDate) {
    return { currentStreak: 1, longestStreak: Math.max(previous?.longestStreak ?? 0, 1), lastActivityDate: day };
  }

  const gap = daysBetween(previous.lastActivityDate, day);
  // Same day, or backdated: the counter only ever moves forward.
  if (gap <= 0) return null;

  // A gap of 1 is consecutive days; anything inside the grace still continues.
  const currentStreak = gap <= STREAK_GRACE_DAYS + 1 ? previous.currentStreak + 1 : 1;

  return {
    currentStreak,
    longestStreak: Math.max(previous.longestStreak, currentStreak),
    lastActivityDate: day,
  };
};

@Injectable()
export class StreaksService {
  private readonly logger = new Logger(StreaksService.name);

  constructor(@Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>) {}

  async getUserStreak(userId: string) {
    const [streak] = await this.db
      .select()
      .from(schema.streaks)
      .where(eq(schema.streaks.userId, userId));
    return streak || { currentStreak: 0, longestStreak: 0, lastActivityDate: null };
  }

  /**
   * Mark a day as active for this user and move the streak accordingly.
   *
   * Called from the two things that mean "used the app for its purpose today":
   * finishing a workout and logging a meal. Deliberately idempotent per day —
   * three meals is the same one active day as one meal — so the counter tracks
   * days engaged rather than actions taken.
   *
   * A backdated entry never rewinds a streak: filling in yesterday's lunch is
   * bookkeeping, not a reason to recompute today. `lastActivityDate` therefore
   * only ever moves forward.
   *
   * The day is the server's calendar day. `users` carries no timezone, so a user
   * far from the server's offset sees their day roll over at an odd local hour;
   * fixing that needs a stored per-user timezone, not a change here.
   */
  async recordActivity(userId: string, day: DayKey = todayKey()) {
    return this.db.transaction(async (tx) => {
      // Two logs landing together must not both increment the same streak.
      const [existing] = await tx
        .select()
        .from(schema.streaks)
        .where(eq(schema.streaks.userId, userId))
        .for('update');

      if (!existing) {
        const [created] = await tx
          .insert(schema.streaks)
          .values({ userId, currentStreak: 1, longestStreak: 1, lastActivityDate: day })
          // Another request may have created the row between the select and
          // here; the unique index on `user_id` turns that race into an update.
          .onConflictDoUpdate({
            target: schema.streaks.userId,
            set: { currentStreak: 1, longestStreak: sql`greatest(${schema.streaks.longestStreak}, 1)`, lastActivityDate: day },
          })
          .returning();
        return created;
      }

      const next = nextStreak(existing, day);
      // Already counted today, or the entry is backfill — nothing to write.
      if (!next) return existing;

      const [updated] = await tx
        .update(schema.streaks)
        .set({
          currentStreak: next.currentStreak,
          longestStreak: next.longestStreak,
          lastActivityDate: next.lastActivityDate,
        })
        .where(eq(schema.streaks.id, existing.id))
        .returning();

      return updated;
    });
  }

  /**
   * Nightly sweep for streaks nobody kept alive.
   *
   * `recordActivity` handles the common case — the next log after a long gap
   * restarts the counter itself. This exists so a lapsed streak reads as zero
   * *before* the user comes back, rather than showing a stale number on the
   * dashboard until they next log something.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkAndResetBrokenStreaks() {
    this.logger.log('Running nightly check for broken streaks...');

    // The same boundary `recordActivity` uses: anything older than the grace
    // window is a streak that has ended.
    const cutoff = new Date(Date.now() - (STREAK_GRACE_DAYS + 1) * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);

    const reset = await this.db
      .update(schema.streaks)
      .set({ currentStreak: 0 })
      .where(lt(schema.streaks.lastActivityDate, cutoff))
      .returning({ id: schema.streaks.id });

    this.logger.log(`Reset ${reset.length} broken streak(s).`);
  }
}
