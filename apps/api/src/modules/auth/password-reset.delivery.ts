import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * How a reset link reaches the person who asked for it.
 *
 * This project has no email provider wired up, and inventing one here would mean
 * either inventing credentials or pretending a send succeeded. So delivery is a
 * seam with one honest implementation:
 *
 *   - outside production the link is written to the server log, which is what a
 *     developer needs and is exactly as private as the log already is;
 *   - in production, with no transport configured, the attempt is logged at
 *     `error` and the request still answers 202. The alternative — a 500 — would
 *     tell an anonymous caller which addresses have accounts.
 *
 * Wiring a real provider means replacing the body of `send` and nothing else:
 * the token, its digest, expiry and single-use accounting all live in
 * `AuthService` and do not change.
 */
@Injectable()
export class PasswordResetDelivery {
  private readonly logger = new Logger(PasswordResetDelivery.name);

  constructor(private readonly config: ConfigService) {}

  /** Where the link points. The mobile app deep-links this path. */
  private resetUrl(token: string): string {
    const base = (this.config.get<string>('APP_PUBLIC_URL') ?? 'fitforge://').replace(/\/+$/, '');
    return `${base}/reset-password?token=${token}`;
  }

  async send(email: string, token: string): Promise<void> {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const url = this.resetUrl(token);

    if (isProduction) {
      this.logger.error(
        `No email transport is configured, so the password-reset link for ${email} could not be ` +
          'sent. Configure a provider in PasswordResetDelivery.send before relying on this flow.',
      );
      return;
    }

    // Development and test only. Never log the token in production.
    this.logger.log(`Password reset link for ${email}: ${url}`);
  }
}
