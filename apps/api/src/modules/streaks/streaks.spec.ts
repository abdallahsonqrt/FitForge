import { describe, expect, it } from 'vitest';
import { STREAK_GRACE_DAYS, nextStreak, todayKey, type StreakState } from './streaks.service';

/**
 * The streak rule, at its edges.
 *
 * These are the cases that decide whether a user keeps or loses a number they
 * care about, and every one of them is a boundary: the day itself, the day
 * after, the last day inside the grace window, and the first day outside it.
 */

const state = (
  currentStreak: number,
  longestStreak: number,
  lastActivityDate: string | null,
): StreakState => ({ currentStreak, longestStreak, lastActivityDate });

describe('nextStreak', () => {
  it('starts a streak at 1 for a user who has never logged anything', () => {
    expect(nextStreak(null, '2026-03-10')).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: '2026-03-10',
    });
  });

  it('starts at 1 when a row exists but has no recorded day', () => {
    expect(nextStreak(state(0, 0, null), '2026-03-10')).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: '2026-03-10',
    });
  });

  it('advances on consecutive days', () => {
    expect(nextStreak(state(4, 9, '2026-03-09'), '2026-03-10')).toEqual({
      currentStreak: 5,
      longestStreak: 9,
      lastActivityDate: '2026-03-10',
    });
  });

  /**
   * The idempotence that makes this a count of *days engaged* rather than of
   * actions taken — three meals in one day is one active day.
   */
  it('does nothing when the day is already counted', () => {
    expect(nextStreak(state(4, 9, '2026-03-10'), '2026-03-10')).toBeNull();
  });

  it('does nothing for a backdated entry', () => {
    // Filling in yesterday's lunch must not rewind today's streak.
    expect(nextStreak(state(4, 9, '2026-03-10'), '2026-03-08')).toBeNull();
  });

  it('survives a gap inside the grace window', () => {
    // One whole day missed, with STREAK_GRACE_DAYS = 1.
    expect(nextStreak(state(6, 6, '2026-03-08'), '2026-03-10')?.currentStreak).toBe(7);
  });

  it('resets once the gap exceeds the grace window', () => {
    // Two whole days missed.
    expect(nextStreak(state(6, 6, '2026-03-07'), '2026-03-10')).toEqual({
      currentStreak: 1,
      longestStreak: 6,
      lastActivityDate: '2026-03-10',
    });
  });

  it('keeps the longest streak when the current one resets', () => {
    const result = nextStreak(state(30, 30, '2026-01-01'), '2026-03-10');
    expect(result?.currentStreak).toBe(1);
    expect(result?.longestStreak).toBe(30);
  });

  it('raises the longest streak as the current one passes it', () => {
    expect(nextStreak(state(9, 9, '2026-03-09'), '2026-03-10')).toEqual({
      currentStreak: 10,
      longestStreak: 10,
      lastActivityDate: '2026-03-10',
    });
  });

  it('treats the grace boundary consistently on both sides', () => {
    const lastDayInside = STREAK_GRACE_DAYS + 1;
    const firstDayOutside = lastDayInside + 1;

    const dayAfter = (base: string, days: number) =>
      new Date(Date.parse(`${base}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

    expect(nextStreak(state(3, 3, '2026-03-01'), dayAfter('2026-03-01', lastDayInside))?.currentStreak).toBe(4);
    expect(nextStreak(state(3, 3, '2026-03-01'), dayAfter('2026-03-01', firstDayOutside))?.currentStreak).toBe(1);
  });

  it('crosses month and year boundaries', () => {
    expect(nextStreak(state(2, 2, '2026-02-28'), '2026-03-01')?.currentStreak).toBe(3);
    expect(nextStreak(state(2, 2, '2025-12-31'), '2026-01-01')?.currentStreak).toBe(3);
  });
});

describe('todayKey', () => {
  it('formats a date as the YYYY-MM-DD the date columns use', () => {
    expect(todayKey(new Date('2026-03-10T13:45:00Z'))).toBe('2026-03-10');
  });
});
