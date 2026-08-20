import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { CoachProfile } from '../../database/schema';
import { CoachAccessService } from './coach-access.service';
import { CoachesService } from './coaches.service';
import { toOwnCoachProfile, toPublicCoachProfile } from './coaches.mapper';
import { applyAsCoachSchema, updateCoachProfileSchema } from './dto/coach-profile.dto';

/**
 * The coach directory, the write boundary, and matching.
 *
 * Two rules here are load-bearing for trust rather than for correctness, and
 * both fail silently:
 *
 *   1. only `verified` coaches are ever returned to anyone but their owner — a
 *      dropped filter shows an unreviewed stranger as vetted;
 *   2. nothing a coach submits about themselves can promote them — an applicant
 *      who could set `verificationStatus` would make the badge meaningless.
 *
 * The first lives in a `WHERE` clause, so it is checked by compiling the query
 * and reading the predicate back. The second lives in the Zod schema, so it is
 * checked by parsing a hostile payload.
 */

const dialect = new PgDialect();
const compile = (fragment: unknown) => dialect.sqlToQuery(fragment as never);

const COACH_PROFILE = 'coach-profile-1';
const COACH_USER = 'coach-user-1';
const ATHLETE = 'athlete-user-1';

const coachProfile = (overrides: Partial<CoachProfile> = {}): CoachProfile =>
  ({
    id: COACH_PROFILE,
    userId: COACH_USER,
    headline: 'Calisthenics & home strength',
    bio: 'Bodyweight strength without a gym.',
    specialties: ['calisthenics'],
    supportedGoals: ['muscle_gain'],
    supportedLevels: ['beginner'],
    supportedEquipment: ['pull-up-bar'],
    trainingLocations: ['home'],
    languages: ['en'],
    timezone: 'Asia/Hebron',
    yearsExperience: 8,
    credentials: [{ name: 'NASM-CPT', issuer: 'NASM', documentUrl: 'https://cdn.example/proof.pdf' }],
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

const withUser = (row: CoachProfile) => ({
  ...row,
  user: { id: row.userId, firstName: 'Jake', lastName: 'Morgan', avatarUrl: null },
});

function makeDb() {
  const inserted = vi.fn();
  const db = {
    query: {
      coachProfiles: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([]),
      },
      workoutPlans: { findMany: vi.fn().mockResolvedValue([]) },
      users: { findFirst: vi.fn().mockResolvedValue({}) },
      enrollments: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ value: 0 }]) }),
    }),
    insert: vi.fn().mockReturnValue({
      values: (values: Record<string, unknown>) => {
        inserted(values);
        return { returning: async () => [{ ...coachProfile(), ...values }] };
      },
    }),
    update: vi.fn(),
  };
  return { db, inserted };
}

let harness: ReturnType<typeof makeDb>;
let service: CoachesService;

const listDto = { limit: 20, offset: 0 } as never;

beforeEach(() => {
  harness = makeDb();
  service = new CoachesService(harness.db as never, new CoachAccessService(harness.db as never));
});

// ─── The directory is verified-only ─────────────────────────

describe('directory scope', () => {
  it('filters an unfiltered listing to verified coaches', async () => {
    await service.list(listDto);

    const { sql, params } = compile(harness.db.query.coachProfiles.findMany.mock.calls[0][0].where);
    expect(sql).toContain('"verification_status"');
    expect(params).toEqual(['verified']);
  });

  it('keeps the verified filter when the caller supplies their own filters', async () => {
    await service.list({
      ...(listDto as object),
      goal: ['muscle_gain'],
      trainingLocation: ['home'],
      acceptingClients: true,
    } as never);

    // The caller's conditions are ANDed onto the mandatory one, never replacing it.
    const { params } = compile(harness.db.query.coachProfiles.findMany.mock.calls[0][0].where);
    expect(params[0]).toBe('verified');
  });

  it('counts against the same scope it lists, so totals cannot exceed the page source', async () => {
    const where = vi.fn().mockResolvedValue([{ value: 0 }]);
    harness.db.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });

    await service.list(listDto);

    expect(compile(where.mock.calls[0][0]).params).toEqual(['verified']);
  });

  it('404s an unverified coach looked up directly by id', async () => {
    harness.db.query.coachProfiles.findFirst.mockResolvedValue(undefined);

    await expect(service.findOne(COACH_PROFILE)).rejects.toBeInstanceOf(NotFoundException);

    const { params } = compile(harness.db.query.coachProfiles.findFirst.mock.calls[0][0].where);
    expect(params).toEqual(['verified', COACH_PROFILE]);
  });

  it('ranks recommendations over verified coaches only', async () => {
    await service.recommend(ATHLETE, { limit: 5 } as never);

    const { params } = compile(harness.db.query.coachProfiles.findMany.mock.calls[0][0].where);
    expect(params).toEqual(['verified']);
  });
});

