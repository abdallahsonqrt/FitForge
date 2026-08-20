import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, desc } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { StreaksService } from '../streaks/streaks.service';
import { BadgesService } from '../badges/badges.service';
import { LogWeightDto } from './dto/log-weight.dto';
import { LogMeasurementDto } from './dto/log-measurement.dto';
import { LogWorkoutDto } from './dto/log-workout.dto';

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;
const BODY_PART_COLUMN = {
  chest: 'chestCm',
  arms: 'armsCm',
  waist: 'waistCm',
  legs: 'legsCm',
} as const;

@Injectable()
export class ProgressService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>,
    private readonly streaks: StreaksService,
    private readonly badges: BadgesService,
  ) {}

  async getWeightLogs(userId: string) {
    return this.db.query.weightLogs.findMany({
      where: eq(schema.weightLogs.userId, userId),
      orderBy: [desc(schema.weightLogs.createdAt)],
    });
  }

  async logWeight(userId: string, data: LogWeightDto) {
    const weightKg = data.unit === 'lbs' ? data.weight * KG_PER_LB : data.weight;
    const [log] = await this.db.insert(schema.weightLogs).values({
      userId,
      weightKg,
      date: (data.date ?? new Date().toISOString()).slice(0, 10),
    }).returning();
    return log;
  }

  async getMeasurements(userId: string) {
    return this.db.query.measurements.findMany({
      where: eq(schema.measurements.userId, userId),
      orderBy: [desc(schema.measurements.createdAt)],
    });
  }

  async logMeasurement(userId: string, data: LogMeasurementDto) {
    const valueCm = data.unit === 'in' ? data.value * CM_PER_INCH : data.value;
    const column = BODY_PART_COLUMN[data.bodyPart];
    const date = (data.date ?? new Date().toISOString()).slice(0, 10);
    const [measurement] = await this.db.insert(schema.measurements).values({
      userId,
      date,
      [column]: valueCm,
    }).returning();
    return measurement;
  }

  async getWorkouts(userId: string) {
    return this.db.query.workoutLogs.findMany({
      where: eq(schema.workoutLogs.userId, userId),
      orderBy: [desc(schema.workoutLogs.completedAt)],
      // Sets ride along so history can show what was actually lifted rather than
      // just that a session happened.
      with: { sets: true },
    });
  }

  /**
   * The session row and its sets are written together: a log whose sets failed
   * to insert would silently under-report the work done, which is the number the
   * athlete and their coach both read.
   */
  async logWorkout(userId: string, data: LogWorkoutDto) {
    const logged = await this.db.transaction(async (tx) => {
      const [log] = await tx
        .insert(schema.workoutLogs)
        .values({
          userId,
          planId: data.planId ?? null,
          durationSeconds: data.durationSeconds ?? null,
          completedAt: data.completedAt ? new Date(data.completedAt) : new Date(),
        })
        .returning();

      if (!data.sets?.length) return { ...log, sets: [] };

      const sets = await tx
        .insert(schema.setLogs)
        .values(
          data.sets.map((set) => ({
            workoutLogId: log.id,
            exerciseId: set.exerciseId,
            setNumber: set.setNumber,
            reps: set.reps ?? null,
            weightKg: set.weightKg ?? null,
          })),
        )
        .returning();

      return { ...log, sets };
    });

    // A finished session is one of the two things that mark a day as active.
    // Neither of these may fail the log that earned them: the workout is
    // already written, and a 500 here would have the client retry and record
    // the session twice.
    await this.streaks
      .recordActivity(userId, this.dayOf(data.completedAt))
      .catch(() => undefined);
    await this.badges.evaluateQuietly(userId);

    return logged;
  }

  /** The calendar day an activity belongs to, defaulting to today. */
  private dayOf(completedAt?: string): string {
    const when = completedAt ? new Date(completedAt) : new Date();
    return Number.isNaN(when.getTime())
      ? new Date().toISOString().slice(0, 10)
      : when.toISOString().slice(0, 10);
  }

  async getBadges(userId: string) {
    return this.db.query.userBadges.findMany({
      where: eq(schema.userBadges.userId, userId),
      with: {
        badge: true,
      },
    });
  }
}
