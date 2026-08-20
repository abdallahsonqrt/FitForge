import { describe, expect, it } from 'vitest';
import {
  canAccessPlanTier,
  canLogWithAi,
  canRegisterDevice,
  entitlementsForPlan,
  entitlementsForSubscription,
  FREE_ENTITLEMENTS,
  tierRank,
  toCanonicalTier,
  UNLIMITED,
} from './entitlements';

/**
 * The entitlement model is where the tier ladder is decided, so these cover the
 * two things that would silently break subscribers: the legacy bridge (people on
 * `pro`/`elite` must keep what they paid for) and the device/AI ceilings that
 * were enforced before the coach-centric pivot.
 */

type PlanRow = Parameters<typeof entitlementsForPlan>[0];

const plan = (over: Partial<PlanRow> & Pick<PlanRow, 'tier'>): PlanRow => ({
  id: 'plan-1',
  name: 'Test plan',
  priceCents: 0,
  deviceLimit: 1,
  aiLogLimit: 5,
  coachAccess: 'none',
  formReviews: false,
  scheduledCheckIns: false,
  ...over,
});

describe('legacy tier bridge', () => {
  it('treats the old Pro tier as Starter', () => {
    expect(toCanonicalTier('pro')).toBe('starter');
    expect(tierRank('pro')).toBe(tierRank('starter'));
  });

  it('treats the old Elite tier as Coach', () => {
    expect(toCanonicalTier('elite')).toBe('coach');
    expect(tierRank('elite')).toBe(tierRank('coach'));
  });

  it('leaves the coach-centric tiers alone', () => {
    for (const tier of ['free', 'starter', 'coach', 'pro_coaching']) {
      expect(toCanonicalTier(tier)).toBe(tier);
    }
    expect(tierRank('free')).toBeLessThan(tierRank('starter'));
    expect(tierRank('coach')).toBeLessThan(tierRank('pro_coaching'));
  });

  it('gives a legacy Elite row the coach messaging its bridged tier promises', () => {
    // The row predates the coach columns, so they carry their `false`/`none`
    // defaults — the baseline for `coach` has to supply them.
    const entitlements = entitlementsForPlan(plan({ tier: 'elite', name: 'Elite' }));

    expect(entitlements.canonicalTier).toBe('coach');
    expect(entitlements.coachAccess).toBe('messaging');
    expect(entitlements.scheduledCheckIns).toBe(true);
    expect(entitlements.formReviews).toBe(false);
  });

  it('does not hand a legacy Pro row any coach access', () => {
    const entitlements = entitlementsForPlan(plan({ tier: 'pro', name: 'Pro' }));

    expect(entitlements.canonicalTier).toBe('starter');
    expect(entitlements.coachAccess).toBe('none');
    expect(entitlements.programAccess).toBe('full');
  });
});

describe('coach entitlements', () => {
  it('reads the coach columns when the row grants more than the baseline', () => {
    const entitlements = entitlementsForPlan(
      plan({ tier: 'coach', coachAccess: 'priority', formReviews: true }),
    );

    expect(entitlements.coachAccess).toBe('priority');
    expect(entitlements.formReviews).toBe(true);
  });

  it('never lets a row grant less coach access than its tier', () => {
    const entitlements = entitlementsForPlan(plan({ tier: 'pro_coaching', coachAccess: 'none' }));

    expect(entitlements.coachAccess).toBe('priority');
    expect(entitlements.formReviews).toBe(true);
    expect(entitlements.scheduledCheckIns).toBe(true);
  });

  it('states a response expectation for every tier, so the paywall can show it', () => {
    for (const tier of ['free', 'starter', 'coach', 'pro_coaching', 'pro', 'elite']) {
      expect(entitlementsForPlan(plan({ tier: tier as PlanRow['tier'] })).coachResponseExpectation)
        .toBeTruthy();
    }
  });

  it('limits Free to a workout preview', () => {
    expect(FREE_ENTITLEMENTS.programAccess).toBe('preview');
    expect(FREE_ENTITLEMENTS.coachAccess).toBe('none');
  });
});

describe('subscription status', () => {
  it('falls back to Free with no subscription row', () => {
    expect(entitlementsForSubscription(null)).toEqual(FREE_ENTITLEMENTS);
  });

  it('resolves an active subscription through its plan', () => {
    const entitlements = entitlementsForSubscription({
      status: 'active',
      plan: plan({ tier: 'coach', name: 'Coach', priceCents: 2900, deviceLimit: 3, aiLogLimit: UNLIMITED }),
    });

    expect(entitlements.coachAccess).toBe('messaging');
    expect(entitlements.priceCents).toBe(2900);
  });

  it('drops a canceled subscription to Free entitlements but keeps the tier visible', () => {
    const entitlements = entitlementsForSubscription({
      status: 'canceled',
      plan: plan({ tier: 'pro_coaching', name: 'Pro Coaching' }),
    });

    expect(entitlements.status).toBe('canceled');
    expect(entitlements.tier).toBe('pro_coaching');
    expect(entitlements.coachAccess).toBe('none');
    expect(entitlements.programAccess).toBe('preview');
  });
});

describe('gates that existed before the pivot', () => {
  it('still caps devices at the plan row value', () => {
    const entitlements = entitlementsForPlan(plan({ tier: 'starter', deviceLimit: 3 }));

    expect(canRegisterDevice(entitlements, 2)).toBe(true);
    expect(canRegisterDevice(entitlements, 3)).toBe(false);
  });

  it('treats a negative limit as unlimited', () => {
    const entitlements = entitlementsForPlan(
      plan({ tier: 'pro_coaching', deviceLimit: UNLIMITED, aiLogLimit: UNLIMITED }),
    );

    expect(canRegisterDevice(entitlements, 99)).toBe(true);
    expect(canLogWithAi(entitlements, 99)).toBe(true);
  });

  it('still caps AI logs at the plan row value', () => {
    const entitlements = entitlementsForPlan(plan({ tier: 'free', aiLogLimit: 5 }));

    expect(canLogWithAi(entitlements, 4)).toBe(true);
    expect(canLogWithAi(entitlements, 5)).toBe(false);
  });

  it('gates workout plans by tier, with legacy plan tiers still resolvable', () => {
    const starter = entitlementsForPlan(plan({ tier: 'starter' }));
    const free = FREE_ENTITLEMENTS;

    expect(canAccessPlanTier(starter, 'free')).toBe(true);
    // A plan published at the legacy `pro` tier is a Starter plan.
    expect(canAccessPlanTier(starter, 'pro')).toBe(true);
    expect(canAccessPlanTier(starter, 'coach')).toBe(false);
    expect(canAccessPlanTier(free, 'starter')).toBe(false);
    expect(canAccessPlanTier(free, 'free')).toBe(true);
  });
});
