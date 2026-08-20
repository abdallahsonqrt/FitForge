// ─── Subscription Types ──────────────────────────────────

import type { CoachAccessLevel } from './coach';

/**
 * `STARTER`, `COACH` and `PRO_COACHING` are the coach-centric ladder; `PRO` and
 * `ELITE` are the original self-guided tiers, kept because existing
 * subscriptions reference them.
 */
export enum SubscriptionTier {
  FREE = 'free',
  PRO = 'pro',
  ELITE = 'elite',
  STARTER = 'starter',
  COACH = 'coach',
  PRO_COACHING = 'pro_coaching',
}

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  deviceLimit: number;
  features: string[];
  isPopular?: boolean;
  /** Level of coach access the tier buys. Absent on the legacy self-guided tiers. */
  coachAccess?: CoachAccessLevel;
  /** May request a coach form-check on an uploaded video. */
  formReviews?: boolean;
  /** Recurring coach check-ins rather than ad-hoc questions. */
  scheduledCheckIns?: boolean;
}

export interface SubscriptionInfo {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  startsAt: string;
  expiresAt?: string;
  isActive: boolean;
  deviceLimit: number;
}

export interface DeviceInfo {
  id: string;
  userId: string;
  deviceName: string;
  deviceType: string;
  platform: 'ios' | 'android' | 'web';
  lastActive: string;
  isActive: boolean;
  createdAt: string;
}

// ─── Subscription Plan Definitions ──────────────────────

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    tier: SubscriptionTier.FREE,
    name: 'Free',
    price: 0,
    currency: 'USD',
    interval: 'month',
    deviceLimit: 1,
    features: [
      '3 basic workout plans',
      'Limited exercise library',
      '5 AI meal logs per day',
      'Basic streak tracking',
      'Water & step tracking',
    ],
  },
  {
    tier: SubscriptionTier.PRO,
    name: 'Pro',
    price: 9.99,
    currency: 'USD',
    interval: 'month',
    deviceLimit: 3,
    isPopular: true,
    features: [
      'All workout plans',
      'Full exercise library',
      '30 AI meal logs per day',
      'Progress photos',
      'All badges & streaks',
      'Workout history analytics',
      'Email support',
    ],
  },
  {
    tier: SubscriptionTier.ELITE,
    name: 'Elite',
    price: 19.99,
    currency: 'USD',
    interval: 'month',
    deviceLimit: -1, // unlimited
    features: [
      'Everything in Pro',
      'Custom workout plans',
      'Unlimited AI meal logs',
      'Video coaching tips',
      'Exclusive badges',
      'Advanced analytics',
      'Priority live chat support',
    ],
  },
];

export const DEVICE_LIMITS: Record<SubscriptionTier, number> = {
  [SubscriptionTier.FREE]: 1,
  [SubscriptionTier.PRO]: 3,
  [SubscriptionTier.ELITE]: -1, // unlimited
  [SubscriptionTier.STARTER]: 2,
  [SubscriptionTier.COACH]: 3,
  [SubscriptionTier.PRO_COACHING]: -1, // unlimited
};
