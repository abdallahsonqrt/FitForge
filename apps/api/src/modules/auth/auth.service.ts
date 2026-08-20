import {
  Injectable,
  Inject,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as argon2 from 'argon2';
import { eq, and, desc, inArray, isNull, ne, sql } from 'drizzle-orm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as schema from '../../database/schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordResetDelivery } from './password-reset.delivery';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { isUnlimited } from '../subscriptions/entitlements';
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  RefreshTokenPayload,
  hashRefreshToken,
  isUuid,
  normalizeEmail,
  refreshTokenMatches,
} from './auth.contract';

/** Everything the caller knows about the client asking for a session. */
export interface SessionContext {
  userAgent: string;
  ip: string;
  /** Client-generated, stable across reinstalls of the same app on one device. */
  deviceId?: string;
  deviceName?: string;
  platform?: string;
}

type AuthUser = typeof schema.users.$inferSelect;
type Transaction = Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Postgres `unique_violation`. */
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

/** How long a password-reset link stays valid. */
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;
  /**
   * An argon2 hash of a value nobody can guess, verified against whenever the
   * address is unknown. Sign-in has to cost the same whether or not the account
   * exists — otherwise "4ms" versus "85ms" answers "is this address registered?"
   * for anyone with a stopwatch. Hashed once at boot, not per request.
   */
  private readonly decoyHash: Promise<string>;

  constructor(
    @Inject('DB_CONNECTION') private db: NodePgDatabase<typeof schema>,
    private jwtService: JwtService,
    configService: ConfigService,
    private loginThrottle: LoginThrottleService,
    /**
     * How many devices this account may hold is a plan entitlement, and there is
     * exactly one resolver for it. Auth used to prune to a hardcoded 5 while the
     * devices module enforced `entitlements.deviceLimit`, so a subscriber
     * entitled to more than five was silently cut back to five by signing in.
     */
    private subscriptions: SubscriptionsService,
    private passwordResetDelivery: PasswordResetDelivery,
  ) {
    // `getOrThrow`, not `get(...) || 'fallback_secret'`: a missing secret must
    // stop the process, not quietly sign every token with a public constant.
    this.refreshSecret = configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.decoyHash = argon2.hash(randomBytes(32).toString('hex'));
    // Nothing awaits this until the first unknown-address login, and an
    // unobserved rejection would take the process down in the meantime.
    this.decoyHash.catch(() => undefined);
  }

  async register(dto: RegisterDto, context: SessionContext) {
    const email = normalizeEmail(dto.email);

    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const hashedPassword = await argon2.hash(dto.password);

    let user: AuthUser;
    try {
      [user] = await this.db
        .insert(schema.users)
        .values({
          email,
          passwordHash: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
        })
        .returning();
    } catch (error) {
      // Two sign-ups for one address can interleave between the check above and
      // this insert; the unique index on `lower(email)` is what actually decides
      // it, and the loser gets the same answer as the sequential case.
      if (isUniqueViolation(error)) {
        throw new BadRequestException('User with this email already exists');
      }
      throw error;
    }

    // Registering signs the account in, so it opens a session exactly the way
    // login does. It used to return a token pair without recording a session,
    // which left the refresh token dead on arrival: new users were signed out
    // the moment their first access token expired, mid-onboarding.
    return this.startSession(user, context);
  }

  async login(dto: LoginDto, context: SessionContext) {
    const email = normalizeEmail(dto.email);
    // Synchronous, and before the first `await`: see `beginAttempt`.
    const gate = this.loginThrottle.beginAttempt(email);

    const user = await this.findByEmail(email);
    const isPasswordValid = await this.verifyPassword(user?.passwordHash, dto.password);

    if (!isPasswordValid) {
      if (gate.throttled) {
        await sleep(gate.delayMs);
        throw new HttpException(
          'Too many failed login attempts. Please try again in a moment.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    this.loginThrottle.recordSuccess(email);
    return this.startSession(user!, context);
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    const tokens = await this.db.transaction(async (tx) => {
      // `FOR UPDATE` serialises two refreshes racing on one session, so a stolen
      // token and the real client cannot both come away with a valid pair.
      const [session] = await tx
        .select()
        .from(schema.devices)
        .where(and(eq(schema.devices.id, payload.sid), eq(schema.devices.userId, payload.sub)))
        .for('update');

      // The presented token has to be the session's *current* one. Rotation
      // replaces it, so a replayed token no longer matches. The comparison is
      // against a digest now — the row never held the token itself.
      if (!session || !refreshTokenMatches(session.refreshTokenHash, refreshToken)) {
        return null;
      }

      const rotated = await this.signTokens(payload.sub, payload.email, session.id);
      await tx
        .update(schema.devices)
        .set({
          refreshTokenHash: hashRefreshToken(rotated.refreshToken),
          lastActive: new Date(),
        })
        .where(eq(schema.devices.id, session.id));

      return rotated;
    });

    if (!tokens) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return tokens;
  }

  /**
   * Ends the caller's own session. Scoping the delete to `userId` is the whole
   * point: keyed on the token alone, anyone holding another user's refresh token
   * could destroy that user's session.
   *
   * The row is found by the *digest* of the presented token, which is what the
   * column holds. `sessionId` is the fallback for a caller that presented no
   * refresh token at all — a web client whose token lives in an `HttpOnly`
   * cookie the request didn't carry, say — and comes from the `sid` claim of the
   * access token that authenticated this request, so it is already the caller's
   * own session and cannot name anyone else's.
   */
  async logout(userId: string, refreshToken?: string, sessionId?: string) {
    if (refreshToken) {
      await this.db
        .delete(schema.devices)
        .where(
          and(
            eq(schema.devices.userId, userId),
            eq(schema.devices.refreshTokenHash, hashRefreshToken(refreshToken)),
          ),
        );
      return { success: true };
    }

    if (sessionId && isUuid(sessionId)) {
      await this.db
        .delete(schema.devices)
        .where(and(eq(schema.devices.userId, userId), eq(schema.devices.id, sessionId)));
      return { success: true };
    }

    throw new BadRequestException('A refresh token is required to log out');
  }

  /**
   * Start a password reset.
   *
   * Always resolves the same way, whether or not the address has an account:
   * anything else — a 404, a different latency, a distinct message — turns this
   * endpoint into an account-existence oracle that anyone can query.
   *
   * Any outstanding tokens for the account are consumed first, so requesting a
   * new link revokes the previous one rather than leaving several live at once.
   */
  async forgotPassword(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const user = await this.findByEmail(email);

    // No account: return silently, having done the same amount of nothing.
    if (!user) return;

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');

    await this.db.transaction(async (tx) => {
      // Supersede whatever was outstanding for this account.
      await tx
        .update(schema.passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(schema.passwordResetTokens.userId, user.id),
            isNull(schema.passwordResetTokens.usedAt),
          ),
        );

      await tx.insert(schema.passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      });
    });

    await this.passwordResetDelivery.send(email, token);
  }

  /**
   * Redeem a reset token.
   *
   * Three things happen together or not at all: the token is marked used, the
   * password is replaced, and **every session for the account is destroyed**.
   * That last part is the point of a reset — someone resetting a password they
   * believe is compromised expects it to end whatever access the attacker had,
   * and leaving the existing refresh tokens alive would not.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
    const passwordHash = await argon2.hash(newPassword);

    const ok = await this.db.transaction(async (tx) => {
      // `FOR UPDATE` so two requests racing on one token cannot both redeem it.
      const [row] = await tx
        .select()
        .from(schema.passwordResetTokens)
        .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
        .for('update');

      if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) return false;

      await tx
        .update(schema.passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(schema.passwordResetTokens.id, row.id));

      await tx
        .update(schema.users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(schema.users.id, row.userId));

      // Every device, including the one doing the reset — the user signs in
      // again with the new password.
      await tx.delete(schema.devices).where(eq(schema.devices.userId, row.userId));

      return true;
    });

    if (!ok) {
      // One message for expired, already-used and never-issued alike: which of
      // the three it was is not the caller's business.
      throw new BadRequestException('This reset link is invalid or has expired.');
    }
  }

  /**
   * Opens (or re-opens) a session for `user` and issues the pair bound to it.
   *
   * The single path shared by `register()` and `login()`. They drifted apart
   * once already — register minting tokens no session backed — and a shared
   * function is the only thing that stops that happening again.
   */
  private async startSession(user: AuthUser, context: SessionContext) {
    const deviceKey = this.resolveDeviceKey(context);
    const now = new Date();
    // Resolved before the transaction opens: it is a read of another user's own
    // subscription rows and has no business holding session locks while it runs.
    const deviceLimit = (await this.subscriptions.getEntitlements(user.id)).deviceLimit;

    return this.db.transaction(async (tx) => {
      // Two sign-ins for one account racing each other both insert a row neither
      // can see, and then both prune — so the cap is briefly exceeded, and the
      // two DELETEs can lock the surplus rows in opposite orders and deadlock.
      // One advisory lock per user, released with the transaction, makes session
      // creation serial per account and costs nothing to anyone else.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}::text)::bigint)`);

      // Upsert, not insert: signing in again on a device the user already has is
      // the same session, not a new one. Inserting per login is what let four
      // sign-ins on one laptop push a user's phone past the device cap.
      const [session] = await tx
        .insert(schema.devices)
        .values({
          userId: user.id,
          deviceId: deviceKey,
          deviceName: context.deviceName ?? null,
          platform: context.platform ?? null,
          userAgent: context.userAgent || null,
          ipAddress: context.ip || null,
          lastActive: now,
        })
        .onConflictDoUpdate({
          target: [schema.devices.userId, schema.devices.deviceId],
          set: {
            // A client that omits the friendly name must not erase one an
            // earlier sign-in supplied.
            deviceName: sql`coalesce(excluded.device_name, ${schema.devices.deviceName})`,
            platform: sql`coalesce(excluded.platform, ${schema.devices.platform})`,
            userAgent: context.userAgent || null,
            ipAddress: context.ip || null,
            lastActive: now,
          },
        })
        .returning({ id: schema.devices.id });

      // The session id is a token claim, so the row has to exist before the
      // tokens can be signed — hence issue-then-store rather than one insert.
      const tokens = await this.signTokens(user.id, user.email, session.id);
      await tx
        .update(schema.devices)
        .set({ refreshTokenHash: hashRefreshToken(tokens.refreshToken) })
        .where(eq(schema.devices.id, session.id));

      await this.pruneSessions(tx, user.id, session.id, deviceLimit);

      return tokens;
    });
  }

  /**
   * Keeps the newest `deviceLimit` devices and drops the rest.
   *
   * `deviceLimit` is the plan entitlement — the same number `DevicesService` and
   * `DeviceLimitGuard` enforce, and the same one the app shows as "3 of 3
   * devices in use". It used to be a constant 5 here, which both under-served
   * subscribers entitled to more and contradicted the ceiling every other part
   * of the product quoted.
   *
   * Signing in evicts rather than refuses, deliberately: the ceiling must never
   * be able to lock somebody out of a new phone, and "you were signed out on
   * your least recently used device" is the behaviour the limit describes.
   * Registering for push, which is not a sign-in, refuses instead.
   *
   * One statement, inside the caller's transaction: the previous read-all-then-
   * delete-in-a-loop could interleave with a concurrent sign-in and evict a
   * session that had just been created.
   */
  private async pruneSessions(
    tx: Transaction,
    userId: string,
    keepId: string,
    deviceLimit: number,
  ) {
    // `-1` is the plans table's way of writing "no ceiling".
    if (isUnlimited(deviceLimit)) return;

    const surplus = tx
      .select({ id: schema.devices.id })
      .from(schema.devices)
      .where(eq(schema.devices.userId, userId))
      // `id` breaks ties: two rows can share a `last_active` to the microsecond,
      // and a non-deterministic order here means a non-deterministic eviction.
      .orderBy(desc(schema.devices.lastActive), desc(schema.devices.createdAt), desc(schema.devices.id))
      // A misconfigured limit of 0 would otherwise delete the session it just
      // issued tokens for, signing the user out as they sign in.
      .offset(Math.max(deviceLimit, 1));

    await tx.delete(schema.devices).where(
      and(
        eq(schema.devices.userId, userId),
        // Belt and braces with the ordering above: the session this login just
        // opened is never the one evicted to make room for it.
        ne(schema.devices.id, keepId),
        inArray(schema.devices.id, surplus),
      ),
    );
  }

  /**
   * Which `devices` row this client owns.
   *
   * A client that sends its own identifier gets one row per install. One that
   * sends nothing — a curl script, an old app build — is fingerprinted from its
   * user agent instead, so it still lands on a single row. The IP is
   * deliberately not part of the fingerprint: phones change network constantly,
   * and a key that moves with the network is no better than no key at all.
   */
  private resolveDeviceKey(context: SessionContext): string {
    const provided = context.deviceId?.trim();
    if (provided) return provided.slice(0, 255);

    const fingerprint = createHash('sha256').update(context.userAgent || 'unknown').digest('hex');
    return `ua:${fingerprint.slice(0, 32)}`;
  }

  private async findByEmail(email: string) {
    // Matched through `lower(...)` so the case a user typed never decides
    // whether they can sign in — and so the query uses `users_email_lower_idx`.
    return this.db.query.users.findFirst({
      where: sql`lower(${schema.users.email}) = ${email}`,
    });
  }

  /**
   * Verifies a password in the same time whether or not the account exists.
   * `hash` is undefined for an unknown address, or null for an account with no
   * local password (social sign-in) — both verify against the decoy and fail.
   */
  private async verifyPassword(hash: string | null | undefined, password: string) {
    const target = hash || (await this.decoyHash);
    try {
      const matches = await argon2.verify(target, password);
      return Boolean(hash) && matches;
    } catch {
      // A corrupt stored hash is a failed login, not a 500.
      return false;
    }
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload?.typ !== 'refresh' || !isUuid(payload.sub) || !isUuid(payload.sid)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return payload;
  }

  private async signTokens(userId: string, email: string, sessionId: string) {
    const base = { sub: userId, email, sid: sessionId };

    // A fresh `jti` on each token, so no two are ever the same string. Without
    // it, anything minted for one session inside the same second collides: the
    // refresh token because `refresh()` then rotates a token to itself, the
    // access token because a refresh would hand back one with no extra life on
    // it. `iat` alone cannot separate them — it counts whole seconds.
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...base, typ: 'access', jti: randomUUID() },
        { expiresIn: ACCESS_TOKEN_TTL },
      ),
      this.jwtService.signAsync(
        { ...base, typ: 'refresh', jti: randomUUID() },
        { expiresIn: REFRESH_TOKEN_TTL, secret: this.refreshSecret },
      ),
    ]);

    return { accessToken, refreshToken };
  }
}
