import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';
import { ZodValidationException } from 'nestjs-zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: any, metadata: ArgumentMetadata) {
    if (metadata.type === 'custom' || !this.schema) {
        return value;
    }
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        /**
         * The same exception `createZodDto` routes raise, so both validation
         * paths produce identical responses.
         *
         * A plain `BadRequestException({ message, errors })` looked equivalent
         * but was not: the exception filter reads only `.message` off the
         * response body, so the `errors` array was dropped and every route
         * using this pipe returned the bare string "Validation failed" with
         * nothing for the client to attach to a field.
         */
        throw new ZodValidationException(error);
      }
      throw new BadRequestException('Validation failed');
    }
  }
}
