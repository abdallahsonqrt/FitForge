import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';
import { athleteProfileFields } from './athlete-profile.schema';

/**
 * A partial profile edit. Every field is optional and only the ones sent are
 * written, so editing a name never clears the athlete profile and vice versa.
 */
const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  // The client's UI language, so it survives a reinstall and a new device rather
  // than living only in that device's local preferences. Bounded to the column's
  // varchar(10) and to a locale-shaped code — `en`, `ar`, `pt-BR`.
  language: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Must be a locale code such as "en" or "pt-BR"')
    .max(10)
    .optional(),
  ...athleteProfileFields,
});

export class UpdateProfileDto extends createZodDto(UpdateProfileSchema) {}
