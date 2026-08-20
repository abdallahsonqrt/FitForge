import { BadRequestException } from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';

/**
 * Validate a loose value and report the first specific message.
 *
 * Query strings and multipart fields arrive as untyped string maps rather than a
 * JSON body, which is exactly the case `ZodValidationPipe` cannot be attached to.
 * A single failing rule ("fileSize must be the byte length of the file") is more
 * use to the caller than a generic "Validation failed".
 *
 * The field path is prefixed when zod supplies one. Without it a missing field
 * reported only "Required", which names no field and so tells the client nothing
 * it can act on — the message is the whole error here, unlike the pipe, which
 * returns a path/message pair per issue.
 */
export function parseOrThrow<T>(schema: ZodType<T, ZodTypeDef, any>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join('.');
    throw new BadRequestException(path ? `${path}: ${issue.message}` : issue.message);
  }
  return parsed.data;
}
