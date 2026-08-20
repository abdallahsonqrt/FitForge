import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';

/**
 * Registering a device for push notifications.
 *
 * `deviceToken` is the push address — an APNs/FCM/Expo token. It is *not* an
 * identifier for the device, and it used to be written into `devices.device_id`,
 * which is the column sign-in keys on. Two different identifier spaces in one
 * column meant one phone held two rows and counted twice against its owner's
 * device limit.
 *
 * `deviceId` is the same client-generated identifier the app sends to
 * `/auth/login`, so push registration lands on the row that phone already owns.
 * Optional, because a client that omits it is served by the session its access
 * token belongs to — which is that same row.
 */
export const RegisterDeviceDtoSchema = z.object({
  deviceToken: z.string().min(1).max(512),
  deviceType: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().max(255).optional(),
  deviceId: z.string().min(1).max(255).optional(),
});

/**
 * A `createZodDto` class, not a bare `z.infer` type: the global `ZodValidationPipe`
 * only validates DTO *classes*, so the previous type-only export meant this body
 * reached the service unchecked — any shape at all, straight into an insert.
 */
export class RegisterDeviceDto extends createZodDto(RegisterDeviceDtoSchema) {}
