import { Injectable, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../../database/schema';
import { and, eq } from 'drizzle-orm';
import { AccessTokenPayload, isUuid } from '../auth.contract';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @Inject('DB_CONNECTION') private db: NodePgDatabase<typeof schema>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Access tokens only. Refresh tokens are signed with a different secret and
      // fail here before `validate` is ever reached.
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: AccessTokenPayload) {
    // Tokens minted before the access/refresh split carry no `typ` or `sid`.
    // They are rejected rather than trusted; the client re-authenticates.
    if (payload?.typ !== 'access' || !isUuid(payload.sub) || !isUuid(payload.sid)) {
      return null;
    }

    const [user, session] = await Promise.all([
      this.db.query.users.findFirst({
        where: eq(schema.users.id, payload.sub),
      }),
      // Bound to a session, so revocation is immediate: logging out deletes the
      // `devices` row and the access token stops working on the next request
      // instead of lingering for the rest of its 15 minutes. This costs one
      // indexed primary-key lookup, issued in parallel with the user load that
      // every authenticated request already performs.
      this.db.query.devices.findFirst({
        columns: { id: true },
        where: and(eq(schema.devices.id, payload.sid), eq(schema.devices.userId, payload.sub)),
      }),
    ]);

    if (!user || !session) {
      return null;
    }

    const { passwordHash, ...result } = user as any;
    // `sid` rides along on `request.user` so a handler can act on *the session
    // that authenticated this request* without asking the client which one it
    // is: logging out a browser whose refresh token is in an HttpOnly cookie the
    // request didn't carry, and attaching a push token to the device the caller
    // is signed in on rather than inventing a second row for it. It is not part
    // of any response — `/users/me` is served from `UsersService`, not from here.
    return { ...result, sid: payload.sid };
  }
}
