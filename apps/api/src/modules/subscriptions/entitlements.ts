import { subscriptionPlans, userSubscriptions } from '../../database/schema';

type SubscriptionPlanRow = typeof subscriptionPlans.$inferSelect;
type UserSubscriptionRow = typeof userSubscriptions.$inferSelect;

/**
 * The entitlement model.
 *
 * Membership is coach-centric: what a tier buys is a level of *human* access,
 * not a bigger number of devices. Everything that used to compare tier strings
 * inline (`tier === 'elite'`, `TIER_RANK[...]`) asks for an `Entitlements`
 * object instead, so the rules live in exactly one file and the mobile app can
 * read the same object over HTTP rather than re-deriving them.
 */

export type SubscriptionTier = 'free' | 'pro' | 'elite' | 'starter' | 'coach' | 'pro_coaching';

/** The four tiers the product actually sells. Legacy tiers resolve into one of these. */
export type CanonicalTier = 'free' | 'starter' | 'coach' | 'pro_coaching';

export type CoachAccessLevel = 'none' | 'messaging' | 'priority';

/** `preview` sees a taste of a program; `full` opens every day of it. */
export type ProgramAccess = 'preview' | 'full';

/**
 * LEGACY BRIDGE — the single place old tier names are translated.
 *
 * The membership ladder was Free / Pro ($9.99) / Elite ($19.99) and gated device
 * count and AI quota. It is now Free / Starter / Coach / Pro Coaching and gates
 * coach access. `pro` and `elite` rows still exist in the database and people are
 * still subscribed to them, so rather than migrate rows (destructive, and the
 * enum values are kept for exactly this reason) we map them at read time:
 * `pro` bought self-guided full access, which is Starter; `elite` was the
 * top tier and its subscribers should not lose ground, so it becomes Coach.
 *
 * Nothing else in the codebase may special-case `pro` or `elite`.
 */
const LEGACY_TIER_BRIDGE = {
  pro: 'starter',
  elite: 'coach',
} as const satisfies Record<'pro' | 'elite', CanonicalTier>;

/** Resolve a stored tier to the tier whose rules apply to it. */
export const toCanonicalTier = (tier: string): CanonicalTier =>
  (LEGACY_TIER_BRIDGE as Record<string, CanonicalTier>)[tier] ?? (tier as CanonicalTier);

/** Upgrade ordering. Legacy tiers rank as whatever they bridge to. */
const CANONICAL_RANK: Record<CanonicalTier, number> = {
  free: 0,
  starter: 1,
  coach: 2,
  pro_coaching: 3,
};

export const tierRank = (tier: string): number => CANONICAL_RANK[toCanonicalTier(tier)] ?? 0;

const COACH_ACCESS_RANK: Record<CoachAccessLevel, number> = { none: 0, messaging: 1, priority: 2 };

export interface Entitlements {
  /** The tier as stored on the plan row — may be a legacy value. */
  tier: SubscriptionTier;
  /** The tier whose rules were applied, after the legacy bridge. */
  canonicalTier: CanonicalTier;
  planId: string | null;
  planName: string;
  priceCents: number;
  status: 'active' | 'canceled' | 'expired' | 'none';

  // ─── Coach entitlements — the point of the tier ─────────────
  coachAccess: CoachAccessLevel;
  formReviews: boolean;
  scheduledCheckIns: boolean;
  /** Whether the coach adapts the plan for this subscriber rather than shipping it as published. */
  personalisedPlanUpdates: boolean;
  /**
   * Human-facing promise shown before purchase. The spec asks for the exact
   * coach service and response expectation to be visible on the paywall.
   */
  coachResponseExpectation: string;

  // ─── Product entitlements ──────────────────────────────────
  programAccess: ProgramAccess;
  /** Highest plan tier this subscriber may open, as a rank comparable via `tierRank`. */
  deviceLimit: number;
  aiLogLimit: number;
}

/** `-1` means unlimited, matching how the plan columns are seeded. */
export const UNLIMITED = -1;

export const isUnlimited = (limit: number): boolean => limit < 0;

/**
 * What each canonical tier includes, independent of what any particular plan row
 * happens to say. Legacy `pro`/`elite` rows predate the coach columns and carry
 * their defaults (`none`/`false`), so the baseline is what actually grants an
 * `elite` subscriber the coach messaging their bridged tier promises.
 */
const TIER_BASELINE: Record<
  CanonicalTier,
  Pick<
    Entitlements,
    | 'coachAccess'
    | 'formReviews'
    | 'scheduledCheckIns'
    | 'personalisedPlanUpdates'
    | 'programAccess'
    | 'coachResponseExpectation'
    | 'deviceLimit'
    | 'aiLogLimit'
  >
