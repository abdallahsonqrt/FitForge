import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { CoachProfile } from '../../database/schema';
import { CoachAccessService } from './coach-access.service';
import { CoachProgramsService } from './coach-programs.service';
import {
  createDayExerciseSchema,
  reorderDayExercisesSchema,
  updateDayExerciseSchema,
  updateWeekDaySchema,
} from './dto/program.dto';

/**
 * The program builder's exercise prescription and day CRUD.
 *
 * Two classes of defect are being guarded against, and neither shows up as a
 * failing request:
 *
 *   1. a write that reaches the right row for the wrong coach. Every method here
 *      is handed a `planId` and a `dayId` straight off the URL, so the only
 *      thing standing between a coach and another coach's program is that the
 *      ownership check runs *before* the query and that the query is re-scoped
 *      afterwards. A dropped predicate still returns a row and still 200s;
 *   2. a prescription the schema accepts but nobody can render — reps *and* a
 *      rep range, an inverted range, a row that says nothing about the work at
 *      all. Those live in Zod, so they are checked by parsing hostile payloads.
 *
 * The database is mocked at the Drizzle boundary. Where a rule lives in a
 * `WHERE` clause it is read back off the compiled SQL, because asserting on a
 * stubbed return value would only restate the stub.
 */

const dialect = new PgDialect();
const compile = (fragment: unknown) => dialect.sqlToQuery(fragment as never);

const COACH_PROFILE = 'coach-profile-1';
const COACH_USER = 'coach-user-1';
const OTHER_COACH_USER = 'coach-user-2';
const PLAN = 'plan-1';
const WEEK = 'week-1';
const DAY = 'day-1';
const ROW = 'workout-exercise-1';
const EXERCISE = 'exercise-1';

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

const exerciseRow = (overrides: Record<string, unknown> = {}) => ({
  id: ROW,
  dayId: DAY,
  exerciseId: EXERCISE,
  sets: 3,
  reps: 10,
  repsMin: null,
  repsMax: null,
  durationSeconds: null,
  restSeconds: 90,
  tempo: null,
  rpe: null,
  notes: null,
  orderIndex: 0,
  ...overrides,
});

/** The relational shape `listDayExercises` asks for. */
const joinedExerciseRow = (overrides: Record<string, unknown> = {}) => ({
  ...exerciseRow(overrides),
  exercise: { id: EXERCISE, slug: 'back-squat', name: 'Back Squat', difficulty: 'beginner', muscles: [] },
});

