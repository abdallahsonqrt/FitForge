import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users, fitnessGoalEnum, experienceLevelEnum } from './users';
import { trainingLocationEnum } from './enums';
import { workoutPlans } from './workout-plans';
import { enrollments } from './enrollments';

/**
 * The professional side of a user account.
 *
 * A coach is a `users` row with `role = 'coach'` plus exactly one row here — the
 * split keeps authentication identity separate from the public storefront, so a
 * coach can be deactivated or de-verified without touching their login, and an
 * athlete account never carries empty coaching columns.
 *
 * The `supported*` columns deliberately mirror the athlete columns on `users`
 * and the eligibility columns on `workout_plans`. Matching is then a straight
 * array-contains comparison rather than a rules engine.
 */

/**
 * Manual review state. Phase 1 of the marketplace is curated: an admin verifies
 * each coach before their profile is discoverable, and only `verified` coaches
 * may be labelled as such in the UI.
 */
export const coachVerificationStatusEnum = pgEnum('coach_verification_status', [
  'pending',
  'verified',
  'rejected',
]);

export const coachProfiles = pgTable(
  'coach_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** One profile per account. Unique so "the coach for this user" is a single row. */
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** One-line positioning, e.g. "Calisthenics coach — first pull-up to muscle-up". */
    headline: varchar('headline', { length: 255 }),
    bio: text('bio'),
    /** Free-form specialty slugs: 'calisthenics', 'fat_loss', 'postnatal'… */
    specialties: text('specialties').array(),

    // ─── Eligibility: what this coach supports ───────────────
    supportedGoals: fitnessGoalEnum('supported_goals').array(),
    supportedLevels: experienceLevelEnum('supported_levels').array(),
    /** Equipment slugs the coach can program around, matching `equipment.slug`. */
    supportedEquipment: text('supported_equipment').array(),
    trainingLocations: trainingLocationEnum('training_locations').array(),

    /** ISO 639-1 codes. Language is a hard filter for athletes in the directory. */
    languages: text('languages').array(),
    /** IANA zone, e.g. "Africa/Cairo" — sets the expectation for reply times. */
    timezone: varchar('timezone', { length: 64 }),
    yearsExperience: integer('years_experience'),
    /**
     * Certifications as `[{ name, issuer, year, documentUrl }]`. JSON rather than
     * a table because nothing queries inside it — it is rendered on the profile
     * and read by the admin doing verification.
     */
    credentials: jsonb('credentials'),

    verificationStatus: coachVerificationStatusEnum('verification_status')
      .notNull()
      .default('pending'),
    verifiedAt: timestamp('verified_at'),

    // ─── The offer, shown before purchase ───────────────────
    /** Advertised reply window. The promise an athlete buys, so it must be visible up front. */
    responseTimeHours: integer('response_time_hours'),
    monthlyPriceCents: integer('monthly_price_cents'),
    /** Maximum concurrent active enrollments; null means uncapped. */
    clientCapacity: integer('client_capacity'),
    acceptingClients: boolean('accepting_clients').notNull().default(true),

    /** Denormalised from reviews so the directory can sort without an aggregate. */
    ratingAvg: real('rating_avg'),
    ratingCount: integer('rating_count').notNull().default(0),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // The directory's default listing: verified coaches with open slots, best rated first.
    directoryIdx: index('coach_profiles_directory_idx').on(
      table.verificationStatus,
      table.acceptingClients,
      table.ratingAvg,
    ),
  }),
);

export const coachProfilesRelations = relations(coachProfiles, ({ one, many }) => ({
  user: one(users, { fields: [coachProfiles.userId], references: [users.id] }),
  workoutPlans: many(workoutPlans),
  enrollments: many(enrollments),
}));

export type CoachProfile = typeof coachProfiles.$inferSelect;
export type NewCoachProfile = typeof coachProfiles.$inferInsert;
