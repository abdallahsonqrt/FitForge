import { describe, expect, it } from 'vitest';
import { BADGE_RULES, type BadgeFacts } from './badges.service';

/**
 * The badge rules, checked against the descriptions the catalogue ships with
 * (`database/seed.ts`). Each rule is a threshold, so each test pins the value
 * just below it and the value at it — an off-by-one here either withholds a
 * badge someone earned or hands out one they did not.
 */

const facts = (overrides: Partial<BadgeFacts> = {}): BadgeFacts => ({
  workoutCount: 0,
  earlyWorkoutCount: 0,
  lateWorkoutCount: 0,
  mealCount: 0,
  longestStreak: 0,
  weightLostKg: 0,
  ...overrides,
});

const earned = (name: string, input: Partial<BadgeFacts>): boolean =>
  BADGE_RULES[name](facts(input));

describe('badge rules', () => {
  it('awards nothing to a brand-new account', () => {
    const brandNew = facts();
    const anyEarned = Object.values(BADGE_RULES).some((rule) => rule(brandNew));
    expect(anyEarned).toBe(false);
  });

  describe('workout counts', () => {
    it('First Steps needs one workout', () => {
      expect(earned('First Steps', { workoutCount: 0 })).toBe(false);
      expect(earned('First Steps', { workoutCount: 1 })).toBe(true);
    });

    it('Half Century needs 50', () => {
      expect(earned('Half Century', { workoutCount: 49 })).toBe(false);
      expect(earned('Half Century', { workoutCount: 50 })).toBe(true);
    });

    it('Centurion needs 100', () => {
      expect(earned('Centurion', { workoutCount: 99 })).toBe(false);
      expect(earned('Centurion', { workoutCount: 100 })).toBe(true);
    });
  });

  describe('streak milestones', () => {
    /**
     * Read from the *longest* streak, not the current one: "reach a 7-day
     * streak" describes something the user did, and a badge should not be
     * withheld because the streak has since lapsed.
     */
    it('Week Warrior needs a 7-day streak', () => {
      expect(earned('Week Warrior', { longestStreak: 6 })).toBe(false);
      expect(earned('Week Warrior', { longestStreak: 7 })).toBe(true);
    });

    it('Monthly Master needs 30', () => {
      expect(earned('Monthly Master', { longestStreak: 29 })).toBe(false);
      expect(earned('Monthly Master', { longestStreak: 30 })).toBe(true);
    });

    it('Century Club needs 100', () => {
      expect(earned('Century Club', { longestStreak: 99 })).toBe(false);
      expect(earned('Century Club', { longestStreak: 100 })).toBe(true);
    });

    it('keeps a milestone badge after the streak lapses', () => {
      // `longestStreak` survives the reset that zeroes `currentStreak`.
      expect(earned('Week Warrior', { longestStreak: 12 })).toBe(true);
    });
  });

  describe('time-of-day counts', () => {
    it('Early Bird needs 10 early workouts', () => {
      expect(earned('Early Bird', { earlyWorkoutCount: 9 })).toBe(false);
      expect(earned('Early Bird', { earlyWorkoutCount: 10 })).toBe(true);
    });

    it('Night Owl needs 10 late workouts', () => {
      expect(earned('Night Owl', { lateWorkoutCount: 9 })).toBe(false);
      expect(earned('Night Owl', { lateWorkoutCount: 10 })).toBe(true);
    });

    it('does not award Early Bird for late workouts, or the reverse', () => {
      expect(earned('Early Bird', { lateWorkoutCount: 50 })).toBe(false);
      expect(earned('Night Owl', { earlyWorkoutCount: 50 })).toBe(false);
    });
  });

  describe('other milestones', () => {
    it('Transformation needs 5 kg lost', () => {
      expect(earned('Transformation', { weightLostKg: 4.9 })).toBe(false);
      expect(earned('Transformation', { weightLostKg: 5 })).toBe(true);
    });

    it('Meal Master needs 100 meals', () => {
      expect(earned('Meal Master', { mealCount: 99 })).toBe(false);
      expect(earned('Meal Master', { mealCount: 100 })).toBe(true);
    });
  });

  /**
   * Two seeded badges have no rule on purpose — the data to decide them does not
   * exist yet (see the note on `BADGE_RULES`). This pins that as a decision
   * rather than an oversight: if someone adds the missing data and a rule, this
   * test is what tells them to update the list.
   */
  it('leaves Perfect Week and Hydration Hero unimplemented', () => {
    expect(BADGE_RULES['Perfect Week']).toBeUndefined();
    expect(BADGE_RULES['Hydration Hero']).toBeUndefined();
  });

  it('covers the ten badges that can be decided from recorded data', () => {
    expect(Object.keys(BADGE_RULES)).toHaveLength(10);
  });
});