function makeDb() {
  const inserted = vi.fn();
  const patched = vi.fn();
  const deleteWhere = vi.fn();
  const updateWheres: unknown[] = [];

  const db = {
    query: {
      coachProfiles: { findFirst: vi.fn().mockResolvedValue(coachProfile()) },
      workoutPlans: { findFirst: vi.fn().mockResolvedValue({ id: PLAN, coachId: COACH_PROFILE }) },
      programWeeks: {
        findFirst: vi.fn().mockResolvedValue({ id: WEEK, planId: PLAN }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      workoutDays: {
        findFirst: vi.fn().mockResolvedValue({ id: DAY, planId: PLAN, weekId: WEEK }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      workoutExercises: { findMany: vi.fn().mockResolvedValue([]) },
      exercises: { findFirst: vi.fn().mockResolvedValue({ id: EXERCISE }) },
      enrollments: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ value: 4 }]) }),
    }),
    insert: vi.fn().mockReturnValue({
      values: (values: Record<string, unknown>) => {
        inserted(values);
        return { returning: async () => [{ ...exerciseRow(), ...values }] };
      },
    }),
    update: vi.fn().mockReturnValue({
      set: (patch: Record<string, unknown>) => {
        patched(patch);
        return {
          where: (fragment: unknown) => {
            updateWheres.push(fragment);
            return { returning: async () => [{ ...exerciseRow(), ...patch }] };
          },
        };
      },
    }),
    delete: vi.fn().mockReturnValue({
      where: (fragment: unknown) => {
        deleteWhere(fragment);
        return { returning: async () => [{ id: ROW }] };
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };

  return { db, inserted, patched, deleteWhere, updateWheres };
}

let harness: ReturnType<typeof makeDb>;
let service: CoachProgramsService;

/** The card builder is stubbed: media resolution is `ExerciseCardService`'s own test. */
const cards = { cardsFor: vi.fn().mockResolvedValue(new Map()) };

beforeEach(() => {
  harness = makeDb();
  cards.cardsFor.mockClear().mockResolvedValue(new Map());
  service = new CoachProgramsService(
    harness.db as never,
    new CoachAccessService(harness.db as never),
    cards as never,
  );
});

/** Every builder method, so the ownership guard can be checked exhaustively. */
const everyExerciseWrite = (): [string, () => Promise<unknown>][] => [
  ['listDayExercises', () => service.listDayExercises(COACH_USER, PLAN, DAY)],
  [
    'createDayExercise',
    () => service.createDayExercise(COACH_USER, PLAN, DAY, { exerciseId: EXERCISE, sets: 3, reps: 10 } as never),
  ],
  ['updateDayExercise', () => service.updateDayExercise(COACH_USER, PLAN, DAY, ROW, { sets: 5 } as never)],
  ['removeDayExercise', () => service.removeDayExercise(COACH_USER, PLAN, DAY, ROW)],
  [
    'reorderDayExercises',
    () => service.reorderDayExercises(COACH_USER, PLAN, DAY, { exerciseIds: [ROW] } as never),
  ],
  ['updateWeekDay', () => service.updateWeekDay(COACH_USER, PLAN, WEEK, DAY, { dayName: 'Push' } as never)],
  ['removeWeekDay', () => service.removeWeekDay(COACH_USER, PLAN, WEEK, DAY)],
];

// ─── The ownership boundary ─────────────────────────────────

describe('ownership', () => {
  it.each(everyExerciseWrite())(
    '%s refuses a caller with no coach profile',
    async (_name, call) => {
      harness.db.query.coachProfiles.findFirst.mockResolvedValue(undefined);

      await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each(everyExerciseWrite())(
    '%s 404s when the program belongs to another coach',
    async (_name, call) => {
      // `requireOwnedProgram` scopes by coach id, so another coach's plan is a miss.
      harness.db.query.workoutPlans.findFirst.mockResolvedValue(undefined);

      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
      // The point of failing here: neither the day nor its exercises were read.
      expect(harness.db.query.workoutExercises.findMany).not.toHaveBeenCalled();
      expect(harness.inserted).not.toHaveBeenCalled();
      expect(harness.patched).not.toHaveBeenCalled();
      expect(harness.deleteWhere).not.toHaveBeenCalled();
    },
  );

  it('404s a day id belonging to a different program of the same coach', async () => {
    harness.db.query.workoutDays.findFirst.mockResolvedValue(undefined);

    await expect(service.listDayExercises(COACH_USER, PLAN, DAY)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    // The day is anchored on `plan_id`, which is the column that carries an owner.
    const { sql, params } = compile(harness.db.query.workoutDays.findFirst.mock.calls[0][0].where);
    expect(sql).toContain('"plan_id"');
    expect(params).toEqual([DAY, PLAN]);
  });

  it('resolves the coach from the token, never from the path', async () => {
    await service.listDayExercises(OTHER_COACH_USER, PLAN, DAY);

    const { sql, params } = compile(
      harness.db.query.coachProfiles.findFirst.mock.calls[0][0].where,
    );
    expect(sql).toContain('"user_id"');
    expect(params).toEqual([OTHER_COACH_USER]);
  });
});

// ─── Writes are re-scoped, not merely guarded ───────────────

describe('re-scoping', () => {
  it('constrains an exercise edit to the day it was authorised for', async () => {
    await service.updateDayExercise(COACH_USER, PLAN, DAY, ROW, { sets: 5 } as never);

    // Without the `day_id` conjunct, owning any one day would authorise editing
    // every `workout_exercises` row in the database by id.
    const { sql, params } = compile(harness.updateWheres[0]);
    expect(sql).toContain('"day_id"');
    expect(params).toEqual([ROW, DAY]);
  });

  it('constrains an exercise delete the same way', async () => {
    await service.removeDayExercise(COACH_USER, PLAN, DAY, ROW);

    const { params } = compile(harness.deleteWhere.mock.calls[0][0]);
    expect(params).toEqual([ROW, DAY]);
  });

  it('constrains a day rename by plan and week as well as by id', async () => {
    await service.updateWeekDay(COACH_USER, PLAN, WEEK, DAY, { dayName: 'Push' } as never);

    const { params } = compile(harness.updateWheres[0]);
    expect(params).toEqual([DAY, PLAN, WEEK]);
  });

  it('404s a day rename that matched nothing rather than reporting success', async () => {
    harness.db.update.mockReturnValue({
      set: () => ({ where: () => ({ returning: async () => [] }) }),
    });

    await expect(
      service.updateWeekDay(COACH_USER, PLAN, WEEK, DAY, { dayName: 'Push' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s deleting an exercise that is not in this day', async () => {
    harness.db.delete.mockReturnValue({ where: () => ({ returning: async () => [] }) });

    await expect(
      service.removeDayExercise(COACH_USER, PLAN, DAY, ROW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── Creating a prescription ────────────────────────────────

describe('createDayExercise', () => {
  it('takes the day from the authorised path, never from the body', async () => {
    await service.createDayExercise(
      COACH_USER,
      PLAN,
      DAY,
      { exerciseId: EXERCISE, sets: 3, reps: 10, dayId: 'someone-elses-day' } as never,
    );

    expect(harness.inserted).toHaveBeenCalledWith(expect.objectContaining({ dayId: DAY }));
  });

  it('appends to the end of the session when no position is given', async () => {
    await service.createDayExercise(
      COACH_USER,
      PLAN,
      DAY,
      { exerciseId: EXERCISE, sets: 3, reps: 10 } as never,
    );

    // The stubbed max() is 4, so the next free slot is 5.
    expect(harness.inserted).toHaveBeenCalledWith(expect.objectContaining({ orderIndex: 5 }));
  });

  it('starts at zero in an empty session', async () => {
    harness.db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ value: null }]) }),
    });

    await service.createDayExercise(
      COACH_USER,
      PLAN,
      DAY,
      { exerciseId: EXERCISE, sets: 3, reps: 10 } as never,
    );

    expect(harness.inserted).toHaveBeenCalledWith(expect.objectContaining({ orderIndex: 0 }));
  });

  it('refuses an exercise that is not in the library', async () => {
    harness.db.query.exercises.findFirst.mockResolvedValue(undefined);

    await expect(
      service.createDayExercise(COACH_USER, PLAN, DAY, { exerciseId: EXERCISE, sets: 3, reps: 10 } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.inserted).not.toHaveBeenCalled();
  });

  it('refuses an unpublished exercise, which would render as a hole in the session', async () => {
    await service.createDayExercise(
      COACH_USER,
      PLAN,
      DAY,
      { exerciseId: EXERCISE, sets: 3, reps: 10 } as never,
    );

    const { sql, params } = compile(harness.db.query.exercises.findFirst.mock.calls[0][0].where);
    expect(sql).toContain('"is_published"');
    expect(params).toEqual([EXERCISE, true]);
  });

  it('stores a duration-only prescription with a null rep count', async () => {
    await service.createDayExercise(
      COACH_USER,
      PLAN,
      DAY,
      { exerciseId: EXERCISE, sets: 3, durationSeconds: 30 } as never,
    );

    const values = harness.inserted.mock.calls[0][0];
    expect(values).toMatchObject({ durationSeconds: 30 });
    // A 30-second hold has no rep count. Before 0009 this row could not exist.
    expect(values.reps).toBeUndefined();
  });
});

// ─── Reorder ────────────────────────────────────────────────

describe('reorderDayExercises', () => {
  beforeEach(() => {
    harness.db.query.workoutExercises.findMany.mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
  });

  it('rejects a duplicate id', async () => {
    await expect(
      service.reorderDayExercises(COACH_USER, PLAN, DAY, { exerciseIds: ['a', 'a', 'b'] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.patched).not.toHaveBeenCalled();
  });

  it('rejects a partial list, which has no single correct interpretation', async () => {
    await expect(
      service.reorderDayExercises(COACH_USER, PLAN, DAY, { exerciseIds: ['a', 'b'] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.patched).not.toHaveBeenCalled();
  });

  it('rejects an id from another session even when the count matches', async () => {
    await expect(
      service.reorderDayExercises(COACH_USER, PLAN, DAY, {
        exerciseIds: ['a', 'b', 'not-in-this-day'],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.patched).not.toHaveBeenCalled();
  });

  it('writes contiguous positions from zero, in the order submitted', async () => {
    await service.reorderDayExercises(COACH_USER, PLAN, DAY, {
      exerciseIds: ['c', 'a', 'b'],
    } as never);

    expect(harness.patched.mock.calls.map(([patch]) => patch)).toEqual([
      { orderIndex: 0 },
      { orderIndex: 1 },
      { orderIndex: 2 },
    ]);
  });

  it('scopes every reorder write to this day', async () => {
    await service.reorderDayExercises(COACH_USER, PLAN, DAY, {
      exerciseIds: ['c', 'a', 'b'],
    } as never);

    for (const fragment of harness.updateWheres) {
      expect(compile(fragment).sql).toContain('"day_id"');
    }
  });
});

// ─── Listing ────────────────────────────────────────────────

describe('listDayExercises', () => {
  it('reads only this day and orders by position', async () => {
    harness.db.query.workoutExercises.findMany.mockResolvedValue([joinedExerciseRow()]);

    await service.listDayExercises(COACH_USER, PLAN, DAY);

    const call = harness.db.query.workoutExercises.findMany.mock.calls[0][0];
    expect(compile(call.where).params).toEqual([DAY]);
    expect(compile(call.orderBy[0]).sql).toContain('"order_index"');
  });

  it('fetches media once for the whole session rather than per row', async () => {
    harness.db.query.workoutExercises.findMany.mockResolvedValue([
      joinedExerciseRow(),
      joinedExerciseRow({ id: 'workout-exercise-2' }),
      joinedExerciseRow({ id: 'workout-exercise-3' }),
    ]);

    await service.listDayExercises(COACH_USER, PLAN, DAY);

    expect(cards.cardsFor).toHaveBeenCalledTimes(1);
  });

  it('returns the prescription columns the builder edits', async () => {
    harness.db.query.workoutExercises.findMany.mockResolvedValue([
      joinedExerciseRow({ reps: null, repsMin: 8, repsMax: 12, tempo: '3-1-1-0', rpe: 8, notes: 'Slow eccentric.' }),
    ]);

    const [row] = await service.listDayExercises(COACH_USER, PLAN, DAY);

    expect(row).toMatchObject({
      repsMin: 8,
      repsMax: 12,
      tempo: '3-1-1-0',
      rpe: 8,
      notes: 'Slow eccentric.',
      reps: null,
    });
  });
});

// ─── What the schema will and will not accept ───────────────

describe('createDayExerciseSchema', () => {
  const base = { exerciseId: '11111111-1111-4111-8111-111111111111', sets: 3 };

  it('accepts a fixed rep count', () => {
    expect(createDayExerciseSchema.parse({ ...base, reps: 10 })).toMatchObject({ reps: 10 });
  });

  it('accepts a rep range', () => {
    expect(createDayExerciseSchema.parse({ ...base, repsMin: 8, repsMax: 12 })).toMatchObject({
      repsMin: 8,
      repsMax: 12,
    });
  });

  it('accepts a duration with no reps — a 30-second hold', () => {
    expect(createDayExerciseSchema.parse({ ...base, durationSeconds: 30 })).toMatchObject({
      durationSeconds: 30,
    });
  });

  it('accepts AMRAP expressed as a note', () => {
    expect(createDayExerciseSchema.parse({ ...base, notes: 'AMRAP' })).toMatchObject({
      notes: 'AMRAP',
    });
  });

  it('rejects a fixed count and a range together', () => {
    expect(() => createDayExerciseSchema.parse({ ...base, reps: 10, repsMin: 8, repsMax: 12 })).toThrow();
  });

  it('rejects an inverted range', () => {
    expect(() => createDayExerciseSchema.parse({ ...base, repsMin: 12, repsMax: 8 })).toThrow();
  });

  it('rejects a row that says nothing about the work', () => {
    expect(() => createDayExerciseSchema.parse(base)).toThrow();
  });

  it('strips a client-supplied dayId, which would name another coach’s session', () => {
    const parsed = createDayExerciseSchema.parse({ ...base, reps: 10, dayId: 'someone-else' });

    expect(parsed).not.toHaveProperty('dayId');
  });

  it('accepts a tempo written the way coaches write it', () => {
    expect(createDayExerciseSchema.parse({ ...base, reps: 10, tempo: '3-1-1-0' })).toMatchObject({
      tempo: '3-1-1-0',
    });
    expect(createDayExerciseSchema.parse({ ...base, reps: 10, tempo: '3-0-X-0' })).toMatchObject({
      tempo: '3-0-X-0',
    });
  });

  it('rejects free text in the tempo field', () => {
    expect(() => createDayExerciseSchema.parse({ ...base, reps: 10, tempo: 'slow down' })).toThrow();
  });

  it.each([1, 7.5, 10])('accepts RPE %s', (rpe) => {
    expect(createDayExerciseSchema.parse({ ...base, reps: 10, rpe })).toMatchObject({ rpe });
  });

  it.each([0, 10.5, 7.3])('rejects RPE %s', (rpe) => {
    expect(() => createDayExerciseSchema.parse({ ...base, reps: 10, rpe })).toThrow();
  });
});

describe('updateDayExerciseSchema', () => {
  it('rejects an empty edit rather than issuing a no-op update', () => {
    expect(() => updateDayExerciseSchema.parse({})).toThrow();
  });

  it('allows clearing a field with an explicit null', () => {
    // Dropping a rep range in favour of a duration needs a way to say "no longer
    // a range"; an optional-only schema cannot express that.
    expect(updateDayExerciseSchema.parse({ repsMin: null, repsMax: null, durationSeconds: 45 })).toMatchObject({
      repsMin: null,
      durationSeconds: 45,
    });
  });

  it('refuses to change which exercise a row points at', () => {
    // Swapping the lift silently rewrites what the athlete has been logging
    // against it. Deleting and re-adding is the honest way to do that.
    const parsed = updateDayExerciseSchema.parse({
      sets: 4,
      exerciseId: '22222222-2222-4222-8222-222222222222',
    });

    expect(parsed).not.toHaveProperty('exerciseId');
  });

  it('still rejects a contradictory edit', () => {
    expect(() => updateDayExerciseSchema.parse({ reps: 10, repsMin: 8 })).toThrow();
  });
});

describe('reorderDayExercisesSchema', () => {
  it('requires at least one id', () => {
    expect(() => reorderDayExercisesSchema.parse({ exerciseIds: [] })).toThrow();
  });

  it('rejects a non-uuid id', () => {
    expect(() => reorderDayExercisesSchema.parse({ exerciseIds: ['nope'] })).toThrow();
  });
});

describe('updateWeekDaySchema', () => {
  it('rejects an empty edit', () => {
    expect(() => updateWeekDaySchema.parse({})).toThrow();
  });

  it('strips a client-supplied planId, which would move the day between programs', () => {
    const parsed = updateWeekDaySchema.parse({ dayName: 'Push', planId: 'another-plan' });

    expect(parsed).not.toHaveProperty('planId');
  });
});
