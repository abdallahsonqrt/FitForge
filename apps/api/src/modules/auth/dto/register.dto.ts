import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';
import { deviceFields } from './device.schema';

const RegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(1024),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  ...deviceFields,
});

export class RegisterDto extends createZodDto(RegisterSchema) {}