describe('findOne', () => {
  it('advertises only published programs', async () => {
    harness.db.query.coachProfiles.findFirst.mockResolvedValue(withUser(coachProfile()));

    await service.findOne(COACH_PROFILE);

    // Drafts are the coach's workspace and archived programs cannot be bought.
    const { params } = compile(harness.db.query.workoutPlans.findMany.mock.calls[0][0].where);
    expect(params).toEqual([COACH_PROFILE, 'published']);
  });
});

// ─── Nothing self-submitted can promote a coach ─────────────

describe('write boundary', () => {
  /** What a coach might POST to promote themselves. */
  const hostile = {
    headline: 'Elite coach',
    verificationStatus: 'verified',
    verifiedAt: '2020-01-01T00:00:00.000Z',
    ratingAvg: 5,
    ratingCount: 999,
    userId: 'someone-else',
    id: 'chosen-id',
  };

  it('strips verification and rating fields from an application', () => {
    const parsed = applyAsCoachSchema.parse(hostile);

    expect(parsed).not.toHaveProperty('verificationStatus');
    expect(parsed).not.toHaveProperty('verifiedAt');
    expect(parsed).not.toHaveProperty('ratingAvg');
    expect(parsed).not.toHaveProperty('ratingCount');
    expect(parsed).not.toHaveProperty('userId');
    expect(parsed).not.toHaveProperty('id');
  });

  it('strips the same fields from a profile edit', () => {
    const parsed = updateCoachProfileSchema.parse(hostile);

    expect(parsed).not.toHaveProperty('verificationStatus');
    expect(parsed).not.toHaveProperty('ratingAvg');
    expect(parsed).toMatchObject({ headline: 'Elite coach' });
  });

  it('rejects an empty edit rather than issuing a no-op update', () => {
    expect(() => updateCoachProfileSchema.parse({})).toThrow();
  });
});

describe('apply', () => {
  it('creates the profile pending and unverified', async () => {
    await service.apply(ATHLETE, { headline: 'Calisthenics coach' } as never);

    expect(harness.inserted).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ATHLETE,
        verificationStatus: 'pending',
        verifiedAt: null,
      }),
    );
  });

  it('does not grant the coach role — an admin does', async () => {
    await service.apply(ATHLETE, { headline: 'Calisthenics coach' } as never);

    // The role lives on `users`; an application must not touch that table.
    expect(harness.db.update).not.toHaveBeenCalled();
    expect(harness.inserted.mock.calls[0][0]).not.toHaveProperty('role');
  });

  it('refuses a second application', async () => {
    harness.db.query.coachProfiles.findFirst.mockResolvedValue(coachProfile({ verificationStatus: 'pending' }));

    await expect(
      service.apply(ATHLETE, { headline: 'Calisthenics coach' } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.inserted).not.toHaveBeenCalled();
  });
});

// ─── The privacy boundary in the mappers ────────────────────

describe('credential privacy', () => {
  it('strips the proof document from the public profile', () => {
    const publicView = toPublicCoachProfile(withUser(coachProfile()));

    expect(publicView.credentials[0]).toMatchObject({ name: 'NASM-CPT' });
    expect(publicView.credentials[0]).not.toHaveProperty('documentUrl');
  });

  it('keeps it on the coach’s own profile, where the subject is the viewer', () => {
    const ownView = toOwnCoachProfile(withUser(coachProfile()));

    expect(ownView.credentials[0]).toHaveProperty('documentUrl');
  });
});

