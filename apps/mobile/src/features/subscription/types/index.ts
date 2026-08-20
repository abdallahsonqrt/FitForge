/**
 * Membership is coach-centric: a tier buys a level of human coach access.
 *
 * The tier union is declared here rather than imported from the users feature
 * because subscriptions own it — `pro` and `elite` are legacy values that the
 * API bridges to `starter` and `coach`, and the client should never need to know
 * that. Read `entitlements`, not `tier`.
 */
export type SubscriptionTier = 'free' | 'pro' | 'elite' | 'starter' | 'coach' | 'pro_coaching';

/** The four tiers the product sells. Legacy tiers resolve into one of these. */
export type CanonicalTier = 'free' | 'starter' | 'coach' | 'pro_coaching';

export type CoachAccessLevel = 'none' | 'messaging' | 'priority';

export type ProgramAccess = 'preview' | 'full';

/** Mirrors `GET /subscriptions/entitlements` — the server's resolved rules. */
export interface Entitlements {
  tier: SubscriptionTier;
  canonicalTier: CanonicalTier;
  planId: string | null;
  planName: string;
  priceCents: number;
  status: 'active' | 'canceled' | 'expired' | 'none';

  coachAccess: CoachAccessLevel;
  formReviews: boolean;
  scheduledCheckIns: boolean;
  personalisedPlanUpdates: boolean;
  coachResponseExpectation: string;

  programAccess: ProgramAccess;
  deviceLimit: number;
  aiLogLimit: number;
}

/** Mirrors the `subscription_plans` row returned by `GET /subscriptions/plans`. */
export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: SubscriptionTier;
  priceCents: number;
  deviceLimit: number;
  aiLogLimit: number;
  coachAccess: CoachAccessLevel;
  formReviews: boolean;
  scheduledCheckIns: boolean;
  createdAt: string;
  /** Resolved server-side so the paywall never re-derives the rules. */
  entitlements: Entitlements;
}

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'canceled' | 'expired';
  startDate: string;
  endDate: string | null;
  cancelAtPeriodEnd: boolean;
  plan: SubscriptionPlan;
}

/** `GET /subscriptions/me` — the row, which may be absent, plus resolved rules. */
export interface MySubscription {
  subscription: UserSubscription | null;
  entitlements: Entitlements;
}

/**
 * Legacy tiers resolve to the tier whose rules apply to them, mirroring
 * `toCanonicalTier` in the API's `entitlements.ts`: `pro` bought self-guided
 * full access (Starter), and `elite` was the top tier, so it becomes Coach.
 *
 * Anything comparing a stored `tier` must go through this. Comparing the raw
 * value silently excludes every legacy row — which is what made the training
 * tab's Pro/Elite filters match nothing.
 */
const LEGACY_TIER_BRIDGE: Record<string, CanonicalTier> = {
  pro: 'starter',
  elite: 'coach',
};

export const toCanonicalTier = (tier: SubscriptionTier | string): CanonicalTier =>
  LEGACY_TIER_BRIDGE[tier] ?? (tier as CanonicalTier);

/** Ordering for the four tiers. Legacy tiers rank as whatever they bridge to. */
const CANONICAL_RANK: Record<CanonicalTier, number> = {
  free: 0,
  starter: 1,
  coach: 2,
  pro_coaching: 3,
};

export const tierRank = (tier: SubscriptionTier | string): number =>
  CANONICAL_RANK[toCanonicalTier(tier)] ?? 0;

export const formatPrice = (priceCents: number): string =>
  priceCents === 0 ? '$0' : `$${(priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2)}`;

export const formatDeviceLimit = (limit: number): string =>
  limit < 0 ? 'Unlimited devices' : `${limit} device${limit === 1 ? '' : 's'}`;

export const formatAiLimit = (limit: number): string =>
  limit < 0 ? 'Unlimited AI meal logs' : `${limit} AI meal logs / day`;

/** The one-line headline for a tier: what you get from a human. */
export const COACH_ACCESS_HEADLINE: Record<CoachAccessLevel, string> = {
  none: 'No coach messaging',
  messaging: 'Direct coach messaging',
  priority: 'Priority coach messaging',
};

/**
 * The spec's "Included" wording, keyed by canonical tier. Kept as copy rather
 * than derived from booleans so the paywall reads like the product promise it is.
 */
export const TIER_INCLUDES: Record<CanonicalTier, string[]> = {
  free: ['Limited workout preview', 'Basic tracking', 'Browse coaches and programs'],
  starter: [
    'Full program access',
    'AI workout support',
    'Basic nutrition logging',
    'Progress tracking',
  ],
  coach: [
    'Everything in Starter',
    'Direct coach messaging',
    'Scheduled check-ins',
    'Personalised plan updates',
  ],
  pro_coaching: [
    'Everything in Coach',
    'Priority responses',
    'Form reviews',
    'Deeper nutrition and progress support',
  ],
};

/**
 * These prices are mock product data for design and early testing, not a
 * commercial decision, and no payment provider is connected — selecting a plan
 * changes a test subscription record only.
 */
export const MOCK_PRICING_NOTE =
  'Preview pricing. Plans are mock product data while payments are being built — selecting one changes your test subscription only.';
