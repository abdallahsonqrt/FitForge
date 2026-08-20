import { z } from 'nestjs-zod/z';

/**
 * How a client names itself when it signs in.
 *
 * Optional, because curl and older app builds do not send it — `AuthService`
 * falls back to a user-agent fingerprint. When it *is* sent it is what keeps
 * repeated sign-ins on one phone collapsing into one session row instead of
 * filling the account's five-device budget.
 *
 * Lengths mirror the `devices` columns so an oversized value is a 400 rather
 * than a Postgres "value too long" 500.
 */
export const deviceFields = {
  deviceId: z.string().trim().min(1).max(255).optional(),
  deviceName: z.string().trim().min(1).max(255).optional(),
  platform: z.string().trim().min(1).max(50).optional(),
};
