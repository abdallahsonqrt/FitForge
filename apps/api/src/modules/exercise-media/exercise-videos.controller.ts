import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ZodType, ZodTypeDef } from 'zod';
import { parseOrThrow } from '../../common/zod/parse-or-throw';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExerciseVideosService } from './exercise-videos.service';
import { UploadedFile } from './media-file.util';
import {
  completeUploadSchema,
  listExerciseVideosSchema,
  playbackUrlSchema,
  updateExerciseVideoSchema,
  uuidParamSchema,
} from './dto/exercise-video.dto';
import { uploadVideoThumbnailSchema } from './dto/exercise-image.dto';

/** The authenticated user row, as attached by `JwtStrategy`. */
interface AuthUser {
  id: string;
  role?: string | null;
}

/**
 * Hard ceiling multer will buffer. The real, configurable limit is enforced by
 * `MediaValidationService`; this only stops a hostile request from filling memory
 * before any of our code runs.
 */
const MULTIPART_HARD_LIMIT_BYTES = 200 * 1024 * 1024;

/**
 * `/exercise-videos` — everything addressed by video id.
 *
 * Reads are open to any signed-in user; every write carries `@Roles('admin')`,
 * enforced by the globally registered `RolesGuard`. Uploading media is a
 * content-management action, not something a member of the app can do.
 */
@Controller('exercise-videos')
export class ExerciseVideosController {
  constructor(private readonly videos: ExerciseVideosService) {}

  /**
   * `GET /exercise-videos?exerciseId=…&kind=primary&limit=25&offset=0`
   *
   * Admins see every row including half-finished uploads; everyone else sees only
   * what is ready to play.
   */
  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    const parsed = this.parse(listExerciseVideosSchema, query);
    return this.videos.list(parsed, { includeStorageDetails: isAdmin(user) });
  }

  /** `GET /exercise-videos/:id` */
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.videos.get(this.parseId(id), { includeStorageDetails: isAdmin(user) });
  }

  /**
   * `GET /exercise-videos/:id/playback-url?expiresIn=3600`
   *
   * The endpoint the player calls. Returns a URL served by the bucket — public and
   * cacheable, or signed and expiring — plus the video's shape so the player can
   * size itself before the first frame.
   */
  @Get(':id/playback-url')
  async playbackUrl(@Param('id') id: string, @Query() query: Record<string, string>) {
    const parsed = this.parse(playbackUrlSchema, query);
    return this.videos.createPlaybackUrl(this.parseId(id), parsed);
  }

  /**
   * `GET /exercise-videos/:id/stream` — 302 to the same URL.
   *
   * For players that take a URL and nothing else. The redirect is deliberate: it
   * hands the byte-range conversation to R2 instead of proxying megabytes through
   * this process. The redirect itself must never be cached, because the URL it
   * points at can expire.
   */
  @Get(':id/stream')
  async stream(@Param('id') id: string, @Res() response: Response) {
    const playback = await this.videos.createPlaybackUrl(this.parseId(id));

    response.setHeader('Cache-Control', 'private, no-store');
    return response.redirect(302, playback.url);
  }

  // ─── Admin ────────────────────────────────────────────────

  /**
   * `PATCH /exercise-videos/:id` — kind, label, order and visibility.
   *
   * The file, status and measurements are not editable here: they describe what is
   * actually in the bucket, and only an upload may change them.
   */
  @Patch(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() body: unknown) {
    return this.videos.update(this.parseId(id), this.parse(updateExerciseVideoSchema, body ?? {}));
  }

  /** `PUT /exercise-videos/:id/file` — replace the video, keeping the row. */
  @Put(':id/file')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES } }))
  async replaceFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFileParam() file: UploadedFile | undefined,
  ) {
    return this.videos.replaceFile(this.parseId(id), file, user.id);
  }

  /** `DELETE /exercise-videos/:id` — removes the row, the object and its poster frame. */
  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string) {
    return this.videos.remove(this.parseId(id));
  }

  /**
   * `POST /exercise-videos/:id/complete` — finalise a direct-to-bucket upload.
   *
   * Called after the client has PUT the bytes to the signed URL. The server checks
   * the object exists and matches what was agreed before the row goes `ready`.
   */
  @Post(':id/complete')
  @Roles('admin')
  async complete(@Param('id') id: string, @Body() body: unknown) {
    return this.videos.completeDirectUpload(
      this.parseId(id),
      this.parse(completeUploadSchema, body ?? {}),
    );
  }

  // ─── Thumbnails ───────────────────────────────────────────

  /** `POST /exercise-videos/:id/thumbnail` — attach a poster frame. */
  @Post(':id/thumbnail')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES } }))
  async uploadThumbnail(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFileParam() file: UploadedFile | undefined,
    @Body() body: Record<string, string>,
  ) {
    return this.videos.setThumbnail(
      this.parseId(id),
      file,
      this.parse(uploadVideoThumbnailSchema, body ?? {}),
      user.id,
    );
  }

  /**
   * `PUT /exercise-videos/:id/thumbnail` — replace it.
   *
   * Same operation as the POST: the new image is stored, the video repointed, and
   * the old one deleted. Both verbs exist because clients reasonably expect either.
   */
  @Put(':id/thumbnail')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES } }))
  async replaceThumbnail(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFileParam() file: UploadedFile | undefined,
    @Body() body: Record<string, string>,
  ) {
    return this.videos.setThumbnail(
      this.parseId(id),
      file,
      this.parse(uploadVideoThumbnailSchema, body ?? {}),
      user.id,
    );
  }

  /** `DELETE /exercise-videos/:id/thumbnail` */
  @Delete(':id/thumbnail')
  @Roles('admin')
  async deleteThumbnail(@Param('id') id: string) {
    return this.videos.removeThumbnail(this.parseId(id));
  }

  // ─── Internals ────────────────────────────────────────────

  private parse<T>(schema: ZodType<T, ZodTypeDef, any>, value: unknown): T {
    return parseOrThrow(schema, value);
  }

  private parseId(id: string): string {
    return parseOrThrow(uuidParamSchema, id);
  }
}

const isAdmin = (user: AuthUser | undefined): boolean => user?.role === 'admin';
