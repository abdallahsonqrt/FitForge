import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { parseOrThrow } from '../../common/zod/parse-or-throw';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExerciseImagesService } from './exercise-images.service';
import { uuidParamSchema } from './dto/exercise-video.dto';
import { updateExerciseImageSchema } from './dto/exercise-image.dto';

interface AuthUser {
  id: string;
  role?: string | null;
}

/**
 * `/exercise-images/:id` — an image addressed on its own.
 *
 * Uploads are exercise-scoped (`POST /exercises/:exerciseId/images`) or
 * video-scoped (`POST /exercise-videos/:id/thumbnail`), because an image without
 * something to belong to is not a thing this system stores.
 */
@Controller('exercise-images')
export class ExerciseImagesController {
  constructor(private readonly images: ExerciseImagesService) {}

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.images.get(parseOrThrow(uuidParamSchema, id), {
      includeStorageDetails: user?.role === 'admin',
    });
  }

  /** `PATCH /exercise-images/:id` — kind, alt text, order, visibility. */
  @Patch(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() body: unknown) {
    return this.images.update(
      parseOrThrow(uuidParamSchema, id),
      parseOrThrow(updateExerciseImageSchema, body ?? {}),
    );
  }

  /**
   * `DELETE /exercise-images/:id`
   *
   * Any video using it as a poster frame has its reference cleared by the
   * database rather than being deleted along with it.
   */
  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string) {
    return this.images.remove(parseOrThrow(uuidParamSchema, id));
  }
}