// ─── Matching ───────────────────────────────────────────────

describe('recommend', () => {
  const athlete = (overrides: Record<string, unknown> = {}) => ({
    sport: null,
    fitnessGoal: null,
    experienceLevel: null,
    trainingLocation: null,
    availableEquipment: null,
    ...overrides,
  });

  it('scores an athlete who answered nothing at zero rather than dividing by zero', async () => {
    harness.db.query.users.findFirst.mockResolvedValue(athlete());
    harness.db.query.coachProfiles.findMany.mockResolvedValue([withUser(coachProfile())]);

    const result = await service.recommend(ATHLETE, { limit: 5 } as never);

    expect(result.items[0].score).toBe(0);
  });

  it('does not penalise a half-filled profile', async () => {
    harness.db.query.users.findFirst.mockResolvedValue(athlete({ fitnessGoal: 'muscle_gain' }));
    harness.db.query.coachProfiles.findMany.mockResolvedValue([withUser(coachProfile())]);

    const result = await service.recommend(ATHLETE, { limit: 5 } as never);

    // One dimension answered, one satisfied — a perfect match on what was asked.
    expect(result.items[0].score).toBe(1);
  });

  it('scores the fraction of answered dimensions a coach satisfies', async () => {
    harness.db.query.users.findFirst.mockResolvedValue(
      athlete({ fitnessGoal: 'muscle_gain', trainingLocation: 'gym' }),
    );
    harness.db.query.coachProfiles.findMany.mockResolvedValue([withUser(coachProfile())]);

    const result = await service.recommend(ATHLETE, { limit: 5 } as never);

    // goal matches (weight 3), location does not (weight 2) → 3/5.
    expect(result.items[0].score).toBe(0.6);
  });

  it('matches a sport written as free text against a specialty slug', async () => {
    harness.db.query.users.findFirst.mockResolvedValue(athlete({ sport: 'Calisthenics' }));
    harness.db.query.coachProfiles.findMany.mockResolvedValue([withUser(coachProfile())]);

    const result = await service.recommend(ATHLETE, { limit: 5 } as never);

    expect(result.items[0].score).toBe(1);
    expect(result.items[0].reasons).toContain('Specialises in Calisthenics');
  });

  it('explains the match so onboarding can show why a coach was suggested', async () => {
    harness.db.query.users.findFirst.mockResolvedValue(
      athlete({ availableEquipment: ['pull-up-bar', 'dumbbells'] }),
    );
    harness.db.query.coachProfiles.findMany.mockResolvedValue([withUser(coachProfile())]);

    const result = await service.recommend(ATHLETE, { limit: 5 } as never);

    expect(result.items[0].reasons).toContain('Uses equipment you have: pull-up-bar');
  });

  it('ranks the better match first', async () => {
    harness.db.query.users.findFirst.mockResolvedValue(athlete({ fitnessGoal: 'endurance' }));
    harness.db.query.coachProfiles.findMany.mockResolvedValue([
      withUser(coachProfile()),
      withUser(coachProfile({ id: 'coach-profile-2', supportedGoals: ['endurance'] })),
    ]);

    const result = await service.recommend(ATHLETE, { limit: 5 } as never);

    expect(result.items[0].coach.id).toBe('coach-profile-2');
    expect(result.items[0].score).toBe(1);
    expect(result.items[1].score).toBe(0);
  });

  it('echoes the answers it ranked on', async () => {
    harness.db.query.users.findFirst.mockResolvedValue(athlete({ sport: 'boxing' }));

    const result = await service.recommend(ATHLETE, { limit: 5 } as never);

    expect(result.basedOn).toMatchObject({ sport: 'boxing', availableEquipment: [] });
  });

  it('404s when the caller has no user row', async () => {
    harness.db.query.users.findFirst.mockResolvedValue(undefined);

    await expect(service.recommend(ATHLETE, { limit: 5 } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
