import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parseOrThrow } from '../../common/zod/parse-or-throw';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExerciseVideosService } from './exercise-videos.service';
import { ExerciseImagesService } from './exercise-images.service';
import { UploadedFile } from './media-file.util';
import {
  createUploadUrlSchema,
  uploadExerciseVideoSchema,
  uuidParamSchema,
  videoKindSchema,
} from './dto/exercise-video.dto';
import {
  listExerciseImagesSchema,
  uploadExerciseImageSchema,
} from './dto/exercise-image.dto';

interface AuthUser {
  id: string;
  role?: string | null;
}

/** See `ExerciseVideosController` — the real limit is configurable and enforced downstream. */
const MULTIPART_HARD_LIMIT_BYTES = 200 * 1024 * 1024;

/**
 * `/exercises/:exerciseId/…` — the media belonging to one exercise.
 *
 * Anything addressed by *media* id lives on `/exercise-videos` and
 * `/exercise-images`; this controller only covers "the videos of this exercise"
 * and the two ways to add one.
 */
@Controller('exercises/:exerciseId')
export class ExerciseMediaController {
  constructor(
    private readonly videos: ExerciseVideosService,
    private readonly images: ExerciseImagesService,
  ) {}

  /** `GET /exercises/:exerciseId/videos?kind=primary` */
  @Get('videos')
  async listVideos(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId') exerciseId: string,
    @Query('kind') kind?: string,
  ) {
    const admin = isAdmin(user);

    return this.videos.listForExercise(
      parseOrThrow(uuidParamSchema, exerciseId),
      {
        kind: kind ? parseOrThrow(videoKindSchema, kind) : undefined,
        // Only an admin has any use for a pending or failed upload.
        includeUnready: admin,
      },
      { includeStorageDetails: admin },
    );
  }

  /**
   * `POST /exercises/:exerciseId/videos` — multipart upload through the API.
   *
   * The whole pipeline in one request: validate the bytes, probe the video, store
   * it, cut a thumbnail, record the metadata, return the result. Right for the
   * short clips this library holds; for anything large, use `videos/upload-url`.
   */
  @Post('videos')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES } }))
  async uploadVideo(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId') exerciseId: string,
    @UploadedFileParam() file: UploadedFile | undefined,
    @Body() body: Record<string, string>,
  ) {
    return this.videos.upload(
      parseOrThrow(uuidParamSchema, exerciseId),
      file,
      parseOrThrow(uploadExerciseVideoSchema, body ?? {}),
      user.id,
    );
  }

  /**
   * `POST /exercises/:exerciseId/videos/upload-url` — reserve a row and get a
   * signed PUT URL.
   *
   * The bytes go straight from the admin's browser to the bucket, so a large file
   * never occupies this process. Finish with
   * `POST /exercise-videos/:id/complete`, which verifies what landed.
   */
  @Post('videos/upload-url')
  @Roles('admin')
  async createUploadUrl(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId') exerciseId: string,
    @Body() body: unknown,
  ) {
    return this.videos.createDirectUploadUrl(
      parseOrThrow(uuidParamSchema, exerciseId),
      parseOrThrow(createUploadUrlSchema, body ?? {}),
      user.id,
    );
  }

  /** `GET /exercises/:exerciseId/images?kind=thumbnail` */
  @Get('images')
  async listImages(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId') exerciseId: string,
    @Query() query: Record<string, string>,
  ) {
    const parsed = parseOrThrow(listExerciseImagesSchema, query);

    return this.images.listForExercise(parseOrThrow(uuidParamSchema, exerciseId), parsed.kind, {
      includeStorageDetails: isAdmin(user),
    });
  }

  /**
   * `POST /exercises/:exerciseId/images` — any exercise still: a hand-made poster,
   * a preview GIF, an anatomical illustration.
   */
  @Post('images')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES } }))
  async uploadImage(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId') exerciseId: string,
    @UploadedFileParam() file: UploadedFile | undefined,
    @Body() body: Record<string, string>,
  ) {
    return this.images.upload(
      parseOrThrow(uuidParamSchema, exerciseId),
      file,
      parseOrThrow(uploadExerciseImageSchema, body ?? {}),
      user.id,
    );
  }
}

const isAdmin = (user: AuthUser | undefined): boolean => user?.role === 'admin';
