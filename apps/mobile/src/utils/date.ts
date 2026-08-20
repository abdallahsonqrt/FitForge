/** `YYYY-MM-DD` in the device's local timezone — what the API's `:date` params expect. */
export const toDateKey = (date: Date = new Date()): string => {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
};

export const todayKey = (): string => toDateKey();

/**
 * `dateKey` as an ISO datetime for endpoints validating `z.string().datetime()`.
 *
 * Anchored at noon UTC, not local midnight: the API stores these by slicing the
 * first 10 characters, so local midnight east of UTC would truncate to the
 * previous day and the entry would be filed against the wrong date.
 */
export const dateKeyToIso = (dateKey: string): string => `${dateKey}T12:00:00.000Z`;

/** Today as an ISO datetime safe to send to any date-slicing endpoint. */
export const todayIso = (): string => dateKeyToIso(todayKey());

export const daysAgoKey = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateKey(date);
};

export const relativeDayLabel = (input: string | Date): string => {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';

  const diffDays = Math.round(
    (new Date(toDateKey()).getTime() - new Date(toDateKey(date)).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
