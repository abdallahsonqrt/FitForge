import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { CoachProfile, Enrollment } from '../../database/schema';
import { CoachAccessService } from '../coaches/coach-access.service';
import { EnrollmentsService } from './enrollments.service';
import type { NotificationsService } from '../notifications/notifications.service';

/**
 * Enrollments — the row the whole permission model hangs off.
 *
 * A coach may read an athlete's logs, messages and progress only while a live
 * enrollment joins them, which makes creating one a gate rather than an insert.
 * Each guard below protects a promise the product makes before purchase — that
 * the coach is vetted, said they had room, and finished writing the program —
 * and each fails silently if it regresses: the enrollment is simply created.
 *
 * `CoachAccessService` is the real one rather than a mock. The guards are only
 * meaningful in combination with it, and a stubbed `hasCapacity` would assert
 * that this file calls a method, not that a full coach turns clients away.
 */

const dialect = new PgDialect();
const compile = (fragment: unknown) => dialect.sqlToQuery(fragment as never);

const ATHLETE = 'athlete-user-1';
const STRANGER = 'stranger-user-1';
const COACH_PROFILE = 'coach-profile-1';
const COACH_USER = 'coach-user-1';
const PLAN = 'plan-1';
const ENROLLMENT = 'enrollment-1';

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

const enrollment = (overrides: Partial<Enrollment> = {}): Enrollment =>
  ({
    id: ENROLLMENT,
    athleteUserId: ATHLETE,
    coachId: COACH_PROFILE,
    planId: null,
    status: 'pending',
    startedAt: null,
    endedAt: null,
    currentWeek: 1,
    source: 'directory',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as Enrollment;

const publishedProgram = (overrides: Record<string, unknown> = {}) => ({
  id: PLAN,
  coachId: COACH_PROFILE,
  name: 'Bodyweight Foundations',
  description: null,
  difficulty: 'beginner',
  sport: 'calisthenics',
  durationWeeks: 8,
  visibility: 'published',
  priceCents: 2900,
  tier: 'coach',
  targetGoals: ['muscle_gain'],
  targetLevels: ['beginner'],
  requiredEquipment: ['pull-up-bar'],
  trainingLocations: ['home'],
  ...overrides,
});

/** The joined row `findByIdForParty` re-reads after every write. */
const joinedEnrollment = (row: Enrollment = enrollment()) => ({
  ...row,
  coach: { ...coachProfile(), user: { id: COACH_USER, firstName: 'Jake', lastName: 'Morgan', avatarUrl: null } },
  plan: row.planId ? publishedProgram() : null,
  athlete: { id: ATHLETE, firstName: 'Amina', lastName: 'Said', avatarUrl: null },
});

function makeDb() {
  const inserted = vi.fn();
  const patched = vi.fn();
  const countWhere = vi.fn().mockResolvedValue([{ value: 0 }]);

  const db = {
    query: {
      coachProfiles: { findFirst: vi.fn().mockResolvedValue(undefined) },
      workoutPlans: { findFirst: vi.fn().mockResolvedValue(undefined) },
      enrollments: {
        // The default serves the post-write re-read; earlier calls in a flow are
        // queued with `mockResolvedValueOnce`.
        findFirst: vi.fn().mockResolvedValue(joinedEnrollment()),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: countWhere }) }),
    insert: vi.fn().mockReturnValue({
      values: (values: Record<string, unknown>) => {
        inserted(values);
        return { returning: async () => [{ ...enrollment(), ...values }] };
      },
    }),
    update: vi.fn().mockReturnValue({
      set: (patch: Record<string, unknown>) => {
        patched(patch);
        return { where: () => ({ returning: async () => [{ ...enrollment(), ...patch }] }) };
      },
    }),
  };

  return { db, inserted, patched, countWhere };
}

let harness: ReturnType<typeof makeDb>;
let service: EnrollmentsService;

/** Queues the coach profile lookups a flow makes, in order. */
const stubCoach = (...profiles: (CoachProfile | undefined)[]) => {
  profiles.forEach((profile) => harness.db.query.coachProfiles.findFirst.mockResolvedValueOnce(profile));
};

/**
 * Creating and transitioning an enrollment now files a notification for the
 * other party. It is a side effect rather than part of this contract, so it is
 * stubbed — and captured, so the tests at the end can assert who was told what.
 */
let notifications: { notify: ReturnType<typeof vi.fn> };

beforeEach(() => {
  harness = makeDb();
  notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  service = new EnrollmentsService(
    harness.db as never,
    new CoachAccessService(harness.db as never),
    notifications as unknown as NotificationsService,
  );
});

// ─── Creating the relationship ──────────────────────────────

