import type { Entitlements } from '../subscriptions/entitlements';

/**
 * Who is asking for a plan, resolved once per request.
 *
 * `GET /plans/:id` has to answer four different questions before it can decide —
 * is this the caller's own plan, is this the coach who wrote it, are they
 * enrolled on it, does their tier cover it — and each answer costs a query. They
 * are gathered into one object so the rule can be written as a pure function and
 * tested without a database.
 */
export interface PlanViewer {
  /** Null for an unauthenticated caller; `/plans` is reachable without a token. */
  userId: string | null;
  entitlements: Entitlements;
  /** The caller's own `coach_profiles.id`, if they are a coach. */
  coachProfileId: string | null;
  /** Whether a live enrollment puts the caller on this specific plan. */
  isEnrolled: boolean;
}

/** The columns the decision is made from — deliberately not the whole row. */
export interface PlanOwnership {
  userId: string | null;
  coachId: string | null;
  visibility: 'draft' | 'published' | 'archived';
  tier: string;
}

/**
 * `visible` means the plan exists as far as this caller is concerned.
 * `entitled` means they may open it. The pair maps onto 404 and 402/403
 * respectively: a draft they cannot see must not be distinguishable from a plan
 * that does not exist, while a published plan above their tier is already
 * advertised on the coach's public profile, so refusing it with a paywall
 * message leaks nothing and is what the upgrade prompt needs.
 */
export interface PlanAccess {
  visible: boolean;
  entitled: boolean;
  /** Why access was granted — useful in tests and worth nothing at runtime. */
  reason: 'owner' | 'author' | 'enrolled' | 'catalogue' | 'hidden';
}

/**
 * The one place the plan-visibility rule lives.
 *
 * Ownership and enrollment beat both visibility and tier. That ordering is the
 * point: an athlete mid-way through a program the coach has since archived, or
 * whose subscription lapsed after they were put on an `elite` plan by their
 * coach, must not lose the training they are already doing. The tier gate exists
 * to stop people browsing into paid content, not to strand a client.
 */
export function resolvePlanAccess(
  plan: PlanOwnership,
  viewer: PlanViewer,
  canAccessTier: (entitlements: Entitlements, planTier: string) => boolean,
): PlanAccess {
  // A personal plan belongs to exactly one user and is never in anyone's
  // catalogue, so its owner is the only reader and no tier applies.
  if (plan.userId && viewer.userId && plan.userId === viewer.userId) {
    return { visible: true, entitled: true, reason: 'owner' };
  }

  // The authoring coach reads their own drafts — that is what the builder is.
  if (plan.coachId && viewer.coachProfileId && plan.coachId === viewer.coachProfileId) {
    return { visible: true, entitled: true, reason: 'author' };
  }

  if (viewer.isEnrolled) {
    return { visible: true, entitled: true, reason: 'enrolled' };
  }

  if (plan.visibility !== 'published') {
    return { visible: false, entitled: false, reason: 'hidden' };
  }

  return {
    visible: true,
    entitled: canAccessTier(viewer.entitlements, plan.tier),
    reason: 'catalogue',
  };
}
