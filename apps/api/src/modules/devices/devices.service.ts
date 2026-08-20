import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { canRegisterDevice } from '../subscriptions/entitlements';

/**
 * The device registry.
 *
 * ─── What a "device" is ──────────────────────────────────────────────
 *
 * One `devices` row is one device belonging to one user, identified by
 * `device_id` — the client-generated identifier the app also sends to
 * `/auth/login`. A row is created by signing in. Registering for push
 * notifications does not create a row; it attaches a `push_token` to the row the
 * caller already has.
 *
 * That is the reconciliation. Before it, sign-in keyed rows on `deviceId` while
 * push registration keyed them on `deviceToken` — two identifier spaces sharing
 * one column, so a single phone occupied two rows and consumed two slots of its
 * owner's device limit.
 *
 * ─── How many a user may have ────────────────────────────────────────
 *
 * `entitlements.deviceLimit`, resolved through `SubscriptionsService`, and
 * nowhere else. `AuthService` prunes to the same number and `DeviceLimitGuard`
 * gates on it; the hardcoded 5 that used to live in auth is gone.
 *
 * The two entry points enforce it differently, on purpose. Signing in *evicts*
 * the least recently used device, because a ceiling must never be able to lock
 * someone out of a new phone. Registering for push *refuses*, because it is not
 * a sign-in and there is nothing to make room for — and in practice it never
 * reaches the ceiling anyway, since it attaches to a row that already exists.
 */
@Injectable()
export class DevicesService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /**
   * Columns that never leave the server: `refreshTokenHash` authenticates the
   * session, and `pushToken` is an address someone else's notifications could be
   * sent to. Neither has any use in a client.
   */
  private static readonly PUBLIC_COLUMNS = {
    refreshTokenHash: false,
    pushToken: false,
  } as const;

  async getDevices(userId: string) {
    return this.db.query.devices.findMany({
      where: eq(schema.devices.userId, userId),
      columns: DevicesService.PUBLIC_COLUMNS,
    });
  }

  /**
   * Registers (or refreshes) the push address for one device.
   *
   * `sessionId` is the `sid` of the access token that authenticated the request
   * — the row for the device the caller is signed in on. It is the target unless
   * the client names a different `deviceId` explicitly.
   */
  async registerDevice(userId: string, data: RegisterDeviceDto, sessionId?: string) {
    const attributes = {
      platform: data.deviceType,
      deviceName: data.deviceName || undefined,
      pushToken: data.deviceToken,
      lastActive: new Date(),
    };

    // No `deviceId` given: attach to the session that authenticated this call.
    // This is the normal path for the mobile app, and it is what guarantees a
    // phone never ends up with a second row.
    if (!data.deviceId) {
      if (!sessionId) {
        throw new BadRequestException('deviceId is required for this client');
      }

      const [updated] = await this.db
        .update(schema.devices)
        .set(stripUndefined(attributes))
        .where(and(eq(schema.devices.id, sessionId), eq(schema.devices.userId, userId)))
        .returning();

      if (!updated) {
        // The session was revoked between authenticating and getting here.
        throw new BadRequestException('Device not found or not owned by user');
      }

      return this.present(updated);
    }

    const existing = await this.db.query.devices.findFirst({
      where: and(eq(schema.devices.userId, userId), eq(schema.devices.deviceId, data.deviceId)),
    });

    if (existing) {
      const [updated] = await this.db
        .update(schema.devices)
        .set(stripUndefined(attributes))
        .where(eq(schema.devices.id, existing.id))
        .returning();
      return this.present(updated);
    }

    // Only a genuinely new device is measured against the ceiling — the count is
    // of rows, which is now the count of devices, because push registration no
    // longer adds one of its own.
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.devices)
      .where(eq(schema.devices.userId, userId));

    const entitlements = await this.subscriptions.getEntitlements(userId);
    if (!canRegisterDevice(entitlements, count)) {
      throw new BadRequestException(
        `Your ${entitlements.planName} plan covers ${entitlements.deviceLimit} device${
          entitlements.deviceLimit === 1 ? '' : 's'
        }. Remove an existing device or upgrade your plan.`,
      );
    }

    const [device] = await this.db
      .insert(schema.devices)
      .values({
        userId,
        deviceId: data.deviceId,
        platform: data.deviceType,
        deviceName: data.deviceName || 'Unknown Device',
        pushToken: data.deviceToken,
      })
      .returning();

    return this.present(device);
  }

  async removeDevice(userId: string, id: string) {
    const [deleted] = await this.db.delete(schema.devices)
      .where(and(eq(schema.devices.id, id), eq(schema.devices.userId, userId)))
      .returning();

    if (!deleted) {
      throw new BadRequestException('Device not found or not owned by user');
    }

    return { success: true };
  }

  /** `.returning()` hands back every column, including the two that must not leave. */
  private present(device: typeof schema.devices.$inferSelect) {
    const { refreshTokenHash, pushToken, ...rest } = device;
    return rest;
  }
}

/** A field the client omitted must not erase one an earlier call supplied. */
const stripUndefined = <T extends Record<string, unknown>>(values: T) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as T;