describe('create', () => {
  const dto = { coachId: COACH_PROFILE } as never;

  it('404s an unverified coach rather than revealing a pending application', async () => {
    stubCoach(coachProfile({ verificationStatus: 'pending' }));

    await expect(service.create(ATHLETE, dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.inserted).not.toHaveBeenCalled();
  });

  it('refuses a coach enrolling with themselves', async () => {
    stubCoach(coachProfile());

    await expect(service.create(COACH_USER, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.inserted).not.toHaveBeenCalled();
  });

  it('refuses a coach who has closed their books', async () => {
    stubCoach(coachProfile({ acceptingClients: false }));

    await expect(service.create(ATHLETE, dto)).rejects.toBeInstanceOf(ConflictException);
    expect(harness.inserted).not.toHaveBeenCalled();
  });

  it('refuses a coach already at their client capacity', async () => {
    stubCoach(coachProfile({ clientCapacity: 5 }));
    harness.countWhere.mockResolvedValue([{ value: 5 }]);

    await expect(service.create(ATHLETE, dto)).rejects.toBeInstanceOf(ConflictException);
    expect(harness.inserted).not.toHaveBeenCalled();
  });

  it('allows the enrolment that fills the last slot', async () => {
    stubCoach(coachProfile({ clientCapacity: 5 }));
    harness.countWhere.mockResolvedValue([{ value: 4 }]);
    harness.db.query.enrollments.findFirst.mockResolvedValueOnce(undefined);

    await expect(service.create(ATHLETE, dto)).resolves.toMatchObject({ id: ENROLLMENT });
    expect(harness.inserted).toHaveBeenCalled();
  });

  it('refuses a second live enrollment with the same coach', async () => {
    stubCoach(coachProfile());
    harness.db.query.enrollments.findFirst.mockResolvedValueOnce({ id: ENROLLMENT, status: 'active' });

    await expect(service.create(ATHLETE, dto)).rejects.toBeInstanceOf(ConflictException);
    expect(harness.inserted).not.toHaveBeenCalled();
  });

  it('only counts live enrollments as duplicates', async () => {
    stubCoach(coachProfile());
    harness.db.query.enrollments.findFirst.mockResolvedValueOnce(undefined);

    await service.create(ATHLETE, dto);

    // A completed relationship must not block coming back to the same coach.
    const { params } = compile(harness.db.query.enrollments.findFirst.mock.calls[0][0].where);
    expect(params).toEqual([ATHLETE, COACH_PROFILE, 'pending', 'active', 'paused']);
  });

  it('404s a program belonging to a different coach', async () => {
    stubCoach(coachProfile());
    harness.db.query.enrollments.findFirst.mockResolvedValueOnce(undefined);
    harness.db.query.workoutPlans.findFirst.mockResolvedValue(undefined);

    await expect(
      service.create(ATHLETE, { coachId: COACH_PROFILE, planId: PLAN } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.inserted).not.toHaveBeenCalled();
  });

  it('refuses an unpublished program', async () => {
    stubCoach(coachProfile());
    harness.db.query.enrollments.findFirst.mockResolvedValueOnce(undefined);
    harness.db.query.workoutPlans.findFirst.mockResolvedValue(publishedProgram({ visibility: 'draft' }));

    await expect(
      service.create(ATHLETE, { coachId: COACH_PROFILE, planId: PLAN } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.inserted).not.toHaveBeenCalled();
  });

  it('opens as pending so the coach, not the athlete, starts the relationship', async () => {
    stubCoach(coachProfile());
    harness.db.query.enrollments.findFirst.mockResolvedValueOnce(undefined);

    await service.create(ATHLETE, dto);

    expect(harness.inserted).toHaveBeenCalledWith(
      expect.objectContaining({ athleteUserId: ATHLETE, coachId: COACH_PROFILE, status: 'pending' }),
    );
  });
});

// ─── Changing it ────────────────────────────────────────────

describe('update', () => {
  /** Queues the enrollment lookup, then the actor's profile lookup. */
  const stubUpdate = (row: Enrollment, actorProfile?: CoachProfile) => {
    harness.db.query.enrollments.findFirst.mockResolvedValueOnce(row);
    harness.db.query.coachProfiles.findFirst.mockResolvedValueOnce(actorProfile);
  };

  it('404s a stranger rather than confirming the enrollment exists', async () => {
    stubUpdate(enrollment(), undefined);

    await expect(
      service.update(STRANGER, ENROLLMENT, { status: 'canceled' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.patched).not.toHaveBeenCalled();
  });

  it('404s an unknown enrollment', async () => {
    harness.db.query.enrollments.findFirst.mockResolvedValueOnce(undefined);

    await expect(
      service.update(ATHLETE, ENROLLMENT, { status: 'canceled' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['completed', 'canceled'] as const)(
    'refuses to reopen a %s enrollment',
    async (status) => {
      stubUpdate(enrollment({ status }), undefined);

      await expect(
        service.update(ATHLETE, ENROLLMENT, { status: 'active' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(harness.patched).not.toHaveBeenCalled();
    },
  );

  it('refuses a transition that skips the graph', async () => {
    stubUpdate(enrollment({ status: 'pending' }), undefined);

    await expect(
      service.update(ATHLETE, ENROLLMENT, { status: 'completed' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not let an athlete accept their own request', async () => {
    stubUpdate(enrollment({ status: 'pending' }), undefined);

    await expect(
      service.update(ATHLETE, ENROLLMENT, { status: 'active' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.patched).not.toHaveBeenCalled();
  });

  it('lets the athlete leave at any time', async () => {
    stubUpdate(enrollment({ status: 'active' }), undefined);

    await service.update(ATHLETE, ENROLLMENT, { status: 'canceled' } as never);

    expect(harness.patched).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'canceled', endedAt: expect.any(Date) }),
    );
  });

  it('re-checks capacity when the coach accepts, not only at request time', async () => {
    stubUpdate(enrollment({ status: 'pending' }), coachProfile());
    // The coach filled their last slot while this request sat pending.
    stubCoach(coachProfile({ clientCapacity: 5 }));
    harness.countWhere.mockResolvedValue([{ value: 5 }]);

    await expect(
      service.update(COACH_USER, ENROLLMENT, { status: 'active' } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.patched).not.toHaveBeenCalled();
  });

  it('preserves the original start date when resuming from a pause', async () => {
    const startedAt = new Date('2026-02-01T00:00:00.000Z');
    stubUpdate(enrollment({ status: 'paused', startedAt }), coachProfile());
    stubCoach(coachProfile());

    await service.update(COACH_USER, ENROLLMENT, { status: 'active' } as never);

    // "Coaching since" must survive a pause rather than resetting to today.
    expect(harness.patched).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', startedAt, endedAt: null }),
    );
  });

  it('stamps the start date on the first activation', async () => {
    stubUpdate(enrollment({ status: 'pending', startedAt: null }), coachProfile());
    stubCoach(coachProfile());

    await service.update(COACH_USER, ENROLLMENT, { status: 'active' } as never);

    expect(harness.patched).toHaveBeenCalledWith(
      expect.objectContaining({ startedAt: expect.any(Date) }),
    );
  });

  it('does not let an athlete move themselves onto another program', async () => {
    stubUpdate(enrollment({ status: 'active' }), undefined);

    await expect(
      service.update(ATHLETE, ENROLLMENT, { planId: PLAN } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.patched).not.toHaveBeenCalled();
  });

  it('resets the week pointer when the coach reassigns the program', async () => {
    stubUpdate(enrollment({ status: 'active', currentWeek: 4 }), coachProfile());
    harness.db.query.workoutPlans.findFirst.mockResolvedValue(publishedProgram());

    await service.update(COACH_USER, ENROLLMENT, { planId: PLAN } as never);

    // Week 4 of the old plan means nothing in the new one.
    expect(harness.patched).toHaveBeenCalledWith(
      expect.objectContaining({ planId: PLAN, currentWeek: 1 }),
    );
  });

  it('refuses a reassignment to a program the coach does not own', async () => {
    stubUpdate(enrollment({ status: 'active' }), coachProfile());
    harness.db.query.workoutPlans.findFirst.mockResolvedValue(undefined);

    await expect(
      service.update(COACH_USER, ENROLLMENT, { planId: PLAN } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── Reading it ─────────────────────────────────────────────

describe('listForCoach', () => {
  const dto = { limit: 20, offset: 0 } as never;

  it('refuses a caller with no coach profile', async () => {
    harness.db.query.coachProfiles.findFirst.mockResolvedValue(undefined);

    await expect(service.listForCoach(ATHLETE, dto)).rejects.toThrow();
    expect(harness.db.query.enrollments.findMany).not.toHaveBeenCalled();
  });

  it('scopes the roster to the caller’s own coach id', async () => {
    harness.db.query.coachProfiles.findFirst.mockResolvedValue(coachProfile());

    await service.listForCoach(COACH_USER, dto);

    // There is no parameter for whose clients to list, so the only id that can
    // reach the query is the one resolved from the caller's own token.
    const { sql, params } = compile(harness.db.query.enrollments.findMany.mock.calls[0][0].where);
    expect(sql).toContain('"coach_id"');
    expect(params).toEqual([COACH_PROFILE]);
  });
});

describe('listMine', () => {
  it('scopes to the calling athlete', async () => {
    await service.listMine(ATHLETE, { limit: 20, offset: 0 } as never);

    const { sql, params } = compile(harness.db.query.enrollments.findMany.mock.calls[0][0].where);
    expect(sql).toContain('"athlete_user_id"');
    expect(params).toEqual([ATHLETE]);
  });
});
