import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';
import { deviceFields } from './device.schema';

const LoginSchema = z.object({
  // 254 is the longest deliverable address (RFC 5321) and the `users.email`
  // column holds 255 — bounding it here turns an absurd address into a 400
  // instead of a database error, and keeps argon2 off megabyte-sized input.
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024),
  ...deviceFields,
});

export class LoginDto extends createZodDto(LoginSchema) {}
