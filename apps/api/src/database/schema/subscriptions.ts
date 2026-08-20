import { pgTable, uuid, varchar, integer, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

/**
 * Membership tiers.
 *
 * `starter`, `coach` and `pro_coaching` are the coach-centric ladder; `pro` and
 * `elite` are the original self-guided tiers and stay because rows reference
 * them and removing a Postgres enum value is destructive.
 */
export const tierEnum = pgEnum('subscription_tier', [
  'free',
  'pro',
  'elite',
  'starter',
  'coach',
  'pro_coaching',
]);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'canceled', 'expired']);

/**
 * How much of a coach's attention the tier buys: none, direct messaging, or
 * messaging with priority in the coach's queue.
 */
export const coachAccessLevelEnum = pgEnum('coach_access_level', ['none', 'messaging', 'priority']);

export const subscriptionPlans = pgTable('subscription_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  tier: tierEnum('tier').notNull(),
  priceCents: integer('price_cents').notNull().default(0),
  deviceLimit: integer('device_limit').notNull().default(1),
  aiLogLimit: integer('ai_log_limit').notNull().default(5),

  // ─── Coach entitlements ─────────────────────────────────
  /** Whether the tier includes coach messaging, and whether replies are prioritised. */
  coachAccess: coachAccessLevelEnum('coach_access').notNull().default('none'),
  /** May request a coach form-check on an uploaded video. */
  formReviews: boolean('form_reviews').notNull().default(false),
  /** Recurring coach check-ins rather than ad-hoc questions. */
  scheduledCheckIns: boolean('scheduled_check_ins').notNull().default(false),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userSubscriptions = pgTable('user_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  startDate: timestamp('start_date').defaultNow().notNull(),
  endDate: timestamp('end_date'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const subscriptionPlansRelations = relations(subscriptionPlans, ({ many }) => ({
  userSubscriptions: many(userSubscriptions),
}));

export const userSubscriptionsRelations = relations(userSubscriptions, ({ one }) => ({
  user: one(users, { fields: [userSubscriptions.userId], references: [users.id] }),
  plan: one(subscriptionPlans, { fields: [userSubscriptions.planId], references: [subscriptionPlans.id] }),
}));