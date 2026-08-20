import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Is `value` a real `YYYY-MM-DD` calendar date?
 *
 * The shape check alone is not enough: `2026-13-45` matches the pattern and is
 * still rejected by Postgres' `date` type, which is exactly the input that used
 * to surface as a 500. Round-tripping through `Date.UTC` catches the impossible
 * ones — month 13, day 45, 31 February — because the constructor normalises them
 * to a different day than the one asked for.
 */
export const isDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

/**
 * `@Param('date', ParseDateParamPipe)` — the date counterpart of `ParseUUIDPipe`.
 *
 * Routes such as `GET /water/:date` compare the parameter against a Postgres
 * `date` column, so anything that is not a real calendar date reaches the driver
 * and comes back as a 500. A client typo is a client error; answer it with a 400.
 */
@Injectable()
export class ParseDateParamPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (!isDateKey(value)) {
      throw new BadRequestException('Date must be a real calendar date in YYYY-MM-DD format.');
    }
    return value;
  }
}
