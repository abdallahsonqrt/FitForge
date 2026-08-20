import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { CoachProfile } from '../../database/schema';
import { CoachAccessService } from './coach-access.service';

/**
 * The coach-domain permission boundary.
 *
 * Every ownership and enrolled-athlete question in the product routes through
 * this service, so a fault here is not a bug in one endpoint — it is the same
 * bug in all of them. The checks also fail *open* when they fail: a dropped
 * `coach_id` predicate still returns a row and still looks like a working
 * request, which is exactly the shape of defect a passing endpoint test misses.
 *
 * The database is mocked at the Drizzle boundary. Where the rule being tested
 * lives in the `WHERE` clause rather than in TypeScript, the predicate is
 * compiled and read back — asserting on a stubbed return value would only
 * restate the stub.
 */

const dialect = new PgDialect();

/** The SQL a captured Drizzle fragment compiles to, for asserting on predicates. */
const compile = (fragment: unknown) => dialect.sqlToQuery(fragment as never);

const COACH_PROFILE = 'coach-profile-1';
const COACH_USER = 'coach-user-1';
const OTHER_COACH = 'coach-profile-2';
const ATHLETE = 'athlete-user-1';
const PLAN = 'plan-1';
const WEEK = 'week-1';

const coachProfile = (overrides: Partial<CoachProfile> = {}): CoachProfile =>
  ({
    id: COACH_PROFILE,
    userId: COACH_USER,
    headline: 'Calisthenics & home strength',
    bio: null,
    specialties: ['calisthenics'],
    supportedGoals: ['muscle_gain'],
    supportedLevels: ['beginner'],
    supportedEquipment: ['pull-up-bar'],
    trainingLocations: ['home'],
    languages: ['en'],
    timezone: 'Asia/Hebron',
    yearsExperience: 8,
    credentials: [],
    verificationStatus: 'verified',
    verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    responseTimeHours: 24,
    monthlyPriceCents: 2900,
    clientCapacity: null,
    acceptingClients: true,
    ratingAvg: 4.9,
    ratingCount: 30,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as CoachProfile;

function makeDb() {
  return {
    query: {
      coachProfiles: { findFirst: vi.fn().mockResolvedValue(null) },
      workoutPlans: { findFirst: vi.fn().mockResolvedValue(null) },
      programWeeks: { findFirst: vi.fn().mockResolvedValue(null) },
      enrollments: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    select: vi.fn(),
  };
}

/** Stubs the `select(...).from(...).where(...)` chain used for capacity counting. */
function stubCount(db: ReturnType<typeof makeDb>, value: number) {
  const where = vi.fn().mockResolvedValue([{ value }]);
  db.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });
  return where;
}

let db: ReturnType<typeof makeDb>;
let access: CoachAccessService;

beforeEach(() => {
  db = makeDb();
  access = new CoachAccessService(db as never);
});

// ─── Who is the caller ──────────────────────────────────────

describe('requireProfileByUserId', () => {
  it('refuses a coach-role account that has no profile row', async () => {
    db.query.coachProfiles.findFirst.mockResolvedValue(undefined);

    await expect(access.requireProfileByUserId(COACH_USER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns the profile when one exists', async () => {
    db.query.coachProfiles.findFirst.mockResolvedValue(coachProfile());

    await expect(access.requireProfileByUserId(COACH_USER)).resolves.toMatchObject({
      id: COACH_PROFILE,
    });
  });

  it('resolves the profile by the caller user id, not by a supplied profile id', async () => {
    db.query.coachProfiles.findFirst.mockResolvedValue(coachProfile());

    await access.requireProfileByUserId(COACH_USER);

    const { sql, params } = compile(db.query.coachProfiles.findFirst.mock.calls[0][0].where);
    expect(sql).toContain('"user_id"');
    expect(params).toEqual([COACH_USER]);
  });
});

describe('requireVerifiedCoach', () => {
  it.each(['pending', 'rejected'] as const)(
    'hides a %s coach behind a 404 rather than confirming they exist',
    async (verificationStatus) => {
      db.query.coachProfiles.findFirst.mockResolvedValue(coachProfile({ verificationStatus }));

      await expect(access.requireVerifiedCoach(COACH_PROFILE)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );

  it('404s an unknown coach with the same error as an unverified one', async () => {
    db.query.coachProfiles.findFirst.mockResolvedValue(undefined);

    await expect(access.requireVerifiedCoach(COACH_PROFILE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns a verified coach', async () => {
    db.query.coachProfiles.findFirst.mockResolvedValue(coachProfile());

    await expect(access.requireVerifiedCoach(COACH_PROFILE)).resolves.toMatchObject({
      id: COACH_PROFILE,
    });
  });
});

// ─── Own content ────────────────────────────────────────────

describe('requireOwnedProgram', () => {
  it('scopes the lookup by coach id, so another coach’s program is never a hit', async () => {
    db.query.workoutPlans.findFirst.mockResolvedValue(undefined);

    await expect(access.requireOwnedProgram(OTHER_COACH, PLAN)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const { sql, params } = compile(db.query.workoutPlans.findFirst.mock.calls[0][0].where);
    expect(sql).toContain('"coach_id"');
    // Both the program id and the caller's coach id constrain the row.
    expect(params).toEqual([PLAN, OTHER_COACH]);
  });

  it('returns the program when the caller authored it', async () => {
    db.query.workoutPlans.findFirst.mockResolvedValue({ id: PLAN, coachId: COACH_PROFILE });

    await expect(access.requireOwnedProgram(COACH_PROFILE, PLAN)).resolves.toMatchObject({
      id: PLAN,
    });
  });
});

describe('requireOwnedWeek', () => {
  it('checks program ownership before looking the week up at all', async () => {
    db.query.workoutPlans.findFirst.mockResolvedValue(undefined);

    await expect(
      access.requireOwnedWeek(OTHER_COACH, PLAN, WEEK),
    ).rejects.toBeInstanceOf(NotFoundException);

    // The week query is the leak: reaching it would confirm the week exists
    // under a program the caller does not own.
    expect(db.query.programWeeks.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a week id belonging to a different program of the same coach', async () => {
    db.query.workoutPlans.findFirst.mockResolvedValue({ id: PLAN, coachId: COACH_PROFILE });
    db.query.programWeeks.findFirst.mockResolvedValue(undefined);

    await expect(
      access.requireOwnedWeek(COACH_PROFILE, PLAN, WEEK),
    ).rejects.toBeInstanceOf(NotFoundException);

    const { sql, params } = compile(db.query.programWeeks.findFirst.mock.calls[0][0].where);
    expect(sql).toContain('"plan_id"');
    expect(params).toEqual([WEEK, PLAN]);
  });
});

// ─── Enrolled athletes ──────────────────────────────────────

describe('isCoachOfAthlete', () => {
  it('authorises only while a live enrollment joins the pair', async () => {
    db.query.enrollments.findFirst.mockResolvedValue({ id: 'enrollment-1' });

    await expect(access.isCoachOfAthlete(COACH_PROFILE, ATHLETE)).resolves.toBe(true);
  });

  it('denies when no enrollment row matches', async () => {
    db.query.enrollments.findFirst.mockResolvedValue(undefined);

    await expect(access.isCoachOfAthlete(COACH_PROFILE, ATHLETE)).resolves.toBe(false);
  });

  it('treats completed and canceled enrollments as expired keys', async () => {
    await access.isCoachOfAthlete(COACH_PROFILE, ATHLETE);

    // This rule exists only as an `inArray` predicate, so it is read off the
    // compiled SQL: a mocked return value could not distinguish it.
    const { params } = compile(db.query.enrollments.findFirst.mock.calls[0][0].where);
    expect(params).toEqual([COACH_PROFILE, ATHLETE, 'pending', 'active', 'paused']);
    expect(params).not.toContain('completed');
    expect(params).not.toContain('canceled');
  });
});

describe('requireCoachOfAthlete', () => {
  it('throws when the pair is not joined by a live enrollment', async () => {
    db.query.enrollments.findFirst.mockResolvedValue(undefined);

    await expect(access.requireCoachOfAthlete(COACH_PROFILE, ATHLETE)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('isCoachUserOfAthlete', () => {
  it('answers false for an account with no coach profile instead of throwing', async () => {
    db.query.coachProfiles.findFirst.mockResolvedValue(undefined);

    await expect(access.isCoachUserOfAthlete('athlete-user-2', ATHLETE)).resolves.toBe(false);
    expect(db.query.enrollments.findFirst).not.toHaveBeenCalled();
  });
});

// ─── Capacity ───────────────────────────────────────────────

describe('hasCapacity', () => {
  it('treats a null capacity as uncapped without counting clients', async () => {
    const where = stubCount(db, 999);

    await expect(access.hasCapacity(coachProfile({ clientCapacity: null }))).resolves.toBe(true);
    expect(where).not.toHaveBeenCalled();
  });

  it('has room below the cap', async () => {
    stubCount(db, 4);

    await expect(access.hasCapacity(coachProfile({ clientCapacity: 5 }))).resolves.toBe(true);
  });

  it('is full at the cap', async () => {
    stubCount(db, 5);

    await expect(access.hasCapacity(coachProfile({ clientCapacity: 5 }))).resolves.toBe(false);
  });
});

describe('activeClientCount', () => {
  it('counts only the statuses that occupy a slot', async () => {
    const where = stubCount(db, 2);

    await expect(access.activeClientCount(COACH_PROFILE)).resolves.toBe(2);

    const { params } = compile(where.mock.calls[0][0]);
    expect(params).toEqual([COACH_PROFILE, 'active', 'paused']);
    // A pending request has not committed the coach's time, so it must not
    // consume capacity — otherwise unanswered requests lock a coach out.
    expect(params).not.toContain('pending');
  });

  it('reads zero when the count comes back empty', async () => {
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    });

    await expect(access.activeClientCount(COACH_PROFILE)).resolves.toBe(0);
  });
});
