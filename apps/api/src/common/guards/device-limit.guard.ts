import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import { DB_CONNECTION } from '../../database/database.provider';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';
import { SubscriptionsService } from '../../modules/subscriptions/subscriptions.service';
import { canRegisterDevice } from '../../modules/subscriptions/entitlements';

/**
 * Blocks a route once the caller is at their plan's device ceiling.
 *
 * The ceiling used to be a hardcoded 3 here, a hardcoded 5 in `DevicesService`,
 * and a *third* hardcoded 5 in `AuthService`'s session pruning. All three now
 * read `deviceLimit` off the entitlements resolver, so there is one answer to
 * "how many devices does this plan cover?" — and the rows being counted are one
 * kind of thing, since push registration no longer adds a row of its own
 * (see `DevicesService`).
 *
 * Not currently applied to any route; it exists so that a route which must
 * *refuse* at the ceiling has something to use. Sign-in deliberately does not:
 * it evicts the least recently used device instead, because a device cap that
 * can lock you out of a new phone is a support ticket, not a feature.
 */
@Injectable()
export class DeviceLimitGuard implements CanActivate {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return true;

    const userDevices = await this.db
      .select({ id: schema.devices.id })
      .from(schema.devices)
      .where(eq(schema.devices.userId, user.id));

    const entitlements = await this.subscriptions.getEntitlements(user.id);
    if (!canRegisterDevice(entitlements, userDevices.length)) {
      throw new ForbiddenException(
        `Your ${entitlements.planName} plan covers ${entitlements.deviceLimit} device${
          entitlements.deviceLimit === 1 ? '' : 's'
        }.`,
      );
    }

    return true;
  }
}