> = {
  free: {
    coachAccess: 'none',
    formReviews: false,
    scheduledCheckIns: false,
    personalisedPlanUpdates: false,
    programAccess: 'preview',
    coachResponseExpectation: 'Browse coaches and read their programs. Messaging is not included.',
    deviceLimit: 1,
    aiLogLimit: 5,
  },
  starter: {
    coachAccess: 'none',
    formReviews: false,
    scheduledCheckIns: false,
    personalisedPlanUpdates: false,
    programAccess: 'full',
    coachResponseExpectation:
      'Your coach’s full program, guided day to day by the AI assistant. Direct messaging is not included.',
    deviceLimit: 3,
    aiLogLimit: 30,
  },
  coach: {
    coachAccess: 'messaging',
    formReviews: false,
    scheduledCheckIns: true,
    personalisedPlanUpdates: true,
    programAccess: 'full',
    coachResponseExpectation:
      'Message your coach directly — replies within 24 hours on weekdays — plus a scheduled check-in every week.',
    deviceLimit: 3,
    aiLogLimit: UNLIMITED,
  },
  pro_coaching: {
    coachAccess: 'priority',
    formReviews: true,
    scheduledCheckIns: true,
    personalisedPlanUpdates: true,
    programAccess: 'full',
    coachResponseExpectation:
      'Priority replies within a few hours on weekdays, video form reviews, and deeper nutrition and progress support.',
    deviceLimit: UNLIMITED,
    aiLogLimit: UNLIMITED,
  },
};

/** Nobody signed in, or a lapsed subscription: the Free tier's rules. */
export const FREE_ENTITLEMENTS: Entitlements = {
  tier: 'free',
  canonicalTier: 'free',
  planId: null,
  planName: 'Free',
  priceCents: 0,
  status: 'none',
  ...TIER_BASELINE.free,
};

type PlanRow = Pick<
  SubscriptionPlanRow,
  | 'id'
  | 'name'
  | 'tier'
  | 'priceCents'
  | 'deviceLimit'
  | 'aiLogLimit'
  | 'coachAccess'
  | 'formReviews'
  | 'scheduledCheckIns'
>;

/**
 * Turn a plan row (and the subscription that points at it) into entitlements.
 *
 * The row wins for the numeric limits — those are the operator's dial and the
 * existing device/AI gates read them today. For the coach entitlements the
 * *stronger* of row and baseline wins, so a seeded coach-centric row can grant
 * more than the baseline while a legacy row can never grant less than the tier
 * it bridges to.
 */
export const entitlementsForPlan = (
  plan: PlanRow,
  status: Entitlements['status'] = 'active',
): Entitlements => {
  const canonical = toCanonicalTier(plan.tier);
  const baseline = TIER_BASELINE[canonical] ?? TIER_BASELINE.free;

  return {
    tier: plan.tier as SubscriptionTier,
    canonicalTier: canonical,
    planId: plan.id,
    planName: plan.name,
    priceCents: plan.priceCents,
    status,

    coachAccess:
      COACH_ACCESS_RANK[plan.coachAccess] > COACH_ACCESS_RANK[baseline.coachAccess]
        ? plan.coachAccess
        : baseline.coachAccess,
    formReviews: plan.formReviews || baseline.formReviews,
    scheduledCheckIns: plan.scheduledCheckIns || baseline.scheduledCheckIns,
    personalisedPlanUpdates: baseline.personalisedPlanUpdates,
    coachResponseExpectation: baseline.coachResponseExpectation,

    programAccess: baseline.programAccess,
    deviceLimit: plan.deviceLimit,
    aiLogLimit: plan.aiLogLimit,
  };
};

/**
 * A subscription that is not `active` entitles the user to nothing beyond Free,
 * but we keep the tier visible so the UI can say what lapsed.
 */
export const entitlementsForSubscription = (
  subscription: (Pick<UserSubscriptionRow, 'status'> & { plan: PlanRow }) | null | undefined,
): Entitlements => {
  if (!subscription) return FREE_ENTITLEMENTS;
  if (subscription.status !== 'active') {
    return { ...FREE_ENTITLEMENTS, tier: subscription.plan.tier as SubscriptionTier, status: subscription.status };
  }
  return entitlementsForPlan(subscription.plan, subscription.status);
};

/** Whether the subscriber may open a workout plan published at `planTier`. */
export const canAccessPlanTier = (entitlements: Entitlements, planTier: string): boolean =>
  tierRank(planTier) <= tierRank(entitlements.canonicalTier);

/** Whether another device may be registered given how many already are. */
export const canRegisterDevice = (entitlements: Entitlements, registeredCount: number): boolean =>
  isUnlimited(entitlements.deviceLimit) || registeredCount < entitlements.deviceLimit;

/** Whether another AI log may be recorded today given how many already were. */
export const canLogWithAi = (entitlements: Entitlements, usedToday: number): boolean =>
  isUnlimited(entitlements.aiLogLimit) || usedToday < entitlements.aiLogLimit;
