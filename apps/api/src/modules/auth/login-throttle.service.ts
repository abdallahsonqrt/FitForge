import { Injectable, Logger } from '@nestjs/common';

/** Consecutive failures an account may collect before backoff starts. */
const FAILURE_THRESHOLD = 10;
/** First backoff step; each further failure doubles it. */
const BASE_BACKOFF_MS = 200;
/** Ceiling, so a wrong password never hangs a request for minutes. */
const MAX_BACKOFF_MS = 5_000;
/** An account that has not failed for this long starts from zero again. */
const FAILURE_WINDOW_MS = 15 * 60_000;
/** Entries are keyed by attacker-supplied text, so the map needs a ceiling. */
const MAX_TRACKED_ACCOUNTS = 50_000;

interface AttemptState {
  failures: number;
  lastAttemptAt: number;
}

export interface AttemptGate {
  /** Consecutive failures including the attempt being made. */
  failures: number;
  /** True once the account is past the threshold. */
  throttled: boolean;
  /** How long a *failed* attempt should be held before answering. */
  delayMs: number;
}

/**
 * Per-account brute-force backoff.
 *
 * The per-IP `ThrottlerGuard` on the auth routes stops one host from flooding;
 * it does nothing about a botnet spreading guesses for one account across
 * thousands of addresses. This counts consecutive failures per identity instead,
 * so the cost grows with the attack rather than with any single source.
 *
 * Two properties matter as much as the throttling itself:
 *
 *   - **A correct password always wins.** The gate is consulted only after the
 *     credentials have been checked, and a success clears the counter. There is
 *     no state in which a legitimate user is locked out of their own account,
 *     which is what separates backoff from a lockout an attacker can weaponise
 *     as denial of service.
 *   - **Unknown addresses are counted too.** Tracking only real accounts would
 *     reintroduce the enumeration oracle that the constant-time verify closes.
 *
 * State is in-process and therefore resets on restart and is not shared between
 * instances. That is the deliberate trade-off against pulling in Redis: the
 * counter is a speed bump layered under the per-IP limit, not the last line of
 * defence, and a per-instance counter still costs a distributed attacker most of
 * its throughput. Moving it to a shared store means swapping this Map for the
 * `ThrottlerStorage` interface — nothing outside this class changes.
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);
  private readonly attempts = new Map<string, AttemptState>();

  /**
   * Records an attempt *before* its outcome is known and reports whether this
   * one should be held back if it fails.
   *
   * Counting up-front rather than on failure is what makes the gate work under
   * a parallel burst: the increment is synchronous, so thirty simultaneous
   * requests take thirty distinct counts instead of all reading the same stale
   * value while the password hashing they are waiting on runs.
   */
  beginAttempt(key: string): AttemptGate {
    const now = Date.now();
    this.evictStale(now);

    const previous = this.attempts.get(key);
    const expired = !previous || now - previous.lastAttemptAt > FAILURE_WINDOW_MS;
    const failures = (expired ? 0 : previous.failures) + 1;
    this.attempts.set(key, { failures, lastAttemptAt: now });

    if (failures <= FAILURE_THRESHOLD) {
      return { failures, throttled: false, delayMs: 0 };
    }

    const delayMs = Math.min(BASE_BACKOFF_MS * 2 ** (failures - FAILURE_THRESHOLD - 1), MAX_BACKOFF_MS);
    return { failures, throttled: true, delayMs };
  }

  /** Clears the counter — the caller proved they own the account. */
  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  /**
   * Drops entries that have aged out, and — should a flood of distinct
   * addresses outrun that — the whole map rather than the process's memory.
   */
  private evictStale(now: number): void {
    if (this.attempts.size < MAX_TRACKED_ACCOUNTS) return;

    for (const [key, state] of this.attempts) {
      if (now - state.lastAttemptAt > FAILURE_WINDOW_MS) this.attempts.delete(key);
    }

    if (this.attempts.size >= MAX_TRACKED_ACCOUNTS) {
      this.logger.warn(
        `Login attempt table hit ${MAX_TRACKED_ACCOUNTS} live entries — clearing it. ` +
          'This means a spray across many addresses; the per-IP limit is now the only brake.',
      );
      this.attempts.clear();
    }
  }
}
