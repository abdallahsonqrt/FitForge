import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';

/**
 * `refreshToken` is optional in the *body* because a browser client sends it in
 * an `HttpOnly` cookie instead, and a cookie is not a body field. It is not
 * optional in the request: the controller resolves body-then-cookie and rejects
 * a call that carries neither. Native clients are unaffected — they still send
 * it here, and always will.
 */
const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export class RefreshTokenDto extends createZodDto(RefreshTokenSchema) {}
