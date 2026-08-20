import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';

/**
 * `createZodDto` classes, not bare `z.infer` types: the global `nestjs-zod` pipe
 * only validates when the parameter's metatype carries `isZodDto`, so a type
 * alias here would mean these bodies reach the service unchecked.
 */

const ForgotPasswordSchema = z.object({
  email: z.string().email().max(254),
});

export class ForgotPasswordDto extends createZodDto(ForgotPasswordSchema) {}

const ResetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  /** Same floor as registration — a reset must not be a way to weaken a password. */
  password: z.string().min(8).max(1024),
});

export class ResetPasswordDto extends createZodDto(ResetPasswordSchema) {}
